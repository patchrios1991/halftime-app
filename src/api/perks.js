// ─── Perks API ────────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { notify }   from "../lib/notify";
import { getCurrentUserId } from "../lib/auth";

/** Fetch all perks for a pod (with bids + bidder profiles) */
export async function getPodPerks(podId) {
  const { data, error } = await supabase
    .from("pod_perks")
    .select("*, perk_bids(id, user_id, credits, won, profiles(display_name, avatar_initials))")
    .eq("pod_id", podId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Captain posts a new perk event */
export async function createPerk(podId, { title, description, eventDate, spots }) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in");

  const { data, error } = await supabase
    .from("pod_perks")
    .insert({
      pod_id:      podId,
      posted_by:   userId,
      title:       title.trim(),
      description: description?.trim() || null,
      event_date:  eventDate || null,
      spots:       parseInt(spots) || 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Member places or updates their bid on a perk */
export async function placePerkBid(perkId, podId, credits) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in");

  if (!credits || credits < 1) throw new Error("Bid must be at least 1 credit");

  const { data: member, error: memberErr } = await supabase
    .from("pod_members")
    .select("bid_credits")
    .eq("pod_id", podId)
    .eq("user_id", userId)
    .single();
  if (memberErr) throw memberErr;

  if ((member?.bid_credits ?? 0) < credits)
    throw new Error(`You only have ${member?.bid_credits ?? 0} bid credits`);

  const { data, error } = await supabase
    .from("perk_bids")
    .upsert(
      { perk_id: perkId, pod_id: podId, user_id: userId, credits },
      { onConflict: "perk_id,user_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Captain closes bidding and awards the perk.
 * Top N bidders win (N = perk.spots). Credits are deducted from winners.
 */
export async function awardPerk(perkId, podId) {
  const captainId = await getCurrentUserId();
  if (!captainId) throw new Error("Must be signed in");

  const { data: pod } = await supabase
    .from("pods").select("captain_id").eq("id", podId).single();
  if (pod?.captain_id !== captainId)
    throw new Error("Only the captain can award perks");

  const { data: perk } = await supabase
    .from("pod_perks").select("spots, title").eq("id", perkId).single();

  const { data: bids, error: bidErr } = await supabase
    .from("perk_bids")
    .select("id, user_id, credits")
    .eq("perk_id", perkId)
    .order("credits", { ascending: false });
  if (bidErr) throw bidErr;
  if (!bids?.length) throw new Error("No bids to award");

  const winners = bids.slice(0, perk.spots);
  const losers  = bids.slice(perk.spots);

  // Mark winners
  if (winners.length) {
    await supabase
      .from("perk_bids").update({ won: true })
      .in("id", winners.map(b => b.id));
  }

  // Deduct credits from each winner and notify them
  for (const w of winners) {
    const { data: m } = await supabase
      .from("pod_members").select("bid_credits")
      .eq("pod_id", podId).eq("user_id", w.user_id).single();

    await supabase
      .from("pod_members")
      .update({ bid_credits: Math.max(0, (m?.bid_credits ?? 0) - w.credits) })
      .eq("pod_id", podId).eq("user_id", w.user_id);

    notify({
      userId: w.user_id,
      type:   "bid_won",
      title:  "🎉 You won a perk!",
      body:   `You won "${perk.title}" with ${w.credits} credits.`,
      url:    "/app",
    });
  }

  // Notify losers (credits refunded — they were never deducted)
  for (const l of losers) {
    notify({
      userId: l.user_id,
      type:   "bid_resolved",
      title:  "Perk awarded",
      body:   `The perk "${perk.title}" was awarded. Your credits were not deducted.`,
      url:    "/app",
    });
  }

  // Close the perk
  await supabase.from("pod_perks").update({ status: "awarded" }).eq("id", perkId);

  return { winners: winners.map(w => w.user_id) };
}

/**
 * Member flags a perk they believe the captain didn't disclose.
 * Notifies the captain with a formal warning.
 */
export async function flagMissingPerk(podId, podName, captainId, note) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in");

  notify({
    userId: captainId,
    type:   "perk_flag",
    title:  "⚠️ Undisclosed perk reported",
    body:   `A member of ${podName} reported a potential undisclosed team perk.${note ? ` Note: "${note}"` : ""} Please post all team member perks to the pod within 48 hours.`,
    url:    "/app",
  });
}

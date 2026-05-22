// ─── Resale API ───────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";

/** List a game for resale */
export async function listGameForResale({ gameId, podId, askPrice }) {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("resale_listings")
    .insert({
      game_id:   gameId,
      pod_id:    podId,
      seller_id: user.id,
      ask_price: askPrice,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Cancel a resale listing */
export async function cancelListing(listingId) {
  const { error } = await supabase
    .from("resale_listings")
    .update({ status: "cancelled" })
    .eq("id", listingId);

  if (error) throw error;
}

/**
 * Complete a resale — mark sold, create payout rows for all pod members.
 * In production this runs via a webhook when payment clears.
 */
export async function completeResale({ listingId, soldPrice, podMembers }) {
  // Mark listing sold
  const { data: listing, error: listingErr } = await supabase
    .from("resale_listings")
    .update({ status: "sold", sold_price: soldPrice, sold_at: new Date().toISOString() })
    .eq("id", listingId)
    .select()
    .single();

  if (listingErr) throw listingErr;

  // Create payout rows for each pod member based on their share
  const netProceeds = soldPrice * 0.92; // after 8% platform fee
  const payoutRows = podMembers.map(m => ({
    listing_id: listingId,
    user_id:    m.user_id,
    share_pct:  m.share_pct,
    amount:     Math.round((netProceeds * m.share_pct / 100) * 100) / 100,
  }));

  const { error: payoutErr } = await supabase
    .from("resale_payouts")
    .insert(payoutRows);

  if (payoutErr) throw payoutErr;
  return { listing, payouts: payoutRows };
}

/** Get all resale listings for a pod */
export async function getResaleListings(podId) {
  const { data, error } = await supabase
    .from("resale_listings")
    .select("*, games(opponent, game_date, face_value), profiles!seller_id(display_name)")
    .eq("pod_id", podId)
    .order("listed_at", { ascending: false });

  if (error) throw error;
  return data;
}

/** Get payouts earned by the current user */
export async function getMyPayouts() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from("resale_payouts")
    .select("*, resale_listings(sold_price, games(opponent, game_date))")
    .eq("user_id", user.id)
    .order("paid_at", { ascending: false });

  if (error) throw error;
  return data;
}

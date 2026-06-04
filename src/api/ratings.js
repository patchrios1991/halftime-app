// ─── Captain Ratings API ──────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import { getCurrentUserId } from "../lib/auth";

/** Submit or update a rating for a pod's captain */
export async function rateCaptain(podId, captainId, score, note = "") {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Must be signed in");
  if (score < 1 || score > 5) throw new Error("Score must be 1–5");

  const { data, error } = await supabase
    .from("captain_ratings")
    .upsert(
      { pod_id: podId, captain_id: captainId, rated_by: userId, score, note: note.trim() || null },
      { onConflict: "pod_id,rated_by" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Get the current user's rating for a specific pod */
export async function getMyRating(podId) {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data } = await supabase
    .from("captain_ratings")
    .select("score, note")
    .eq("pod_id", podId)
    .eq("rated_by", userId)
    .maybeSingle();

  return data;
}

/** Get aggregate rating summary for a captain */
export async function getCaptainRating(captainId) {
  const { data } = await supabase
    .from("captain_rating_summary")
    .select("avg_score, rating_count")
    .eq("captain_id", captainId)
    .maybeSingle();

  return data;
}

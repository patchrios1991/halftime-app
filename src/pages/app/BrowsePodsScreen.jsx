// ─── BrowsePodsScreen ─────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import { useRecruitingPods } from "../../hooks/usePod";
import { joinPod } from "../../api/pods";

export default function BrowsePodsScreen({ dispatch }) {
  const { pods, loading, refresh } = useRecruitingPods();
  const [joining, setJoining]     = useState(null); // podId being joined
  const [error, setError]         = useState(null);
  const [joined, setJoined]       = useState(null); // podId just joined

  async function handleJoin(podId) {
    setError(null);
    setJoining(podId);
    try {
      await joinPod(podId);
      setJoined(podId);
      await refresh();
      // Short delay so user sees the success state, then go to pod screen
      setTimeout(() => dispatch({ type: "SET_SCREEN", screen: "pod" }), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setJoining(null);
    }
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "onboarding" })}
            style={{ color: T.mist, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>‹</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
            Find a Pod
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.mist, marginLeft: 30 }}>
          Open pods recruiting members right now
        </div>
      </div>

      <div style={{ padding: 14 }}>
        {error && (
          <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
            borderRadius: 10, padding: "10px 14px", color: T.red, fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.mist }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 13 }}>Loading pods…</div>
          </div>
        ) : pods.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 6 }}>No open pods yet</div>
            <div style={{ fontSize: 12, color: T.mist, marginBottom: 20, lineHeight: 1.6 }}>
              Be the first — create a pod and invite your people.
            </div>
            <button
              onClick={() => dispatch({ type: "SET_SCREEN", screen: "create_pod" })}
              style={{ padding: "12px 24px", background: T.lime, color: T.dark,
                border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Create a Pod →
            </button>
          </div>
        ) : (
          pods.map(pod => {
            const memberCount = pod.pod_members?.[0]?.count ?? 0;
            const spotsLeft   = (pod.max_members || 6) - memberCount;
            const isJoined    = joined === pod.id;
            const isJoining   = joining === pod.id;

            // Estimate member cost based on equal split of remaining spots
            const estimatedShare = memberCount > 0
              ? Math.round(100 / pod.max_members)
              : 25;
            const estimatedCost = (parseFloat(pod.season_cost) * estimatedShare) / 100;

            return (
              <Card key={pod.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 32 }}>{pod.sport_emoji || "🏀"}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.white,
                        fontFamily: "Georgia,serif" }}>{pod.name}</div>
                      <div style={{ fontSize: 11, color: T.mist }}>
                        {pod.team_name} · {pod.sport} · {pod.season}
                      </div>
                    </div>
                  </div>
                  <Badge color={spotsLeft > 0 ? T.lime : T.amber}>
                    {spotsLeft > 0 ? `${spotsLeft} spots` : "Full"}
                  </Badge>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8, marginBottom: 12 }}>
                  {[
                    { l: "Members",    v: `${memberCount}/${pod.max_members}` },
                    { l: "Season Cost",v: `$${parseFloat(pod.season_cost).toLocaleString()}` },
                    { l: "Est. Share", v: `~$${estimatedCost.toFixed(0)}` },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ background: "#ffffff06", borderRadius: 8,
                      padding: "8px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                        fontFamily: "Georgia,serif" }}>{v}</div>
                      <div style={{ fontSize: 9, color: T.mist }}>{l}</div>
                    </div>
                  ))}
                </div>

                {pod.venue && (
                  <div style={{ fontSize: 11, color: T.mist, marginBottom: 10 }}>
                    📍 {pod.venue}{pod.section ? ` · Sec ${pod.section}` : ""}
                    {pod.row ? ` Row ${pod.row}` : ""}
                  </div>
                )}

                {isJoined ? (
                  <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
                    borderRadius: 10, padding: "10px 0", textAlign: "center",
                    color: T.lime, fontWeight: 700, fontSize: 13 }}>
                    ✅ Joined! Taking you to your pod…
                  </div>
                ) : (
                  <button
                    onClick={() => handleJoin(pod.id)}
                    disabled={isJoining || spotsLeft === 0}
                    style={{
                      width: "100%", padding: "12px 0",
                      background: spotsLeft === 0 ? "transparent" : T.lime,
                      color: spotsLeft === 0 ? T.mist : T.dark,
                      border: spotsLeft === 0 ? `1px solid ${T.mist}44` : "none",
                      borderRadius: 10, fontSize: 13, fontWeight: 700,
                      cursor: spotsLeft === 0 ? "not-allowed" : "pointer",
                      opacity: isJoining ? 0.6 : 1,
                    }}
                  >
                    {isJoining ? "Joining…" : spotsLeft === 0 ? "Pod Full" : "Join Pod →"}
                  </button>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

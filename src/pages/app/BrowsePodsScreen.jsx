// ─── BrowsePodsScreen ─────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import { SkeletonCard } from "../../components/Skeleton";
import { useRecruitingPods, useMyPods } from "../../hooks/usePod";
import { joinPod } from "../../api/pods";
import { friendlyError } from "../../lib/friendlyError";
import { notify } from "../../lib/notify";
import { useActivePod } from "../../context/ActivePodContext";

export default function BrowsePodsScreen({ dispatch }) {
  const { pods, loading, refresh } = useRecruitingPods();
  const { pods: myPods } = useMyPods();
  const { setActivePodId, refresh: refreshMyPods } = useActivePod();
  const returnScreen = myPods.length > 0 ? "pod" : "onboarding";

  const [joining,     setJoining]     = useState(null);  // podId being joined
  const [error,       setError]       = useState(null);
  const [joined,      setJoined]      = useState(null);  // podId just joined
  const [selectedPod, setSelectedPod] = useState(null);  // pod detail sheet
  const [showSeatMap, setShowSeatMap] = useState(false); // seat map sub-modal

  async function handleJoin(pod) {
    setError(null);
    setJoining(pod.id);
    try {
      await joinPod(pod.id);
      setJoined(pod.id);
      await refresh();
      if (pod.captain_id) {
        notify({
          userId: pod.captain_id,
          type:   "member_joined",
          title:  "🎉 New member joined!",
          body:   `Someone just joined ${pod.name} from Browse Pods. Open the Pod tab to review.`,
          url:    "/app",
        });
      }
      // Refresh my pods so the new pod appears, then switch to it
      await refreshMyPods();
      setActivePodId(pod.id);
      setTimeout(() => {
        setSelectedPod(null);
        dispatch({ type: "SET_SCREEN", screen: "pod" });
      }, 1200);
    } catch (e) {
      setError(friendlyError(e));
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
          <div onClick={() => dispatch({ type: "SET_SCREEN", screen: returnScreen })}
            style={{ color: T.mist, fontSize: 22, cursor: "pointer", lineHeight: 1,
              padding: "4px 8px 4px 0", minWidth: 44, minHeight: 44,
              display: "flex", alignItems: "center" }}>‹</div>
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
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </>
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

            const estimatedShare = Math.round(100 / pod.max_members);
            const estimatedCost  = (parseFloat(pod.season_cost) * estimatedShare) / 100;

            return (
              <Card
                key={pod.id}
                onClick={() => setSelectedPod(pod)}
                style={{ marginBottom: 12, cursor: "pointer" }}
              >
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <Badge color={spotsLeft > 0 ? T.lime : T.amber}>
                      {spotsLeft > 0 ? `${spotsLeft} spots` : "Full"}
                    </Badge>
                    {pod.pod_type === "group_buy" && (
                      <Badge color={T.teal}>🛒 Group Buy</Badge>
                    )}
                  </div>
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
                    📍 {pod.venue}
                    {pod.section ? ` · Sec ${pod.section}` : ""}
                    {pod.row     ? `, Row ${pod.row}` : ""}
                    {pod.seat    ? `, Seat ${pod.seat}` : ""}
                  </div>
                )}

                {isJoined ? (
                  <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
                    borderRadius: 10, padding: "10px 0", textAlign: "center",
                    color: T.lime, fontWeight: 700, fontSize: 13 }}>
                    ✅ Joined! Taking you to your pod…
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center",
                    justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: T.teal, fontWeight: 700 }}>
                      Tap for full details →
                    </span>
                    {pod.seat_map_url && (
                      <span style={{ fontSize: 10, color: T.mist }}>🗺️ Seat map available</span>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* ── Pod detail bottom sheet ─────────────────────────────────────────── */}
      {selectedPod && (() => {
        const pod         = selectedPod;
        const memberCount = pod.pod_members?.[0]?.count ?? 0;
        const spotsLeft   = (pod.max_members || 6) - memberCount;
        const isFull      = spotsLeft <= 0;
        const estimatedShare = Math.round(100 / pod.max_members);
        const estimatedCost  = (parseFloat(pod.season_cost) * estimatedShare) / 100;
        const isJoining   = joining === pod.id;
        const isJoined    = joined  === pod.id;

        return (
          <div
            onClick={() => { setSelectedPod(null); setShowSeatMap(false); }}
            style={{ position: "fixed", inset: 0, background: "rgba(6,15,8,0.92)",
              zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 430, background: T.dark,
                borderRadius: "20px 20px 0 0", border: `1px solid ${T.green}`,
                borderBottom: "none",
                padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 32px)",
                maxHeight: "90vh", overflowY: "auto" }}
            >
              {/* Drag handle */}
              <div style={{ width: 40, height: 4, borderRadius: 2,
                background: T.green, margin: "0 auto 18px" }} />

              {/* Pod header */}
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 40 }}>{pod.sport_emoji || "🏀"}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.white,
                      fontFamily: "Georgia,serif" }}>{pod.name}</div>
                    <div style={{ fontSize: 11, color: T.mist }}>
                      {pod.team_name} · Season {pod.season}
                    </div>
                    <div style={{ marginTop: 5, display: "inline-block",
                      background: `${T.lime}22`, border: `1px solid ${T.lime}44`,
                      borderRadius: 20, padding: "2px 10px",
                      fontSize: 10, fontWeight: 700, color: T.lime }}>
                      Open for members
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedPod(null); setShowSeatMap(false); }}
                  style={{ background: "none", border: "none", color: T.mist,
                    fontSize: 22, cursor: "pointer", padding: 4, lineHeight: 1 }}>
                  ✕
                </button>
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1, background: T.green, borderRadius: 10, overflow: "hidden",
                marginBottom: 16 }}>
                {[
                  { l: "Members",    v: `${memberCount}/${pod.max_members}` },
                  { l: "Spots Left", v: isFull ? "Full" : spotsLeft },
                  { l: "Est. Share", v: `~$${Math.round(estimatedCost).toLocaleString()}` },
                ].map(({ l, v }) => (
                  <div key={l} style={{ background: T.forest, padding: "12px 8px",
                    textAlign: "center" }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: T.lime,
                      fontFamily: "Georgia,serif" }}>{v}</div>
                    <div style={{ fontSize: 9, color: T.mist, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>

              {/* Cost breakdown */}
              <div style={{ background: T.forest, border: `1px solid #1A4A2E`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
                  letterSpacing: 1, marginBottom: 10 }}>COST BREAKDOWN</div>
                {[
                  { l: "Total season cost",  v: `$${parseFloat(pod.season_cost).toLocaleString()}` },
                  { l: "Your est. share",    v: `~${estimatedShare}% · ~$${Math.round(estimatedCost).toLocaleString()}` },
                  { l: "Platform fee",       v: "3% on escrow only" },
                ].map(({ l, v }) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between",
                    marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: T.mist }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.white }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Seat info */}
              {(pod.venue || pod.section || pod.row || pod.seat) && (
                <div style={{ background: T.forest, border: `1px solid #1A4A2E`,
                  borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
                    letterSpacing: 1, marginBottom: 10 }}>SEAT INFO</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {pod.venue && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 9, color: T.mist }}>VENUE</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                          marginTop: 2 }}>📍 {pod.venue}</div>
                      </div>
                    )}
                    {pod.section && (
                      <div>
                        <div style={{ fontSize: 9, color: T.mist }}>SECTION</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.lime,
                          fontFamily: "Georgia,serif", marginTop: 2 }}>{pod.section}</div>
                      </div>
                    )}
                    {pod.row && (
                      <div>
                        <div style={{ fontSize: 9, color: T.mist }}>ROW</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.lime,
                          fontFamily: "Georgia,serif", marginTop: 2 }}>{pod.row}</div>
                      </div>
                    )}
                    {pod.seat && (
                      <div>
                        <div style={{ fontSize: 9, color: T.mist }}>SEAT</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.lime,
                          fontFamily: "Georgia,serif", marginTop: 2 }}>{pod.seat}</div>
                      </div>
                    )}
                  </div>

                  {/* Seat map button */}
                  {pod.seat_map_url && (
                    <button
                      onClick={() => setShowSeatMap(true)}
                      style={{ width: "100%", marginTop: 12, padding: "10px 0",
                        background: "transparent", border: `1.5px solid ${T.teal}55`,
                        borderRadius: 10, color: T.teal, fontSize: 12, fontWeight: 700,
                        cursor: "pointer" }}>
                      🗺️ View Seat Map
                    </button>
                  )}
                </div>
              )}

              {/* Group buy info */}
              {pod.pod_type === "group_buy" && (
                <div style={{ background: `${T.teal}08`,
                  border: "1px solid rgba(52,211,153,0.2)", borderRadius: 12,
                  padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, marginBottom: 4 }}>
                    🛒 Group Buy Pod
                  </div>
                  <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
                    The organizer hasn't purchased the tickets yet. Once all members fund,
                    the organizer has 48 hours to buy and upload a receipt. If they don't,
                    the pod is cancelled and everyone is automatically refunded.
                    Your escrow is always protected.
                  </div>
                </div>
              )}

              {/* Receipt verification */}
              {pod.receipt_verified ? (
                <div style={{ background: "rgba(52,211,153,0.08)",
                  border: "1px solid rgba(52,211,153,0.25)", borderRadius: 10,
                  padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", marginBottom: 2 }}>
                    ✓ Receipt Verified
                  </div>
                  <div style={{ fontSize: 11, color: "#6EE7B7", opacity: 0.8, lineHeight: 1.5 }}>
                    HalfTime confirmed the captain's ticket purchase receipt. The price is accurate.
                  </div>
                </div>
              ) : pod.receipt_rejected ? (
                <div style={{ background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10,
                  padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 2 }}>
                    ⚠️ Receipt Flagged
                  </div>
                  <div style={{ fontSize: 11, color: "#F8A0A0", lineHeight: 1.5 }}>
                    {pod.receipt_note || "HalfTime could not verify this pod's ticket receipt. Ask the captain for more details before joining."}
                  </div>
                </div>
              ) : pod.receipt_url ? (
                <div style={{ background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10,
                  padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#FCD34D", marginBottom: 2 }}>
                    🔍 Receipt Under Review
                  </div>
                  <div style={{ fontSize: 11, color: "#FCD34D", opacity: 0.8, lineHeight: 1.5 }}>
                    The captain submitted a ticket receipt and HalfTime is reviewing it.
                  </div>
                </div>
              ) : pod.pod_type !== "group_buy" ? (
                <div style={{ background: "rgba(148,163,184,0.06)",
                  border: "1px solid rgba(148,163,184,0.15)", borderRadius: 10,
                  padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }}>
                    📄 No receipt uploaded yet — ask the captain to share proof of purchase before you commit.
                  </div>
                </div>
              ) : null}

              {/* Error */}
              {error && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
                  borderRadius: 10, padding: "10px 14px", color: T.red,
                  fontSize: 13, marginBottom: 12, textAlign: "center" }}>
                  {error}
                </div>
              )}

              {/* Join button */}
              {isJoined ? (
                <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
                  borderRadius: 12, padding: "14px 0", textAlign: "center",
                  color: T.lime, fontWeight: 700, fontSize: 14 }}>
                  ✅ Joined! Taking you to your pod…
                </div>
              ) : (
                <button
                  onClick={() => handleJoin(pod)}
                  disabled={isJoining || isFull}
                  style={{ width: "100%", padding: "15px 0",
                    background: isFull ? "transparent" : T.lime,
                    color: isFull ? T.mist : T.dark,
                    border: isFull ? `1px solid ${T.mist}44` : "none",
                    borderRadius: 12, fontSize: 16, fontWeight: 700,
                    fontFamily: "Georgia,serif",
                    cursor: isFull || isJoining ? "not-allowed" : "pointer",
                    opacity: isJoining ? 0.6 : 1 }}>
                  {isJoining ? "Joining…" : isFull ? "Pod Full" : "Join Pod →"}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Seat map sub-modal ──────────────────────────────────────────────── */}
      {showSeatMap && selectedPod?.seat_map_url && (
        <div
          onClick={() => setShowSeatMap(false)}
          style={{ position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(6,15,8,0.97)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 430 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif" }}>🗺️ Seat Map</div>
                <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>
                  {selectedPod.venue || selectedPod.team_name}
                  {(selectedPod.section || selectedPod.row || selectedPod.seat) && (
                    <span style={{ color: T.lime, fontWeight: 700 }}>
                      {" · "}
                      {[
                        selectedPod.section && `Sec ${selectedPod.section}`,
                        selectedPod.row     && `Row ${selectedPod.row}`,
                        selectedPod.seat    && `Seat ${selectedPod.seat}`,
                      ].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setShowSeatMap(false)}
                style={{ background: "none", border: "none", color: T.mist,
                  fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 4 }}>
                ✕
              </button>
            </div>
            <div style={{ borderRadius: 14, overflow: "hidden",
              border: `1px solid ${T.green}`, background: T.forest }}>
              <img src={selectedPod.seat_map_url}
                alt={`${selectedPod.venue || selectedPod.team_name} seat map`}
                style={{ width: "100%", display: "block" }} />
            </div>
            <div style={{ fontSize: 10, color: T.mist, textAlign: "center", marginTop: 10 }}>
              Tap anywhere outside to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

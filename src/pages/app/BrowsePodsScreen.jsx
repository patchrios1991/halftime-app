// ─── BrowsePodsScreen ─────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import { SkeletonCard } from "../../components/Skeleton";
import { useRecruitingPods } from "../../hooks/usePod";
import { joinPod, verifyTickets } from "../../api/pods";
import { getCaptainRating } from "../../api/ratings";
import { joinWaitlist } from "../../api/waitlist";
import { friendlyError } from "../../lib/friendlyError";
import { notify } from "../../lib/notify";
import { useActivePod } from "../../context/ActivePodContext";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

const MAX_COST_OPTIONS = [
  { label: "Any price",   value: "" },
  { label: "Under $500",  value: 500 },
  { label: "Under $1k",   value: 1000 },
  { label: "Under $2k",   value: 2000 },
  { label: "Under $5k",   value: 5000 },
];

export default function BrowsePodsScreen({ dispatch }) {
  const { pods, loading, refresh } = useRecruitingPods();
  // Use pods from ActivePodContext — already loaded at the app level, no extra request
  const { pods: myPods, setActivePodId, refresh: refreshMyPods } = useActivePod();
  const returnScreen = myPods.length > 0 ? "pod" : "onboarding";

  const [joining,          setJoining]          = useState(null);   // podId being joined
  const [error,            setError]            = useState(null);
  const [joined,           setJoined]           = useState(null);   // podId just joined
  const [selectedPod,      setSelectedPod]      = useState(null);   // pod detail sheet
  const [showSeatMap,      setShowSeatMap]      = useState(false);  // seat map sub-modal
  const [isMember,         setIsMember]         = useState(false);  // current user already in selectedPod
  const [membershipReady,  setMembershipReady]  = useState(false);  // check complete
  const [recheckBusy,      setRecheckBusy]      = useState(false);  // URL re-check in flight
  const [captainRating,    setCaptainRating]    = useState(null);  // { avg_score, rating_count }

  // Waitlist state
  const [waitlistEmail,  setWaitlistEmail]  = useState("");
  const [waitlistBusy,   setWaitlistBusy]   = useState(false);
  const [waitlistDone,   setWaitlistDone]   = useState(false);
  const [waitlistErr,    setWaitlistErr]    = useState(null);

  // Filter state
  const [search,      setSearch]      = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [maxCost,     setMaxCost]     = useState("");
  const [spotsOnly,   setSpotsOnly]   = useState(false);

  // Unique sports present in the pod list (for pills)
  const availableSports = useMemo(() => {
    const seen = new Set();
    pods.forEach(p => { if (p.sport) seen.add(p.sport); });
    return Array.from(seen).sort();
  }, [pods]);

  // Client-side filtered list
  const filteredPods = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pods.filter(pod => {
      if (q) {
        const haystack = `${pod.name} ${pod.team_name} ${pod.sport} ${pod.venue || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (sportFilter && pod.sport !== sportFilter) return false;
      if (maxCost !== "") {
        const memberCount = pod.pod_members?.[0]?.count ?? 0;
        const share = Math.round(100 / pod.max_members);
        const cost = (parseFloat(pod.season_cost) * share) / 100;
        if (cost > maxCost) return false;
      }
      if (spotsOnly) {
        const memberCount = pod.pod_members?.[0]?.count ?? 0;
        if (memberCount >= (pod.max_members || 6)) return false;
      }
      return true;
    });
  }, [pods, search, sportFilter, maxCost, spotsOnly]);

  const filtersActive = search || sportFilter || maxCost !== "" || spotsOnly;

  function clearFilters() {
    setSearch("");
    setSportFilter("");
    setMaxCost("");
    setSpotsOnly(false);
  }

  // Fetch captain rating when detail sheet opens
  useEffect(() => {
    if (!selectedPod?.captain_id) { setCaptainRating(null); return; }
    getCaptainRating(selectedPod.captain_id).then(setCaptainRating).catch(() => setCaptainRating(null));
  }, [selectedPod?.captain_id]);

  // Membership check: first try myPods (instant), then fall back to direct DB query
  useEffect(() => {
    if (!selectedPod) {
      setIsMember(false);
      setMembershipReady(false);
      return;
    }

    // Immediate hit from already-loaded myPods list
    if (myPods.some(p => p.id === selectedPod.id)) {
      setIsMember(true);
      setMembershipReady(true);
      return;
    }

    // myPods not loaded yet or user not found — ask the DB directly
    setIsMember(false);
    setMembershipReady(false);
    if (!isSupabaseConfigured) { setMembershipReady(true); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) { setMembershipReady(true); return; }
      supabase
        .from("pod_members")
        .select("pod_id")
        .eq("pod_id", selectedPod.id)
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          setIsMember(!!data);
          setMembershipReady(true);
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPod, myPods]);

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

  async function handleRecheckUrl() {
    if (!selectedPod?.id || recheckBusy) return;
    setRecheckBusy(true);
    try {
      const result = await verifyTickets(selectedPod.id, "url");
      setSelectedPod(prev => prev ? {
        ...prev,
        ticket_url_live:       result.ticket_url_live,
        ticket_url_checked_at: result.ticket_url_checked_at,
      } : prev);
    } catch { /* non-fatal */ }
    finally { setRecheckBusy(false); }
  }

  // Pre-fill waitlist email from auth when sheet opens
  useEffect(() => {
    if (!selectedPod) { setWaitlistEmail(""); setWaitlistDone(false); setWaitlistErr(null); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setWaitlistEmail(session.user.email);
    });
  }, [selectedPod?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreateLikeThis(pod) {
    localStorage.setItem("ht_pod_template", JSON.stringify({
      sport:       pod.sport      || "",
      team_name:   pod.team_name  || "",
      venue:       pod.venue      || "",
      section:     pod.section    || "",
      row:         pod.row        || "",
      max_members: pod.max_members || 4,
      season:      pod.season     || "",
    }));
    setSelectedPod(null);
    dispatch({ type: "SET_SCREEN", screen: "create_pod" });
  }

  async function handleJoinWaitlist() {
    setWaitlistErr(null);
    setWaitlistBusy(true);
    try {
      await joinWaitlist(selectedPod.id, waitlistEmail);
      setWaitlistDone(true);
    } catch (e) {
      setWaitlistErr(e.message);
    } finally {
      setWaitlistBusy(false);
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

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 14px 0", borderBottom: `1px solid #1A4A2E` }}>
        {/* Search input */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, color: T.mist, pointerEvents: "none" }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search team, sport, venue…"
            style={{ width: "100%", boxSizing: "border-box",
              padding: "10px 36px 10px 34px",
              background: "#0D1F12", border: `1px solid #1A4A2E`,
              borderRadius: 10, color: T.white, fontSize: 13,
              outline: "none", fontFamily: "inherit" }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: T.mist, fontSize: 16,
                cursor: "pointer", lineHeight: 1, padding: 2 }}>
              ✕
            </button>
          )}
        </div>

        {/* Sport pills */}
        {availableSports.length > 0 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10,
            scrollbarWidth: "none" }}>
            {["", ...availableSports].map(s => (
              <button key={s || "all"}
                onClick={() => setSportFilter(s)}
                style={{ flexShrink: 0,
                  padding: "5px 14px",
                  background: sportFilter === s ? T.lime : "#0D1F12",
                  color:      sportFilter === s ? T.dark : T.mist,
                  border: sportFilter === s ? "none" : `1px solid #1A4A2E`,
                  borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap" }}>
                {s || "All sports"}
              </button>
            ))}
          </div>
        )}

        {/* Second filter row: spots toggle + max cost */}
        <div style={{ display: "flex", gap: 8, alignItems: "center",
          paddingBottom: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setSpotsOnly(v => !v)}
            style={{ padding: "5px 14px",
              background: spotsOnly ? T.teal : "#0D1F12",
              color:      spotsOnly ? T.dark : T.mist,
              border: spotsOnly ? "none" : `1px solid #1A4A2E`,
              borderRadius: 20, fontSize: 11, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap" }}>
            Has spots
          </button>

          <select
            value={maxCost}
            onChange={e => setMaxCost(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ flex: 1, minWidth: 110,
              padding: "6px 10px",
              background: maxCost !== "" ? `${T.teal}22` : "#0D1F12",
              color:      maxCost !== "" ? T.teal : T.mist,
              border: maxCost !== "" ? `1px solid ${T.teal}55` : `1px solid #1A4A2E`,
              borderRadius: 20, fontSize: 11, fontWeight: 700,
              cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
            {MAX_COST_OPTIONS.map(o => (
              <option key={o.label} value={o.value}>{o.label}</option>
            ))}
          </select>

          {filtersActive && (
            <button onClick={clearFilters}
              style={{ padding: "5px 12px",
                background: "rgba(239,68,68,0.12)",
                color: T.red, border: `1px solid rgba(239,68,68,0.25)`,
                borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 14 }}>
        {/* Result count when filters active */}
        {filtersActive && !loading && (
          <div style={{ fontSize: 11, color: T.mist, marginBottom: 10 }}>
            {filteredPods.length === 0
              ? "No pods match your filters"
              : `${filteredPods.length} pod${filteredPods.length !== 1 ? "s" : ""} found`}
          </div>
        )}

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
        ) : filteredPods.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 6 }}>No matches</div>
            <div style={{ fontSize: 12, color: T.mist, marginBottom: 16, lineHeight: 1.6 }}>
              Try adjusting your filters or search term.
            </div>
            <button onClick={clearFilters}
              style={{ padding: "10px 20px", background: T.lime, color: T.dark,
                border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Clear filters
            </button>
          </div>
        ) : (
          filteredPods.map(pod => {
            const memberCount = pod.pod_members?.[0]?.count ?? 0;
            const spotsLeft   = (pod.max_members || 6) - memberCount;
            const isJoined    = joined === pod.id;

            const estimatedShare = Math.round(100 / pod.max_members);
            const estimatedCost  = (parseFloat(pod.season_cost) * estimatedShare) / 100
              * (pod.perks_included === false ? 0.95 : 1);

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
                      {spotsLeft > 0 ? `${spotsLeft} spots` : "Waitlist"}
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
        const estimatedCost  = (parseFloat(pod.season_cost) * estimatedShare) / 100
          * (pod.perks_included === false ? 0.95 : 1);
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
                    <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                      <div style={{ background: `${T.lime}22`, border: `1px solid ${T.lime}44`,
                        borderRadius: 20, padding: "2px 10px",
                        fontSize: 10, fontWeight: 700, color: T.lime }}>
                        Open for members
                      </div>
                      {captainRating?.rating_count > 0 && (
                        <div style={{ background: "rgba(251,191,36,0.12)",
                          border: "1px solid rgba(251,191,36,0.3)",
                          borderRadius: 20, padding: "2px 10px",
                          fontSize: 10, fontWeight: 700, color: "#FCD34D" }}>
                          {"★".repeat(Math.round(captainRating.avg_score))}
                          {" "}{captainRating.avg_score} · {captainRating.rating_count} rating{captainRating.rating_count !== 1 ? "s" : ""}
                        </div>
                      )}
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

              {/* Ticket availability verification — group_buy only */}
              {pod.pod_type === "group_buy" && (pod.ticket_url || pod.screenshot_ai_status !== "unchecked") && (
                <div style={{ background: "#0D1F12", border: "1px solid #1A4A2E",
                  borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
                    letterSpacing: 1, marginBottom: 10 }}>TICKET AVAILABILITY</div>

                  {/* URL liveness */}
                  {pod.ticket_url && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center",
                        justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <a
                          href={pod.ticket_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, color: T.teal, fontWeight: 700,
                            textDecoration: "none", wordBreak: "break-all", flex: 1 }}
                          onClick={e => e.stopPropagation()}
                        >
                          🔗 Check availability →
                        </a>
                        <button
                          onClick={e => { e.stopPropagation(); handleRecheckUrl(); }}
                          disabled={recheckBusy}
                          style={{ background: "transparent", border: `1px solid ${T.green}`,
                            borderRadius: 6, color: T.mist, fontSize: 10, fontWeight: 700,
                            cursor: recheckBusy ? "not-allowed" : "pointer",
                            padding: "4px 10px", flexShrink: 0 }}>
                          {recheckBusy ? "Checking…" : "Re-check"}
                        </button>
                      </div>

                      {/* Live/dead badge */}
                      {pod.ticket_url_live === true && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5,
                          marginTop: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%",
                            background: T.lime, flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: T.lime }}>
                            Link is live
                            {pod.ticket_url_checked_at && (
                              <> · checked {new Date(pod.ticket_url_checked_at).toLocaleDateString()}</>
                            )}
                          </span>
                        </div>
                      )}
                      {pod.ticket_url_live === false && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5,
                          marginTop: 6 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%",
                            background: T.red, flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: T.red }}>
                            Link may be unavailable — tickets could be sold out
                          </span>
                        </div>
                      )}
                      {pod.ticket_url_live === null || pod.ticket_url_live === undefined ? (
                        <div style={{ fontSize: 10, color: T.mist, marginTop: 4 }}>
                          Not yet checked — tap Re-check to verify
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* AI screenshot status */}
                  {pod.screenshot_ai_status === "valid" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8,
                      background: `${T.lime}08`, border: `1px solid ${T.lime}22`,
                      borderRadius: 8, padding: "8px 10px" }}>
                      <span style={{ color: T.lime, fontSize: 13, flexShrink: 0 }}>✓</span>
                      <div>
                        <div style={{ fontSize: 11, color: T.lime, fontWeight: 700 }}>
                          AI verified — screenshot shows available tickets
                        </div>
                        {pod.screenshot_ai_note && (
                          <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                            {pod.screenshot_ai_note}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {pod.screenshot_ai_status === "invalid" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8,
                      background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 8, padding: "8px 10px" }}>
                      <span style={{ color: T.red, fontSize: 13, flexShrink: 0 }}>⚠</span>
                      <div>
                        <div style={{ fontSize: 11, color: T.red, fontWeight: 700 }}>
                          Screenshot could not be verified
                        </div>
                        {pod.screenshot_ai_note && (
                          <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                            {pod.screenshot_ai_note}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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

              {/* Perk disclosure */}
              {pod.perks_included === false ? (
                <div style={{ background: `${T.teal}08`, border: `1px solid ${T.teal}33`,
                  borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, marginBottom: 3 }}>
                    🎁 Event perks not included — 5% cost reduction applied
                  </div>
                  <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
                    The captain retains all team member perks (events, meet-and-greets,
                    postseason seats). Your share cost is reduced by 5% to reflect this.
                    Est. share shown above already includes the discount.
                  </div>
                </div>
              ) : (
                <div style={{ background: "rgba(148,163,184,0.05)",
                  border: "1px solid rgba(148,163,184,0.12)", borderRadius: 10,
                  padding: "11px 14px", marginBottom: 14 }}>
                  {pod.perk_commitment ? (
                    <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
                      <span style={{ color: T.lime, fontWeight: 700 }}>✓ Perks included & captain committed</span>
                      {" "}— all team member perks (events, meet-and-greets, postseason seat
                      opportunities) are posted to the pod within 48 hours for members to bid on.
                      Members can flag any perk they believe wasn't disclosed.
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
                      🎟️ <strong style={{ color: T.chalk }}>Note on member perks:</strong>{" "}
                      Season ticket holders receive team perks (events, postseason seats, etc.).
                      The captain is named on the account — ask them how they plan to share
                      perks with the pod before joining.
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
                  borderRadius: 10, padding: "10px 14px", color: T.red,
                  fontSize: 13, marginBottom: 12, textAlign: "center" }}>
                  {error}
                </div>
              )}

              {/* Join / member status — wait for check before showing Join button */}
              {!membershipReady ? (
                <div style={{ padding: "15px 0", textAlign: "center" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", margin: "0 auto",
                    border: `2px solid ${T.green}`, borderTopColor: T.lime,
                    animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : isMember ? (
                <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
                  borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                  <div style={{ color: T.lime, fontWeight: 700, fontSize: 14 }}>✓ You're a member</div>
                  <div style={{ color: T.mist, fontSize: 11, marginTop: 4 }}>
                    Visit the Pod tab to manage your membership.
                  </div>
                </div>
              ) : isJoined ? (
                <div style={{ background: `${T.lime}18`, border: `1px solid ${T.lime}44`,
                  borderRadius: 12, padding: "14px 0", textAlign: "center",
                  color: T.lime, fontWeight: 700, fontSize: 14 }}>
                  ✅ Joined! Taking you to your pod…
                </div>
              ) : isFull ? (
                /* ── Waitlist form ── */
                <div style={{ background: "#0D1F12", border: "1px solid #1A4A2E",
                  borderRadius: 12, padding: "16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                    fontFamily: "Georgia,serif", marginBottom: 4 }}>
                    🔔 This pod is full
                  </div>
                  <div style={{ fontSize: 11, color: T.mist, marginBottom: 12, lineHeight: 1.6 }}>
                    Join the waitlist and we'll notify the captain. If a spot opens, they can reach out to you first.
                  </div>

                  {waitlistDone ? (
                    <div style={{ background: `${T.lime}14`, border: `1px solid ${T.lime}33`,
                      borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.lime }}>✓ You're on the waitlist</div>
                      <div style={{ fontSize: 11, color: T.mist, marginTop: 4 }}>
                        The captain has been notified. We'll keep your spot in line.
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="email"
                        value={waitlistEmail}
                        onChange={e => setWaitlistEmail(e.target.value)}
                        placeholder="your@email.com"
                        style={{ width: "100%", boxSizing: "border-box",
                          padding: "11px 14px", marginBottom: 8,
                          background: "#060F08", border: `1px solid #1A4A2E`,
                          borderRadius: 10, color: T.white, fontSize: 13,
                          outline: "none", fontFamily: "inherit" }}
                      />
                      {waitlistErr && (
                        <div style={{ fontSize: 11, color: T.red, marginBottom: 8 }}>{waitlistErr}</div>
                      )}
                      <button
                        onClick={handleJoinWaitlist}
                        disabled={waitlistBusy || !waitlistEmail.trim()}
                        style={{ width: "100%", padding: "13px 0",
                          background: waitlistBusy || !waitlistEmail.trim() ? "transparent" : T.teal,
                          color: waitlistBusy || !waitlistEmail.trim() ? T.mist : T.dark,
                          border: waitlistBusy || !waitlistEmail.trim() ? `1px solid #1A4A2E` : "none",
                          borderRadius: 10, fontSize: 14, fontWeight: 700,
                          fontFamily: "Georgia,serif",
                          cursor: waitlistBusy || !waitlistEmail.trim() ? "not-allowed" : "pointer" }}>
                        {waitlistBusy ? "Joining waitlist…" : "Join Waitlist →"}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleJoin(pod)}
                  disabled={isJoining}
                  style={{ width: "100%", padding: "15px 0",
                    background: T.lime, color: T.dark,
                    border: "none",
                    borderRadius: 12, fontSize: 16, fontWeight: 700,
                    fontFamily: "Georgia,serif",
                    cursor: isJoining ? "not-allowed" : "pointer",
                    opacity: isJoining ? 0.6 : 1 }}>
                  {isJoining ? "Joining…" : "Join Pod →"}
                </button>
              )}
              {/* Create a pod like this one */}
              <button
                onClick={() => handleCreateLikeThis(pod)}
                style={{ width: "100%", marginTop: 10, padding: "12px 0",
                  background: "transparent",
                  border: `1px solid #1A4A2E`,
                  borderRadius: 12, fontSize: 13, fontWeight: 700,
                  color: T.mist, cursor: "pointer" }}>
                + Create a pod like this one
              </button>
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

// ─── BetaDashboard ────────────────────────────────────────────────────────────
// Real-data admin dashboard for the HalfTime beta cohort.
// Requires: supabase/migrations/012_admin_access.sql to be run, then
//   UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();
import { useState, useMemo, useEffect, useCallback } from "react";
import { T } from "../../tokens";
import { supabase } from "../../lib/supabase";
import { normalizeGames } from "../../lib/embed";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function weekLabel(dateStr) {
  if (!dateStr) return "?";
  const d = new Date(dateStr);
  const dow = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const month = mon.toLocaleDateString("en-US", { month: "short" });
  return `${month} W${Math.ceil(mon.getDate() / 7)}`;
}
function weekSortKey(dateStr) {
  if (!dateStr) return "0000-00-00";
  const d = new Date(dateStr);
  const dow = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return mon.toISOString().slice(0, 10);
}
function daysAgo(dateStr) {
  if (!dateStr) return 0;
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{ background: T.forest, border: "1px solid #1A4A2E",
      borderRadius: 14, padding: 16, ...style }}>{children}</div>
  );
}
function Stat({ label, value, sub, color = T.lime, icon }) {
  return (
    <Card style={{ textAlign: "center" }}>
      {icon && <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontSize: 24, fontWeight: 700, color,
        fontFamily: "Georgia,serif", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.mist, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: T.mist, marginTop: 2, opacity: 0.7 }}>{sub}</div>}
    </Card>
  );
}
function Badge({ children, color = T.lime }) {
  return (
    <span style={{ background: `${color}18`, color, border: `1px solid ${color}35`,
      borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  );
}
function Bar({ value, max, color = T.lime, h = 6 }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ background: "#1A4A2E", borderRadius: h, height: h, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color,
        borderRadius: h, transition: "width .5s" }} />
    </div>
  );
}

// ─── Setup / Auth screens ─────────────────────────────────────────────────────
function SetupScreen({ title, steps }) {
  return (
    <div style={{ background: T.dark, minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "Calibri,sans-serif",
      padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: 900, marginBottom: 24 }}>
          <span style={{ color: T.white }}>Half</span><span style={{ color: T.lime }}>Time</span>
          <span style={{ fontSize: 12, color: T.mist, fontFamily: "Calibri,sans-serif",
            fontWeight: 400, marginLeft: 10 }}>ADMIN</span>
        </div>
        <Card>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 20 }}>🔧 {title}</div>
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, textAlign: "left" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: T.lime,
                color: T.dark, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 12, color: T.chalk, lineHeight: 1.6 }}>{step}</div>
            </div>
          ))}
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 8, padding: "11px 24px", background: T.lime, border: "none",
              borderRadius: 10, color: T.dark, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ↻ Reload after setup
          </button>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function BetaDashboard() {
  const [tab,        setTab]        = useState("overview");
  const [podFilter,  setPodFilter]  = useState("all");
  const [memberSort, setMemberSort] = useState("churnRisk");

  // ── Data state ───────────────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);
  const [dataError,    setDataError]    = useState(null);
  const [setupState,   setSetupState]   = useState(null); // null | 'not_logged_in' | 'needs_migration' | 'needs_admin'
  const [pods,         setPods]         = useState([]);
  const [members,      setMembers]      = useState([]);
  const [weeklyData,   setWeeklyData]   = useState([]);
  const [totalProfiles, setTotalProfiles] = useState(0);

  // ── Signups state ────────────────────────────────────────────────────────────
  const [signups,        setSignups]        = useState([]);
  const [signupsLoading, setSignupsLoading] = useState(false);

  const loadSignups = useCallback(async () => {
    setSignupsLoading(true);
    const { data } = await supabase.rpc("get_admin_signups");
    setSignups(data || []);
    setSignupsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "signups") loadSignups();
  }, [tab, loadSignups]);

  // ── Waitlist state ───────────────────────────────────────────────────────────
  const [waitlist,        setWaitlist]        = useState([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistBusy,    setWaitlistBusy]    = useState(null); // entry id in flight

  const loadWaitlist = useCallback(async () => {
    setWaitlistLoading(true);
    const { data } = await supabase
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: true });
    setWaitlist(data || []);
    setWaitlistLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "waitlist") loadWaitlist();
  }, [tab, loadWaitlist]);

  async function handleWaitlistAction(entry, action) {
    setWaitlistBusy(entry.id);
    const updates = action === "approve"
      ? { status: "approved", approved_at: new Date().toISOString() }
      : { status: "rejected" };
    await supabase.from("waitlist").update(updates).eq("id", entry.id);

    if (action === "approve") {
      // If they already created an account (e.g. via Google sign-in before
      // approval), flip their profile to approved so the gate lets them in.
      await supabase.rpc("approve_profile_by_email", { p_email: entry.email })
        .then(() => {})
        .catch(() => {});

      const APP_URL = "https://app.halftime-app.com";
      await supabase.functions.invoke("send-email", {
        body: {
          type: "INSERT",
          table: "notifications",
          record: {
            user_id: "00000000-0000-0000-0000-000000000000", // placeholder — send-email uses email field below
            type:    "pod_active",
            title:   "You're approved for HalfTime! 🎉",
            body:    `Hey ${entry.name || "there"}, you've been approved to join HalfTime. Create your account here: ${APP_URL}/auth/signin?mode=signup&email=${encodeURIComponent(entry.email)}`,
          },
          _override_email: entry.email,
        },
      }).catch(() => {});
    }

    setWaitlist(prev => prev.map(e => e.id === entry.id ? { ...e, ...updates } : e));
    setWaitlistBusy(null);
  }

  // ── Invite codes state ───────────────────────────────────────────────────────
  const [codes,       setCodes]       = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [newCodeVal,  setNewCodeVal]  = useState("");
  const [newLabel,    setNewLabel]    = useState("");
  const [newMaxUses,  setNewMaxUses]  = useState("1");
  const [codesBusy,   setCodesBusy]   = useState(false);
  const [codesMsg,    setCodesMsg]    = useState(null);

  const loadCodes = useCallback(async () => {
    setCodesLoading(true);
    const { data } = await supabase
      .from("invite_codes")
      .select("*")
      .order("created_at", { ascending: false });
    setCodes(data || []);
    setCodesLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "codes") loadCodes();
  }, [tab, loadCodes]);

  async function handleCreateCode(e) {
    e.preventDefault();
    if (!newCodeVal.trim()) return;
    setCodesBusy(true);
    setCodesMsg(null);
    const { error } = await supabase.from("invite_codes").insert({
      code:     newCodeVal.trim().toUpperCase(),
      label:    newLabel.trim() || null,
      max_uses: parseInt(newMaxUses, 10) || 1,
    });
    if (error) {
      setCodesMsg({ type: "error", msg: error.message });
    } else {
      setCodesMsg({ type: "success", msg: `✅ Code ${newCodeVal.toUpperCase()} created!` });
      setNewCodeVal(""); setNewLabel(""); setNewMaxUses("1");
      loadCodes();
    }
    setCodesBusy(false);
  }

  async function handleDeleteCode(id, code) {
    if (!window.confirm(`Delete code "${code}"? This cannot be undone.`)) return;
    await supabase.from("invite_codes").delete().eq("id", id);
    loadCodes();
  }

  function generateRandomCode() {
    const words = ["KICK","SNAP","SLAM","RUSH","BLITZ","HOOP","SCORE","DRIVE","PITCH"];
    const word = words[Math.floor(Math.random() * words.length)];
    setNewCodeVal(`${word}${Math.floor(10 + Math.random() * 90)}`);
  }

  // ── Data loading ──────────────────────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setDataError(null);

    try {
      // 1. Auth check
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes?.data?.session ?? null;
      if (!session) {
        setSetupState("not_logged_in");
        return;
      }

      // 2. Admin flag check (gracefully handles column-not-exists if migration not run)
      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .single();

      if (profileErr) {
        setSetupState("needs_migration");
        return;
      }

      if (!profileRow?.is_admin) {
        setSetupState("needs_admin");
        return;
      }

      // 3. Load all platform data in parallel
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [podsRes, gamesRes, listingsRes, profilesRes] = await Promise.all([
        supabase
          .from("pods")
          .select(`
            id, name, team_name, sport, sport_emoji, season_cost, max_members,
            status, captain_id, allocation_done, created_at, nps,
            receipt_url, receipt_verified, receipt_rejected, receipt_note,
            pod_members(
              id, user_id, escrow_funded, share_pct, bid_credits,
              tier, churn_risk, referral_count, games_allocated, games_attended, joined_at,
              profiles(display_name, verified)
            )
          `)
          .order("created_at", { ascending: false }),

        supabase
          .from("games")
          .select("id, pod_id, game_date, face_value, assignments(user_id, confirmed)"),

        supabase
          .from("resale_listings")
          .select("id, pod_id, sold_price, ask_price, listed_at, status"),

        supabase
          .from("profiles")
          .select("id, verified, created_at"),
      ]);

      if (podsRes.error) throw podsRes.error;

      const rawPods     = podsRes.data    || [];
      const rawGames    = normalizeGames(gamesRes.data || []);
      const rawListings = listingsRes.data || [];
      const rawProfiles = profilesRes.data || [];

      // ── Transform pods ──────────────────────────────────────────────────────
      const transformedPods = rawPods.map(p => {
        const mems     = p.pod_members || [];
        const podGames = rawGames.filter(g => g.pod_id === p.id);
        const gamesTotal    = podGames.length;
        const gamesAttended = podGames.filter(g => {
          if (!g.game_date) return false;
          const [yr, mo, dy] = g.game_date.split("-").map(Number);
          return new Date(yr, mo - 1, dy) < today && g.assignments?.[0]?.confirmed;
        }).length;
        const soldListings  = rawListings.filter(l => l.pod_id === p.id && l.status === "sold");
        const resaleRevenue = soldListings.reduce((s, l) => s + parseFloat(l.sold_price || 0), 0);

        return {
          id:           p.id,
          name:         p.name,
          team:         p.team_name,
          sportEmoji:   p.sport_emoji || "🏟️",
          members:      mems.length,
          maxMembers:   p.max_members,
          escrowFunded: mems.filter(m => m.escrow_funded).length,
          escrowPending: mems.filter(m => !m.escrow_funded).length,
          gmv:          parseFloat(p.season_cost) || 0,
          gamesTotal,
          gamesAttended,
          resaleRevenue,
          nps:          p.nps != null ? parseFloat(p.nps) : null,
          status:           p.status,
          created:          p.created_at,
          captainId:        p.captain_id,
          allocationDone:   p.allocation_done,
          receiptUrl:       p.receipt_url ?? null,
          receiptVerified:  p.receipt_verified ?? false,
          receiptRejected:  p.receipt_rejected ?? false,
          receiptNote:      p.receipt_note ?? null,
        };
      });

      // ── Transform members ───────────────────────────────────────────────────
      const transformedMembers = rawPods.flatMap(p =>
        (p.pod_members || []).map(m => ({
          id:           m.id,
          userId:       m.user_id,
          name:         m.profiles?.display_name || "Unknown",
          podId:        p.id,
          podName:      p.name,
          verified:     m.profiles?.verified ?? false,
          escrowFunded: m.escrow_funded,
          gamesAllocated: m.games_allocated,
          gamesAttended:  m.games_attended,
          referrals:    m.referral_count,
          tier:         m.tier,
          churnRisk:    m.churn_risk || "unknown",
          joinedAt:     m.joined_at,
        }))
      );

      // ── Build weekly trend ──────────────────────────────────────────────────
      const weeklyMap = new Map();
      const ensureWeek = (dateStr) => {
        const key = weekSortKey(dateStr);
        if (!weeklyMap.has(key)) {
          weeklyMap.set(key, { week: weekLabel(dateStr), newPods: 0, newMembers: 0, gmv: 0, resaleRev: 0 });
        }
        return weeklyMap.get(key);
      };
      rawPods.forEach(p => {
        const w = ensureWeek(p.created_at);
        w.newPods++;
        w.gmv += parseFloat(p.season_cost) || 0;
      });
      rawPods.forEach(p => {
        (p.pod_members || []).forEach(m => { ensureWeek(m.joined_at).newMembers++; });
      });
      rawListings.filter(l => l.status === "sold").forEach(l => {
        const key = weekSortKey(l.listed_at);
        if (weeklyMap.has(key)) weeklyMap.get(key).resaleRev += parseFloat(l.sold_price || 0);
      });
      const sortedWeekly = [...weeklyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, d]) => d)
        .slice(-8);

      setPods(transformedPods);
      setMembers(transformedMembers);
      setWeeklyData(sortedWeekly);
      setTotalProfiles(rawProfiles.length);
      setSetupState(null);
    } catch (e) {
      setDataError(e.message || "Unknown error — check the browser console.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // ── Receipt review actions ─────────────────────────────────────────────────
  const [receiptBusy,   setReceiptBusy]   = useState(null); // podId being actioned
  const [rejectNote,    setRejectNote]    = useState({});   // { [podId]: string }
  const [showRejectBox, setShowRejectBox] = useState(null); // podId with open reject form

  async function handleReceiptVerify(podId) {
    setReceiptBusy(podId);
    await supabase.from("pods").update({
      receipt_verified: true,
      receipt_rejected: false,
      receipt_note:     null,
    }).eq("id", podId);
    setReceiptBusy(null);
    loadAllData();
  }

  async function handleReceiptReject(podId) {
    setReceiptBusy(podId);
    await supabase.from("pods").update({
      receipt_verified: false,
      receipt_rejected: true,
      receipt_note:     rejectNote[podId]?.trim() || "HalfTime could not verify this receipt. Please contact your captain.",
    }).eq("id", podId);
    setReceiptBusy(null);
    setShowRejectBox(null);
    setRejectNote(n => ({ ...n, [podId]: "" }));
    loadAllData();
  }

  async function handleReceiptReset(podId) {
    setReceiptBusy(podId);
    await supabase.from("pods").update({
      receipt_verified: false,
      receipt_rejected: false,
      receipt_note:     null,
    }).eq("id", podId);
    setReceiptBusy(null);
    loadAllData();
  }

  // ── Computed metrics ──────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalMembers    = members.length;
    const verifiedMembers = members.filter(m => m.verified).length;
    const fundedMembers   = members.filter(m => m.escrowFunded).length;
    const allocatedMembers = members.filter(m => m.gamesAllocated > 0).length;
    const attendedMembers  = members.filter(m => m.gamesAttended > 0).length;
    const totalGMV        = pods.reduce((s, p) => s + p.gmv, 0);
    const totalResale     = pods.reduce((s, p) => s + p.resaleRevenue, 0);
    const totalGamesAttended = pods.reduce((s, p) => s + p.gamesAttended, 0);
    const totalGamesTotal    = pods.reduce((s, p) => s + p.gamesTotal, 0);
    const attendanceRate  = totalGamesTotal ? Math.round((totalGamesAttended / totalGamesTotal) * 100) : 0;
    const npsScores       = pods.filter(p => p.nps != null).map(p => p.nps);
    const avgNPS          = npsScores.length
      ? Math.round(npsScores.reduce((a, b) => a + b, 0) / npsScores.length * 10) / 10
      : null;
    const activePods  = pods.filter(p => p.status === "active").length;
    const escrowFees  = Math.round(totalGMV * 0.03);
    const resaleFees  = Math.round(totalResale * 0.08);

    return {
      activePods, totalPods: pods.length, totalMembers, verifiedMembers, fundedMembers,
      allocatedMembers, attendedMembers, totalGMV, totalResale, attendanceRate, avgNPS,
      highRisk: members.filter(m => m.churnRisk === "high").length,
      escrowFees, resaleFees, platformFees: escrowFees + resaleFees,
      totalProfiles,
    };
  }, [pods, members, totalProfiles]);

  // ── Dynamic alerts ────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const result = [];

    // High: unfunded escrow ≥ 3 days
    members.filter(m => !m.escrowFunded).forEach(m => {
      const days = daysAgo(m.joinedAt);
      if (days >= 3) {
        const pod = pods.find(p => p.id === m.podId);
        result.push({
          sev: "high", icon: "🔴",
          title: `${m.name} — Escrow unfunded (Day ${days})`,
          body: `${pod?.name || "Pod"} is waiting on their payment. Consider sending a reminder or releasing their spot.`,
          action: "Send payment reminder",
        });
      }
    });

    // High: unverified identity ≥ 5 days
    members.filter(m => !m.verified).forEach(m => {
      const days = daysAgo(m.joinedAt);
      if (days >= 5) {
        const pod = pods.find(p => p.id === m.podId);
        result.push({
          sev: "high", icon: "🔴",
          title: `${m.name} — Identity unverified (Day ${days})`,
          body: `KYC not completed. Pod: ${pod?.name || "unknown"}. Notify captain to follow up.`,
          action: "Flag to captain",
        });
      }
    });

    // Medium: active pods with members still pending
    pods.filter(p => p.escrowPending > 0 && (p.status === "active" || p.status === "recruiting")).forEach(p => {
      result.push({
        sev: "medium", icon: "🟡",
        title: `${p.name} — ${p.escrowPending} member${p.escrowPending > 1 ? "s" : ""} pending`,
        body: `${p.escrowFunded}/${p.members} funded. ${p.gamesTotal > 0 ? `${p.gamesTotal} games in season.` : ""}`,
        action: "Send group reminder",
      });
    });

    // Medium: fully funded, games loaded, allocation not done
    pods.filter(p =>
      !p.allocationDone && p.escrowPending === 0 &&
      p.members > 0 && p.gamesTotal > 0
    ).forEach(p => {
      result.push({
        sev: "medium", icon: "🟡",
        title: `${p.name} — Ready for allocation`,
        body: `${p.members} funded members, ${p.gamesTotal} games loaded. Run allocation to distribute seats.`,
        action: "Notify captain",
      });
    });

    // Low: high referrers
    members.filter(m => m.referrals >= 2).forEach(m => {
      result.push({
        sev: "low", icon: "🟢",
        title: `${m.name} — ${m.referrals} referrals`,
        body: "Top referrer in cohort. Issue reward and request a testimonial for the pitch deck.",
        action: "Issue reward",
      });
    });

    // Low: high NPS pods
    pods.filter(p => p.nps != null && p.nps >= 9).forEach(p => {
      result.push({
        sev: "low", icon: "🟢",
        title: `${p.name} — NPS ${p.nps} ⭐`,
        body: `${p.team} pod has ${p.members} members with strong satisfaction. Great testimonial candidate.`,
        action: "Request testimonial",
      });
    });

    if (result.length === 0) {
      result.push({
        sev: "low", icon: "🟢",
        title: "All clear — no action items",
        body: "No high or medium priority issues in the current cohort.",
        action: null,
      });
    }

    return result;
  }, [pods, members]);

  // ── Dynamic insights ──────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const result = [];

    const fullFunded = pods.filter(p => p.escrowPending === 0 && p.members > 0);
    if (fullFunded.length > 0) {
      const best = [...fullFunded].sort((a, b) => b.members - a.members)[0];
      result.push({ c: T.lime, t: `${fullFunded.length} pod${fullFunded.length !== 1 ? "s" : ""} fully funded. ${best.name} leads — ${best.members}/${best.maxMembers} members, $${Math.round(best.gmv).toLocaleString()} season cost.` });
    }

    const highRisk = members.filter(m => m.churnRisk === "high");
    if (highRisk.length > 0) {
      const unfunded = highRisk.filter(m => !m.escrowFunded);
      result.push({ c: T.red, t: `${highRisk.length} member${highRisk.length !== 1 ? "s" : ""} at high churn risk.${unfunded.length > 0 ? ` ${unfunded.length} with unfunded escrow — trigger urgency email sequence immediately.` : " Check in proactively before season starts."}` });
    }

    if (members.length > 0) {
      const verifiedPct = Math.round((members.filter(m => m.verified).length / members.length) * 100);
      result.push({ c: verifiedPct >= 80 ? T.teal : T.amber, t: `${verifiedPct}% KYC verification rate across ${members.length} members. ${verifiedPct < 80 ? "Send identity verification prompts to unverified accounts." : "Strong verification health — keep monitoring new joiners."}` });
    }

    const topRef = [...members].sort((a, b) => b.referrals - a.referrals)[0];
    if (topRef?.referrals > 0) {
      result.push({ c: T.lime, t: `${topRef.name} leads with ${topRef.referrals} referral${topRef.referrals !== 1 ? "s" : ""} — activate referral reward and personalise the next outreach with their savings figure.` });
    }

    while (result.length < 2) {
      result.push({ c: T.mist, t: "Invite more pods to the beta to surface actionable insights here." });
    }

    return result.slice(0, 4);
  }, [pods, members]);

  // ── Sorted / filtered ──────────────────────────────────────────────────────────
  const sortedMembers = useMemo(() => {
    const riskOrder = { high: 0, medium: 1, low: 2, unknown: 3 };
    return [...members].sort((a, b) => {
      if (memberSort === "churnRisk") return (riskOrder[a.churnRisk] ?? 3) - (riskOrder[b.churnRisk] ?? 3);
      if (memberSort === "referrals") return b.referrals - a.referrals;
      if (memberSort === "games")     return b.gamesAttended - a.gamesAttended;
      return 0;
    });
  }, [members, memberSort]);

  const filteredPods = useMemo(
    () => podFilter === "all" ? pods : pods.filter(p => p.status === podFilter),
    [pods, podFilter]
  );

  const riskColor   = { low: T.lime, medium: T.amber, high: T.red, unknown: T.mist };
  const statusColor = { active: T.lime, recruiting: T.teal, draft: T.mist, completed: T.mist, cancelled: T.red };

  // ── Auth / setup gates ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: T.dark, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "Calibri,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: 900, marginBottom: 16 }}>
            <span style={{ color: T.white }}>Half</span><span style={{ color: T.lime }}>Time</span>
          </div>
          <div style={{ color: T.mist, fontSize: 13 }}>Loading dashboard…</div>
        </div>
      </div>
    );
  }

  if (setupState === "not_logged_in") {
    return (
      <SetupScreen title="Sign in first"
        steps={[
          "Go to /auth/signin and sign into your admin account.",
          "Return to /admin after signing in.",
        ]} />
    );
  }

  if (setupState === "needs_migration") {
    return (
      <SetupScreen title="Run migration 012_admin_access.sql"
        steps={[
          "Open Supabase → SQL Editor → New query.",
          "Paste and run: supabase/migrations/012_admin_access.sql",
          "Then run: UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();",
          "Return to /admin and click Reload.",
        ]} />
    );
  }

  if (setupState === "needs_admin") {
    return (
      <SetupScreen title="Grant yourself admin access"
        steps={[
          "Open Supabase → SQL Editor → New query.",
          "Run: UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();",
          "Return to /admin and click Reload.",
        ]} />
    );
  }

  if (dataError) {
    return (
      <div style={{ background: T.dark, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "Calibri,sans-serif",
        flexDirection: "column", gap: 16 }}>
        <div style={{ color: T.red, fontSize: 14, fontWeight: 700 }}>⚠ Error loading data</div>
        <div style={{ color: T.mist, fontSize: 12, maxWidth: 400, textAlign: "center" }}>{dataError}</div>
        <button onClick={loadAllData} style={{ padding: "10px 20px", background: T.lime,
          border: "none", borderRadius: 8, color: T.dark, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.dark, minHeight: "100vh", fontFamily: "Calibri,sans-serif", color: T.white }}>

      {/* Header */}
      <div style={{ background: T.forest, borderBottom: "1px solid #1A4A2E",
        padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 900 }}>
            <span style={{ color: T.white }}>Half</span><span style={{ color: T.lime }}>Time</span>
          </div>
          <div style={{ fontSize: 11, color: T.mist, background: "#0A0A0A",
            padding: "3px 10px", borderRadius: 6, fontWeight: 700, letterSpacing: 1 }}>
            BETA COHORT DASHBOARD
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.lime,
            boxShadow: `0 0 6px ${T.lime}` }} />
          <span style={{ fontSize: 11, color: T.mist }}>
            Live · {pods.length} pod{pods.length !== 1 ? "s" : ""} · {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
          <button onClick={loadAllData} title="Refresh"
            style={{ background: "#1A4A2E", border: "none", borderRadius: 6,
              padding: "4px 10px", color: T.mist, fontSize: 11, cursor: "pointer" }}>
            ↻
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1A4A2E",
        background: T.dark, padding: "0 24px", overflowX: "auto" }}>
        {[
          ["overview","📊 Overview"], ["pods","🏟️ Pods"], ["members","👥 Members"],
          ["waitlist","📋 Waitlist"], ["signups","🙋 Signups"], ["funnel","🔽 Funnel"],
          ["revenue","💰 Revenue"],  ["receipts","🧾 Receipts"], ["codes","🔑 Codes"],
          ["alerts","🚨 Alerts"],
        ].map(([k, lbl]) => (
          <div key={k} onClick={() => setTab(k)}
            style={{ padding: "12px 16px", fontSize: 12, fontWeight: 700,
              color: tab === k ? T.lime : T.mist,
              borderBottom: `2px solid ${tab === k ? T.lime : "transparent"}`,
              cursor: "pointer", whiteSpace: "nowrap",
              position: "relative" }}>
            {lbl}
            {k === "alerts" && alerts.filter(a => a.sev === "high").length > 0 && (
              <span style={{ marginLeft: 5, background: T.red, color: T.white,
                borderRadius: "50%", width: 16, height: 16, display: "inline-flex",
                alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>
                {alerts.filter(a => a.sev === "high").length}
              </span>
            )}
            {k === "waitlist" && waitlist.filter(e => e.status === "pending").length > 0 && (
              <span style={{ marginLeft: 5, background: T.lime, color: T.dark,
                borderRadius: "50%", width: 16, height: 16, display: "inline-flex",
                alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>
                {waitlist.filter(e => e.status === "pending").length}
              </span>
            )}
            {k === "receipts" && pods.filter(p => p.receiptUrl && !p.receiptVerified && !p.receiptRejected).length > 0 && (
              <span style={{ marginLeft: 5, background: T.amber, color: T.dark,
                borderRadius: "50%", width: 16, height: 16, display: "inline-flex",
                alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>
                {pods.filter(p => p.receiptUrl && !p.receiptVerified && !p.receiptRejected).length}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>

        {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 12 }}>
              <Stat label="Total GMV" icon="💰"
                value={metrics.totalGMV > 0 ? `$${(metrics.totalGMV / 1000).toFixed(1)}K` : "—"}
                sub="season ticket value" />
              <Stat label="Active Pods" icon="🏟️" color={T.teal}
                value={metrics.activePods}
                sub={`of ${metrics.totalPods} total`} />
              <Stat label="Members" icon="👥"
                value={metrics.totalMembers}
                sub={`${metrics.fundedMembers} escrow funded`} />
              <div onClick={() => setTab("signups")} style={{ cursor: "pointer" }}
                title="Click to view all signups">
                <Stat label="Sign Ups" icon="🙋" color={T.teal}
                  value={metrics.totalProfiles}
                  sub={`${metrics.totalMembers} joined a pod`} />
              </div>
              <Stat label="Platform Fees" icon="📈"
                value={metrics.platformFees > 0 ? `$${metrics.platformFees.toLocaleString()}` : "—"}
                sub="3% escrow + 8% resale" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
              <Stat label="Avg Pod NPS" icon="⭐" color={T.teal}
                value={metrics.avgNPS != null ? metrics.avgNPS : "—"}
                sub="out of 10" />
              <Stat label="Attendance Rate" icon="🎟️"
                value={metrics.attendanceRate > 0 ? `${metrics.attendanceRate}%` : "—"}
                sub="confirmed / allocated" />
              <Stat label="Resale Volume" icon="♻️" color={T.amber}
                value={metrics.totalResale > 0 ? `$${metrics.totalResale.toLocaleString()}` : "—"}
                sub="sold ticket value" />
              <Stat label="High Churn Risk" icon="⚠️" color={T.red}
                value={metrics.highRisk}
                sub="members flagged" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {/* Weekly GMV chart */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>
                  Weekly Pod GMV ($)
                </div>
                {weeklyData.length < 2 ? (
                  <div style={{ color: T.mist, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
                    Not enough weeks to chart yet
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 80 }}>
                      {weeklyData.map((w, i) => {
                        const mx = Math.max(...weeklyData.map(x => x.gmv));
                        const h  = mx > 0 ? Math.round((w.gmv / mx) * 70) + 4 : 4;
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
                            alignItems: "center", gap: 3 }}>
                            <div style={{ width: "100%", height: h,
                              background: i === weeklyData.length - 1 ? T.lime : `${T.lime}55`,
                              borderRadius: "3px 3px 0 0" }} />
                            <div style={{ fontSize: 8, color: T.mist }}>{w.week.split(" ")[1]}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: T.mist, marginTop: 8 }}>
                      Total GMV: <span style={{ color: T.lime, fontWeight: 700 }}>
                        ${Math.round(metrics.totalGMV).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </Card>

              {/* Activation funnel */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>
                  Activation Funnel
                </div>
                {[
                  { stage: "Signed up",       n: metrics.totalProfiles,    color: T.mist  },
                  { stage: "Joined a pod",    n: metrics.totalMembers,     color: T.teal  },
                  { stage: "KYC verified",    n: metrics.verifiedMembers,  color: T.teal  },
                  { stage: "Funded escrow",   n: metrics.fundedMembers,    color: T.lime  },
                  { stage: "Got tickets",     n: metrics.allocatedMembers, color: T.lime  },
                  { stage: "Attended a game", n: metrics.attendedMembers,  color: T.lime  },
                ].map((row, i, arr) => {
                  const drop = i > 0 && arr[i-1].n > 0
                    ? Math.round(((arr[i-1].n - row.n) / arr[i-1].n) * 100) : 0;
                  return (
                    <div key={row.stage} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: T.chalk }}>{row.stage}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          {drop > 0 && <span style={{ fontSize: 10, color: T.amber }}>-{drop}%</span>}
                          <span style={{ fontSize: 10, fontWeight: 700, color: row.color }}>{row.n}</span>
                        </div>
                      </div>
                      <Bar value={row.n} max={arr[0].n || 1} color={row.color} h={5} />
                    </div>
                  );
                })}
              </Card>

              {/* Revenue mix */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>
                  Revenue Mix
                </div>
                {[
                  { label: "Escrow fees (3%)", val: metrics.escrowFees, color: T.lime },
                  { label: "Resale fees (8%)", val: metrics.resaleFees, color: T.amber },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: T.chalk }}>{row.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: row.color }}>
                        ${row.val.toLocaleString()}
                      </span>
                    </div>
                    <Bar value={row.val} max={metrics.platformFees || 1} color={row.color} h={5} />
                  </div>
                ))}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #1A4A2E",
                  display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: T.mist }}>Total fees earned</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.lime,
                    fontFamily: "Georgia,serif" }}>${metrics.platformFees.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 10, color: T.mist, marginTop: 8, lineHeight: 1.5 }}>
                  Based on {pods.length} pods · {metrics.totalGMV > 0 ? `$${Math.round(metrics.totalGMV).toLocaleString()}` : "—"} GMV
                </div>
              </Card>
            </div>

            {/* Key Insights */}
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>
                🔍 Key Insights
              </div>
              {insights.length === 0 ? (
                <div style={{ color: T.mist, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
                  No data yet — invite pods to the beta.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {insights.map(({ c, t }, i) => (
                    <div key={i} style={{ background: "#0A0A0A", borderRadius: 10, padding: 12,
                      borderLeft: `3px solid ${c}` }}>
                      <div style={{ fontSize: 12, color: T.chalk, lineHeight: 1.6 }}>{t}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── PODS ─────────────────────────────────────────────────────────────── */}
        {tab === "pods" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {["all", "active", "recruiting", "draft", "completed"].map(f => {
                const count = f === "all" ? pods.length : pods.filter(p => p.status === f).length;
                if (f !== "all" && count === 0) return null;
                return (
                  <div key={f} onClick={() => setPodFilter(f)}
                    style={{ padding: "5px 14px", borderRadius: 20, cursor: "pointer",
                      fontSize: 11, fontWeight: 700, transition: "all .2s",
                      background: podFilter === f ? T.lime : "#1A4A2E",
                      color: podFilter === f ? T.dark : T.mist }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                  </div>
                );
              })}
            </div>
            {filteredPods.length === 0 ? (
              <div style={{ textAlign: "center", color: T.mist, padding: "48px 0", fontSize: 13 }}>
                No pods in this category yet.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: T.forest, borderBottom: "1px solid #1A4A2E" }}>
                      {["Pod","Team","Members","Escrow","GMV","Games","Attend %","Resale","Status"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left",
                          color: T.mist, fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPods.map((pod, i) => {
                      const escrowPct  = pod.members > 0 ? Math.round((pod.escrowFunded / pod.members) * 100) : 0;
                      const attendPct  = pod.gamesTotal > 0 ? Math.round((pod.gamesAttended / pod.gamesTotal) * 100) : 0;
                      return (
                        <tr key={pod.id} style={{ background: i%2===0 ? "transparent" : "#0D2B1A44",
                          borderBottom: "1px solid #0D2B1A" }}>
                          <td style={{ padding: "9px 12px" }}>
                            <div style={{ fontWeight: 700, color: T.white }}>
                              {pod.sportEmoji} {pod.name}
                            </div>
                            <div style={{ fontSize: 10, color: T.mist }}>
                              Created {daysAgo(pod.created)}d ago
                            </div>
                          </td>
                          <td style={{ padding: "9px 12px", color: T.chalk }}>{pod.team}</td>
                          <td style={{ padding: "9px 12px", color: T.white }}>
                            {pod.members}/{pod.maxMembers}
                          </td>
                          <td style={{ padding: "9px 12px", fontWeight: 700,
                            color: escrowPct === 100 ? T.lime : escrowPct > 0 ? T.amber : T.red }}>
                            {escrowPct}%
                          </td>
                          <td style={{ padding: "9px 12px", color: T.lime, fontWeight: 700 }}>
                            {pod.gmv > 0 ? `$${Math.round(pod.gmv).toLocaleString()}` : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", color: T.chalk }}>
                            {pod.gamesTotal > 0 ? `${pod.gamesAttended}/${pod.gamesTotal}` : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", fontWeight: 700,
                            color: attendPct >= 70 ? T.lime : attendPct >= 40 ? T.amber : pod.gamesTotal > 0 ? T.red : T.mist }}>
                            {pod.gamesTotal > 0 ? `${attendPct}%` : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", color: T.teal }}>
                            {pod.resaleRevenue > 0 ? `$${Math.round(pod.resaleRevenue).toLocaleString()}` : "—"}
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <Badge color={statusColor[pod.status] || T.mist}>{pod.status}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── MEMBERS ──────────────────────────────────────────────────────────── */}
        {tab === "members" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.mist }}>Sort by:</span>
              {[["churnRisk","Churn Risk"],["referrals","Referrals"],["games","Games"]].map(([k, lbl]) => (
                <div key={k} onClick={() => setMemberSort(k)}
                  style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer",
                    fontSize: 11, fontWeight: 700, transition: "all .2s",
                    background: memberSort === k ? T.lime : "#1A4A2E",
                    color: memberSort === k ? T.dark : T.mist }}>{lbl}</div>
              ))}
            </div>
            {sortedMembers.length === 0 ? (
              <div style={{ textAlign: "center", color: T.mist, padding: "48px 0", fontSize: 13 }}>
                No members yet.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: T.forest, borderBottom: "1px solid #1A4A2E" }}>
                      {["Member","Pod","Verified","Funded","Games","Refs","Tier","Risk","Action"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left",
                          color: T.mist, fontWeight: 700, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMembers.map((m, i) => {
                      const action = !m.escrowFunded && daysAgo(m.joinedAt) >= 3 ? "Send reminder"
                        : m.churnRisk === "high" ? "Follow up"
                        : m.referrals >= 2 ? "Issue reward"
                        : "—";
                      return (
                        <tr key={m.id} style={{ background: i%2===0 ? "transparent" : "#0D2B1A44",
                          borderBottom: "1px solid #0D2B1A" }}>
                          <td style={{ padding: "9px 12px" }}>
                            <div style={{ fontWeight: 700, color: T.white }}>{m.name}</div>
                            <div style={{ fontSize: 10, color: T.mist }}>
                              Joined {daysAgo(m.joinedAt)}d ago
                            </div>
                          </td>
                          <td style={{ padding: "9px 12px", color: T.mist, fontSize: 11 }}>
                            {m.podName?.split(" ").slice(0,3).join(" ")}
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <Badge color={m.verified ? T.lime : T.red}>{m.verified ? "✓" : "✗"}</Badge>
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <Badge color={m.escrowFunded ? T.teal : T.amber}>
                              {m.escrowFunded ? "✓" : "Pending"}
                            </Badge>
                          </td>
                          <td style={{ padding: "9px 12px", color: T.chalk }}>
                            {m.gamesAttended}/{m.gamesAllocated}
                          </td>
                          <td style={{ padding: "9px 12px",
                            color: m.referrals > 0 ? T.lime : T.mist }}>
                            {m.referrals}
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <Badge color={m.tier === "captain" ? T.lime : m.tier === "pro" ? T.teal : T.mist}>
                              {m.tier}
                            </Badge>
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <Badge color={riskColor[m.churnRisk] || T.mist}>{m.churnRisk}</Badge>
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            {action !== "—"
                              ? <div style={{ background: `${T.lime}18`, color: T.lime,
                                  border: `1px solid ${T.lime}44`, borderRadius: 6,
                                  padding: "2px 8px", fontSize: 10, fontWeight: 700,
                                  cursor: "pointer", whiteSpace: "nowrap" }}>{action}</div>
                              : <span style={{ color: T.mist }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── WAITLIST ─────────────────────────────────────────────────────────── */}
        {tab === "waitlist" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
              <Stat label="Pending"  value={waitlist.filter(e => e.status === "pending").length}  color={T.amber} icon="⏳" />
              <Stat label="Approved" value={waitlist.filter(e => e.status === "approved").length} color={T.lime}  icon="✅" />
              <Stat label="Total"    value={waitlist.length}                                       color={T.mist}  icon="📋" />
            </div>

            {waitlistLoading ? (
              <div style={{ color: T.mist, textAlign: "center", padding: 40 }}>Loading…</div>
            ) : waitlist.length === 0 ? (
              <div style={{ color: T.mist, textAlign: "center", padding: 40 }}>No waitlist entries yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["pending", "approved", "rejected"].map(status => {
                  const entries = waitlist.filter(e => e.status === status);
                  if (entries.length === 0) return null;
                  const statusColor = status === "pending" ? T.amber : status === "approved" ? T.lime : T.red;
                  return (
                    <div key={status}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.mist,
                        letterSpacing: 1, marginBottom: 8, marginTop: 4 }}>
                        {status.toUpperCase()} ({entries.length})
                      </div>
                      {entries.map(entry => (
                        <Card key={entry.id} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between",
                            alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: T.white }}>
                                {entry.name || "—"}
                              </div>
                              <div style={{ fontSize: 12, color: T.mist }}>{entry.email}</div>
                              <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                                Joined {new Date(entry.created_at).toLocaleDateString()}
                                {entry.approved_at && ` · Approved ${new Date(entry.approved_at).toLocaleDateString()}`}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              {status === "pending" && (
                                <>
                                  <button
                                    disabled={waitlistBusy === entry.id}
                                    onClick={() => handleWaitlistAction(entry, "approve")}
                                    style={{ padding: "7px 14px", background: T.lime, color: T.dark,
                                      border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
                                      cursor: "pointer", opacity: waitlistBusy === entry.id ? 0.5 : 1 }}>
                                    {waitlistBusy === entry.id ? "…" : "Approve & Invite"}
                                  </button>
                                  <button
                                    disabled={waitlistBusy === entry.id}
                                    onClick={() => handleWaitlistAction(entry, "reject")}
                                    style={{ padding: "7px 12px", background: "transparent",
                                      border: `1px solid ${T.red}55`, color: T.red,
                                      borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                    Reject
                                  </button>
                                </>
                              )}
                              {status === "approved" && (
                                <Badge color={T.lime}>✓ Invite sent</Badge>
                              )}
                              {status === "rejected" && (
                                <Badge color={T.red}>Rejected</Badge>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SIGNUPS ──────────────────────────────────────────────────────────── */}
        {tab === "signups" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>
                All Signups — {signups.length} user{signups.length !== 1 ? "s" : ""}
              </div>
              <button onClick={loadSignups} disabled={signupsLoading}
                style={{ background: "transparent", border: `1px solid ${T.green}`,
                  borderRadius: 8, color: T.mist, fontSize: 11, padding: "4px 12px",
                  cursor: "pointer" }}>
                {signupsLoading ? "Loading…" : "↻ Refresh"}
              </button>
            </div>

            {signupsLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: T.mist }}>Loading…</div>
            ) : signups.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.mist }}>No signups yet</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1A4A2E" }}>
                      {["Name", "Email", "Signed Up", "Pod Status"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left",
                          color: T.mist, fontWeight: 700, fontSize: 10,
                          letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {signups.map((u, i) => (
                      <tr key={u.id} style={{
                        borderBottom: "1px solid #1A4A2E",
                        background: i % 2 === 0 ? "transparent" : "#0D1F1208",
                      }}>
                        {/* Name */}
                        <td style={{ padding: "10px 12px", color: T.white, fontWeight: 600 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {u.display_name || <span style={{ color: T.mist, fontStyle: "italic" }}>No name</span>}
                            {/^.+@halftime-app\.com$/i.test(u.email || "") && (
                              <Badge color={T.purple}>Demo</Badge>
                            )}
                          </span>
                        </td>
                        {/* Email */}
                        <td style={{ padding: "10px 12px", color: T.chalk }}>
                          {u.email}
                        </td>
                        {/* Signed up date */}
                        <td style={{ padding: "10px 12px", color: T.mist, whiteSpace: "nowrap" }}>
                          {u.created_at
                            ? new Date(u.created_at).toLocaleDateString("en-US",
                                { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                          <div style={{ fontSize: 10, opacity: 0.6 }}>
                            {daysAgo(u.created_at) === 0 ? "today" : `${daysAgo(u.created_at)}d ago`}
                          </div>
                        </td>
                        {/* Pod status */}
                        <td style={{ padding: "10px 12px" }}>
                          {u.in_pod ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Badge color={T.lime}>✓ In pod</Badge>
                              {u.pod_name && (
                                <span style={{ fontSize: 10, color: T.mist }}>{u.pod_name}</span>
                              )}
                            </div>
                          ) : (
                            <Badge color={T.amber}>No pod</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── FUNNEL ───────────────────────────────────────────────────────────── */}
        {tab === "funnel" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 16 }}>
                Full Activation Funnel
              </div>
              {[
                { stage: "1. Signed up",        n: metrics.totalProfiles    },
                { stage: "2. Joined a pod",      n: metrics.totalMembers     },
                { stage: "3. KYC verified",      n: metrics.verifiedMembers  },
                { stage: "4. Funded escrow",     n: metrics.fundedMembers    },
                { stage: "5. Got tickets",       n: metrics.allocatedMembers },
                { stage: "6. Attended a game",   n: metrics.attendedMembers  },
              ].map((row, i, arr) => {
                const drop = i > 0 && arr[i-1].n > 0
                  ? Math.round(((arr[i-1].n - row.n) / arr[i-1].n) * 100) : 0;
                const pct  = arr[0].n > 0 ? Math.round((row.n / arr[0].n) * 100) : 0;
                return (
                  <div key={row.stage} style={{ marginBottom: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: T.chalk }}>{row.stage}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        {drop > 0 && <span style={{ fontSize: 10, color: T.amber }}>↓{drop}%</span>}
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.lime }}>
                          {row.n} ({pct}%)
                        </span>
                      </div>
                    </div>
                    <Bar value={row.n} max={arr[0].n || 1} color={T.lime} h={6} />
                  </div>
                );
              })}
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 12 }}>
                  Weekly New Members
                </div>
                {weeklyData.length < 2 ? (
                  <div style={{ color: T.mist, fontSize: 11, textAlign: "center", padding: "16px 0" }}>
                    Not enough weeks of data yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
                    {weeklyData.map((w, i) => {
                      const mx = Math.max(...weeklyData.map(x => x.newMembers));
                      const h  = mx > 0 ? Math.round((w.newMembers / mx) * 50) + 4 : 4;
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
                          alignItems: "center", gap: 2 }}>
                          {w.newMembers > 0 && (
                            <div style={{ fontSize: 9, color: T.lime }}>{w.newMembers}</div>
                          )}
                          <div style={{ width: "100%", height: h,
                            background: i === weeklyData.length-1 ? T.lime : `${T.lime}55`,
                            borderRadius: "3px 3px 0 0" }} />
                          <div style={{ fontSize: 8, color: T.mist }}>{w.week.split(" ")[1]}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 12 }}>
                  Drop-off Analysis
                </div>
                {metrics.totalProfiles === 0 ? (
                  <div style={{ color: T.mist, fontSize: 11 }}>No data yet.</div>
                ) : (
                  [
                    { step: "Signed up → Joined pod",
                      rate: metrics.totalProfiles > 0 ? `${Math.round((metrics.totalMembers / metrics.totalProfiles) * 100)}%` : "—",
                      action: "Improve onboarding invite flow" },
                    { step: "Joined → KYC verified",
                      rate: metrics.totalMembers > 0 ? `${Math.round((metrics.verifiedMembers / metrics.totalMembers) * 100)}%` : "—",
                      action: "Add in-app KYC prompt after joining" },
                    { step: "Joined → Funded escrow",
                      rate: metrics.totalMembers > 0 ? `${Math.round((metrics.fundedMembers / metrics.totalMembers) * 100)}%` : "—",
                      action: "Trigger payment reminder 48h after joining" },
                    { step: "Funded → Attended game",
                      rate: metrics.fundedMembers > 0 ? `${Math.round((metrics.attendedMembers / metrics.fundedMembers) * 100)}%` : "—",
                      action: "Send 3-day pre-game reminder" },
                  ].map(r => (
                    <div key={r.step} style={{ padding: "8px 0", borderBottom: "1px solid #1A4A2E" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 11, color: T.white, fontWeight: 700 }}>{r.step}</span>
                        <Badge color={T.lime}>{r.rate}</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: T.mist }}>→ {r.action}</div>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ── REVENUE ──────────────────────────────────────────────────────────── */}
        {tab === "revenue" && (() => {
          const escrowFees   = pods.reduce((s, p) => s + p.gmv * 0.03, 0);
          const resaleFees   = pods.reduce((s, p) => s + p.resaleRevenue * 0.08, 0);
          const totalRevenue = escrowFees + resaleFees;
          const avgFeePerPod = pods.length > 0 ? totalRevenue / pods.length : 0;

          const weeklyRevenue = weeklyData.map(w => ({
            week: w.week,
            fees: Math.round(w.gmv * 0.03 + w.resaleRev * 0.08),
          }));
          const maxFees = Math.max(...weeklyRevenue.map(w => w.fees), 1);

          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                <Stat label="Total Revenue" icon="💰"
                  value={`$${Math.round(totalRevenue).toLocaleString()}`}
                  sub="beta cohort YTD" />
                <Stat label="Escrow Fees (3%)" icon="🏦" color={T.teal}
                  value={`$${Math.round(escrowFees).toLocaleString()}`}
                  sub={`from $${Math.round(metrics.totalGMV).toLocaleString()} GMV`} />
                <Stat label="Resale Fees (8%)" icon="♻️" color={T.amber}
                  value={`$${Math.round(resaleFees).toLocaleString()}`}
                  sub={`from $${Math.round(metrics.totalResale).toLocaleString()} resale vol`} />
                <Stat label="Avg per Pod" icon="📐" color={T.mist}
                  value={pods.length > 0 ? `$${Math.round(avgFeePerPod).toLocaleString()}` : "—"}
                  sub="across all pods" />
              </div>

              <Card style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 14 }}>
                  Weekly Platform Revenue
                </div>
                {weeklyRevenue.length < 2 ? (
                  <div style={{ color: T.mist, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
                    Not enough weeks of data yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 100 }}>
                    {weeklyRevenue.map((w, i) => {
                      const h = Math.round((w.fees / maxFees) * 80) + 4;
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
                          alignItems: "center", gap: 4 }}>
                          <div style={{ fontSize: 9, color: T.lime, fontWeight: 700 }}>
                            {w.fees > 0 ? `$${w.fees}` : "—"}
                          </div>
                          <div style={{ width: "100%", height: h,
                            background: i === weeklyRevenue.length - 1 ? T.lime : `${T.lime}55`,
                            borderRadius: "3px 3px 0 0" }} />
                          <div style={{ fontSize: 8, color: T.mist, whiteSpace: "nowrap" }}>
                            {w.week}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 14 }}>
                  Per-Pod Revenue Breakdown
                </div>
                {pods.length === 0 ? (
                  <div style={{ color: T.mist, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
                    No pods yet.
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px",
                      gap: 8, marginBottom: 10 }}>
                      {["Pod", "GMV", "Escrow Fee", "Resale Fee", "Total"].map(h => (
                        <div key={h} style={{ fontSize: 9, color: T.mist, fontWeight: 700, letterSpacing: 0.5 }}>
                          {h}
                        </div>
                      ))}
                    </div>
                    {[...pods]
                      .map(p => ({ ...p, totalFee: p.gmv * 0.03 + p.resaleRevenue * 0.08 }))
                      .sort((a, b) => b.totalFee - a.totalFee)
                      .map(p => (
                        <div key={p.id} style={{ display: "grid",
                          gridTemplateColumns: "1fr 80px 80px 80px 80px",
                          gap: 8, padding: "8px 0", borderBottom: "1px solid #1A4A2E",
                          alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 12, color: T.white, fontWeight: 600 }}>
                              {p.sportEmoji} {p.name}
                            </div>
                            <div style={{ fontSize: 10, color: T.mist }}>{p.team}</div>
                          </div>
                          <div style={{ fontSize: 12, color: T.chalk }}>
                            {p.gmv > 0 ? `$${Math.round(p.gmv).toLocaleString()}` : "—"}
                          </div>
                          <div style={{ fontSize: 12, color: T.teal }}>
                            ${Math.round(p.gmv * 0.03)}
                          </div>
                          <div style={{ fontSize: 12, color: T.amber }}>
                            {p.resaleRevenue > 0 ? `$${Math.round(p.resaleRevenue * 0.08)}` : "—"}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>
                            ${Math.round(p.totalFee)}
                          </div>
                        </div>
                      ))}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px",
                      gap: 8, padding: "10px 0 0" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.white }}>Totals</div>
                      <div style={{ fontSize: 12, color: T.chalk }}>
                        ${Math.round(metrics.totalGMV).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12, color: T.teal, fontWeight: 700 }}>
                        ${Math.round(escrowFees)}
                      </div>
                      <div style={{ fontSize: 12, color: T.amber, fontWeight: 700 }}>
                        ${Math.round(resaleFees)}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>
                        ${Math.round(totalRevenue)}
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </div>
          );
        })()}

        {/* ── RECEIPTS ─────────────────────────────────────────────────────────── */}
        {tab === "receipts" && (() => {
          const pending  = pods.filter(p => p.receiptUrl && !p.receiptVerified && !p.receiptRejected);
          const verified = pods.filter(p => p.receiptVerified);
          const rejected = pods.filter(p => p.receiptRejected);
          const noReceipt = pods.filter(p => !p.receiptUrl);

          const ReceiptRow = ({ pod }) => {
            const busy = receiptBusy === pod.id;
            const showReject = showRejectBox === pod.id;
            return (
              <div style={{ background: T.forest, border: "1px solid #1A4A2E",
                borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>
                      {pod.sportEmoji} {pod.name}
                    </div>
                    <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>
                      {pod.team} · ${Math.round(pod.gmv).toLocaleString()} season cost · {daysAgo(pod.created)}d ago
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {pod.receiptVerified && <Badge color={T.lime}>✓ Verified</Badge>}
                    {pod.receiptRejected && <Badge color={T.red}>✗ Rejected</Badge>}
                    {pod.receiptUrl && !pod.receiptVerified && !pod.receiptRejected && (
                      <Badge color={T.amber}>⏳ Pending</Badge>
                    )}
                  </div>
                </div>

                {/* Receipt note (if rejected) */}
                {pod.receiptNote && (
                  <div style={{ fontSize: 11, color: T.amber, background: `${T.amber}10`,
                    border: `1px solid ${T.amber}30`, borderRadius: 6,
                    padding: "6px 10px", marginBottom: 8 }}>
                    Note to member: "{pod.receiptNote}"
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {/* View receipt */}
                  {pod.receiptUrl && (
                    <a href={pod.receiptUrl} target="_blank" rel="noreferrer"
                      style={{ background: "#1A4A2E", color: T.chalk, border: "none",
                        borderRadius: 7, padding: "6px 14px", fontSize: 11,
                        fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>
                      👁 View Receipt
                    </a>
                  )}

                  {/* Verify button */}
                  {!pod.receiptVerified && pod.receiptUrl && (
                    <button disabled={busy} onClick={() => handleReceiptVerify(pod.id)}
                      style={{ background: `${T.lime}22`, color: T.lime,
                        border: `1px solid ${T.lime}44`, borderRadius: 7,
                        padding: "6px 14px", fontSize: 11, fontWeight: 700,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.5 : 1 }}>
                      {busy ? "…" : "✓ Verify"}
                    </button>
                  )}

                  {/* Reject / reject form toggle */}
                  {!pod.receiptRejected && pod.receiptUrl && (
                    <button disabled={busy} onClick={() => setShowRejectBox(showReject ? null : pod.id)}
                      style={{ background: `${T.red}18`, color: T.red,
                        border: `1px solid ${T.red}44`, borderRadius: 7,
                        padding: "6px 14px", fontSize: 11, fontWeight: 700,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.5 : 1 }}>
                      ✗ Reject
                    </button>
                  )}

                  {/* Reset to pending */}
                  {(pod.receiptVerified || pod.receiptRejected) && (
                    <button disabled={busy} onClick={() => handleReceiptReset(pod.id)}
                      style={{ background: "transparent", color: T.mist,
                        border: `1px solid #1A4A2E`, borderRadius: 7,
                        padding: "6px 14px", fontSize: 11,
                        cursor: busy ? "not-allowed" : "pointer" }}>
                      ↺ Reset
                    </button>
                  )}
                </div>

                {/* Inline rejection note form */}
                {showReject && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      rows={2}
                      placeholder="Optional note to captain / members (e.g. 'Receipt amount doesn't match stated cost')"
                      value={rejectNote[pod.id] || ""}
                      onChange={e => setRejectNote(n => ({ ...n, [pod.id]: e.target.value }))}
                      style={{ width: "100%", padding: "9px 11px", background: T.dark,
                        border: `1px solid ${T.red}44`, borderRadius: 8, color: T.white,
                        fontSize: 12, fontFamily: "Calibri,sans-serif", outline: "none",
                        resize: "none", boxSizing: "border-box" }}
                    />
                    <button onClick={() => handleReceiptReject(pod.id)}
                      style={{ marginTop: 6, background: T.red, color: T.white,
                        border: "none", borderRadius: 7, padding: "7px 16px",
                        fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Confirm Rejection
                    </button>
                  </div>
                )}
              </div>
            );
          };

          return (
            <div>
              {/* Summary stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                <Stat label="Pending Review" icon="⏳" color={T.amber} value={pending.length} />
                <Stat label="Verified"       icon="✓"  color={T.lime}  value={verified.length} />
                <Stat label="Rejected"       icon="✗"  color={T.red}   value={rejected.length} />
                <Stat label="No Receipt"     icon="📄" color={T.mist}  value={noReceipt.length} />
              </div>

              {/* Pending */}
              {pending.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.amber,
                    marginBottom: 10, letterSpacing: 0.5 }}>
                    ⏳ PENDING REVIEW ({pending.length})
                  </div>
                  {pending.map(pod => <ReceiptRow key={pod.id} pod={pod} />)}
                </div>
              )}

              {/* Verified */}
              {verified.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.lime,
                    marginBottom: 10, letterSpacing: 0.5 }}>
                    ✓ VERIFIED ({verified.length})
                  </div>
                  {verified.map(pod => <ReceiptRow key={pod.id} pod={pod} />)}
                </div>
              )}

              {/* Rejected */}
              {rejected.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.red,
                    marginBottom: 10, letterSpacing: 0.5 }}>
                    ✗ REJECTED ({rejected.length})
                  </div>
                  {rejected.map(pod => <ReceiptRow key={pod.id} pod={pod} />)}
                </div>
              )}

              {/* No receipt */}
              {noReceipt.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.mist,
                    marginBottom: 10, letterSpacing: 0.5 }}>
                    📄 NO RECEIPT UPLOADED ({noReceipt.length})
                  </div>
                  {noReceipt.map(pod => (
                    <div key={pod.id} style={{ background: T.forest,
                      border: "1px solid #1A4A2E", borderRadius: 12,
                      padding: "12px 14px", marginBottom: 8,
                      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.white }}>
                          {pod.sportEmoji} {pod.name}
                        </div>
                        <div style={{ fontSize: 10, color: T.mist, marginTop: 2 }}>
                          {pod.team} · ${Math.round(pod.gmv).toLocaleString()} · {daysAgo(pod.created)}d old
                        </div>
                      </div>
                      <Badge color={pod.status === "active" ? T.amber : T.mist}>
                        {pod.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {pods.length === 0 && (
                <div style={{ textAlign: "center", color: T.mist, padding: "48px 0", fontSize: 13 }}>
                  No pods yet.
                </div>
              )}
            </div>
          );
        })()}

        {/* ── CODES ────────────────────────────────────────────────────────────── */}
        {tab === "codes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 14 }}>
                🔑 Create Invite Code
              </div>
              {codesMsg && (
                <div style={{
                  background: codesMsg.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(52,211,153,0.15)",
                  border: `1px solid ${codesMsg.type === "error" ? T.red : T.teal}`,
                  borderRadius: 8, padding: "9px 13px", fontSize: 12,
                  color: codesMsg.type === "error" ? T.red : T.teal, marginBottom: 12,
                }}>
                  {codesMsg.msg}
                </div>
              )}
              <form onSubmit={handleCreateCode}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 10, alignItems: "end" }}>
                <div>
                  <div style={{ fontSize: 10, color: T.mist, fontWeight: 700, marginBottom: 5,
                    textTransform: "uppercase" }}>Code</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={newCodeVal} onChange={e => setNewCodeVal(e.target.value.toUpperCase())}
                      placeholder="HALFTIME6" required
                      style={{ flex: 1, background: T.dark, border: `1px solid ${T.green}`,
                        borderRadius: 8, padding: "9px 11px", color: T.white,
                        fontSize: 13, fontFamily: "monospace", outline: "none" }} />
                    <button type="button" onClick={generateRandomCode} title="Generate random code"
                      style={{ background: "#1A4A2E", border: "none", borderRadius: 8,
                        padding: "9px 12px", color: T.mist, fontSize: 13, cursor: "pointer" }}>🎲</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.mist, fontWeight: 700, marginBottom: 5,
                    textTransform: "uppercase" }}>Label (optional)</div>
                  <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                    placeholder="For Jordan K."
                    style={{ width: "100%", background: T.dark, border: `1px solid ${T.green}`,
                      borderRadius: 8, padding: "9px 11px", color: T.white,
                      fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.mist, fontWeight: 700, marginBottom: 5,
                    textTransform: "uppercase" }}>Max uses</div>
                  <input type="number" value={newMaxUses} onChange={e => setNewMaxUses(e.target.value)}
                    min="0"
                    style={{ width: 70, background: T.dark, border: `1px solid ${T.green}`,
                      borderRadius: 8, padding: "9px 11px", color: T.white, fontSize: 13, outline: "none" }} />
                </div>
                <button type="submit" disabled={codesBusy || !newCodeVal.trim()}
                  style={{ background: T.lime, border: "none", borderRadius: 8,
                    padding: "9px 18px", color: T.dark, fontSize: 13, fontWeight: 700,
                    cursor: codesBusy ? "not-allowed" : "pointer",
                    opacity: codesBusy ? 0.6 : 1, whiteSpace: "nowrap" }}>
                  {codesBusy ? "…" : "Create →"}
                </button>
              </form>
              <div style={{ fontSize: 10, color: T.mist, marginTop: 10 }}>
                Max uses: <strong style={{ color: T.chalk }}>0 = unlimited</strong> · Codes are case-insensitive
              </div>
            </Card>

            <Card>
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>All Invite Codes</div>
                <button onClick={loadCodes}
                  style={{ background: "#1A4A2E", border: "none", borderRadius: 6,
                    padding: "5px 12px", color: T.mist, fontSize: 11, cursor: "pointer" }}>
                  ↻ Refresh
                </button>
              </div>
              {codesLoading ? (
                <div style={{ textAlign: "center", color: T.mist, padding: 24, fontSize: 13 }}>
                  Loading codes…
                </div>
              ) : codes.length === 0 ? (
                <div style={{ textAlign: "center", color: T.mist, padding: 24, fontSize: 13 }}>
                  No codes yet. Create one above.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1A4A2E" }}>
                        {["Code","Label","Uses","Status","Expires","Created",""].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left",
                            color: T.mist, fontWeight: 700, fontSize: 10,
                            textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((c, i) => {
                        const isExpired   = c.expires_at && new Date(c.expires_at) < new Date();
                        const isExhausted = c.max_uses > 0 && c.use_count >= c.max_uses;
                        const sColor      = isExpired || isExhausted ? T.red : T.lime;
                        const sLabel      = isExpired ? "Expired" : isExhausted ? "Used up" : "Active";
                        return (
                          <tr key={c.id}
                            style={{ background: i%2===0 ? "transparent" : "#0D2B1A44",
                              borderBottom: "1px solid #0D2B1A" }}>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 13,
                                fontWeight: 700, color: T.white, letterSpacing: 1 }}>{c.code}</span>
                            </td>
                            <td style={{ padding: "9px 12px", color: T.mist, fontSize: 11 }}>
                              {c.label || <span style={{ opacity: 0.4 }}>—</span>}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ color: c.use_count > 0 ? T.lime : T.mist, fontWeight: 700 }}>
                                {c.max_uses === 0 ? `${c.use_count} / ∞` : `${c.use_count} / ${c.max_uses}`}
                              </span>
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <Badge color={sColor}>{sLabel}</Badge>
                            </td>
                            <td style={{ padding: "9px 12px", color: T.mist, fontSize: 11 }}>
                              {c.expires_at
                                ? new Date(c.expires_at).toLocaleDateString()
                                : <span style={{ opacity: 0.4 }}>Never</span>}
                            </td>
                            <td style={{ padding: "9px 12px", color: T.mist, fontSize: 10 }}>
                              {new Date(c.created_at).toLocaleDateString()}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <button onClick={() => handleDeleteCode(c.id, c.code)}
                                style={{ background: "rgba(239,68,68,0.15)",
                                  border: "1px solid rgba(239,68,68,0.3)",
                                  borderRadius: 6, padding: "3px 10px",
                                  color: T.red, fontSize: 11, cursor: "pointer" }}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── ALERTS ───────────────────────────────────────────────────────────── */}
        {tab === "alerts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alerts.map((alert, i) => (
              <div key={i} style={{
                background: T.forest,
                border: `1px solid ${alert.sev === "high" ? T.red+"44" : alert.sev === "medium" ? T.amber+"44" : "#1A4A2E"}`,
                borderLeft: `4px solid ${alert.sev === "high" ? T.red : alert.sev === "medium" ? T.amber : T.lime}`,
                borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>
                    {alert.icon} {alert.title}
                  </div>
                  <Badge color={alert.sev === "high" ? T.red : alert.sev === "medium" ? T.amber : T.lime}>
                    {alert.sev}
                  </Badge>
                </div>
                <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.5, marginBottom: alert.action ? 10 : 0 }}>
                  {alert.body}
                </div>
                {alert.action && (
                  <div style={{ background: `${T.lime}18`, color: T.lime, border: `1px solid ${T.lime}33`,
                    borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700,
                    display: "inline-block", cursor: "pointer" }}>
                    → {alert.action}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

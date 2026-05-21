import { useState, useMemo } from "react";
import { T } from "../../tokens";

// ─── Data ───────────────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const PODS_DATA = [
  { id:"P001", name:"Section 114 Squad",   team:"Bulls",      sport:"🏀", members:4, maxMembers:6, escrowFunded:4, escrowPending:0, gmv:7400,  gamesTotal:12, gamesAttended:8,  gamesResold:3, resaleRevenue:680,  renewalIntent:"yes",     nps:9,    status:"active",     created:daysAgo(45) },
  { id:"P002", name:"Wrigley Faithful",    team:"Cubs",       sport:"⚾", members:6, maxMembers:8, escrowFunded:5, escrowPending:1, gmv:9900,  gamesTotal:20, gamesAttended:14, gamesResold:5, resaleRevenue:1100, renewalIntent:"yes",     nps:8,    status:"active",     created:daysAgo(38) },
  { id:"P003", name:"North End Bloc",      team:"Fire FC",    sport:"⚽", members:3, maxMembers:4, escrowFunded:3, escrowPending:0, gmv:2040,  gamesTotal:6,  gamesAttended:4,  gamesResold:1, resaleRevenue:180,  renewalIntent:"yes",     nps:10,   status:"active",     created:daysAgo(30) },
  { id:"P004", name:"The Madhouse Crew",   team:"Blackhawks", sport:"🏒", members:4, maxMembers:4, escrowFunded:4, escrowPending:0, gmv:6800,  gamesTotal:10, gamesAttended:7,  gamesResold:2, resaleRevenue:420,  renewalIntent:"yes",     nps:8,    status:"active",     created:daysAgo(28) },
  { id:"P005", name:"Soldier Field South", team:"Bears",      sport:"🏈", members:5, maxMembers:6, escrowFunded:4, escrowPending:1, gmv:8500,  gamesTotal:5,  gamesAttended:3,  gamesResold:1, resaleRevenue:390,  renewalIntent:"maybe",   nps:7,    status:"active",     created:daysAgo(22) },
  { id:"P006", name:"Section 220 Crew",    team:"Bulls",      sport:"🏀", members:3, maxMembers:4, escrowFunded:2, escrowPending:1, gmv:1850,  gamesTotal:12, gamesAttended:2,  gamesResold:0, resaleRevenue:0,    renewalIntent:"unknown", nps:6,    status:"partial",    created:daysAgo(18) },
  { id:"P007", name:"Crosstown Pod",       team:"White Sox",  sport:"⚾", members:2, maxMembers:4, escrowFunded:2, escrowPending:0, gmv:2600,  gamesTotal:8,  gamesAttended:3,  gamesResold:2, resaleRevenue:310,  renewalIntent:"yes",     nps:9,    status:"active",     created:daysAgo(15) },
  { id:"P008", name:"Skyline Four",        team:"Bulls",      sport:"🏀", members:2, maxMembers:4, escrowFunded:1, escrowPending:1, gmv:1850,  gamesTotal:12, gamesAttended:1,  gamesResold:0, resaleRevenue:0,    renewalIntent:"unknown", nps:null, status:"partial",    created:daysAgo(10) },
  { id:"P009", name:"Logan Square Bloc",   team:"Cubs",       sport:"⚾", members:4, maxMembers:4, escrowFunded:4, escrowPending:0, gmv:6600,  gamesTotal:15, gamesAttended:10, gamesResold:3, resaleRevenue:720,  renewalIntent:"yes",     nps:10,   status:"active",     created:daysAgo(8)  },
  { id:"P010", name:"United Center Six",   team:"Blackhawks", sport:"🏒", members:2, maxMembers:6, escrowFunded:2, escrowPending:0, gmv:2260,  gamesTotal:4,  gamesAttended:2,  gamesResold:0, resaleRevenue:0,    renewalIntent:"yes",     nps:8,    status:"recruiting", created:daysAgo(5)  },
];

const MEMBERS_DATA = [
  { id:"M001", name:"Jordan K.", pod:"P001", verified:true,  escrowFunded:true,  gamesAllocated:3, gamesAttended:3, nps:9,    referrals:2, tier:"pro",     churnRisk:"low"    },
  { id:"M002", name:"Alex M.",   pod:"P001", verified:true,  escrowFunded:true,  gamesAllocated:3, gamesAttended:2, nps:8,    referrals:1, tier:"pro",     churnRisk:"low"    },
  { id:"M003", name:"Sam R.",    pod:"P001", verified:true,  escrowFunded:true,  gamesAllocated:3, gamesAttended:2, nps:9,    referrals:0, tier:"starter", churnRisk:"low"    },
  { id:"M004", name:"Morgan T.", pod:"P001", verified:true,  escrowFunded:true,  gamesAllocated:3, gamesAttended:1, nps:7,    referrals:0, tier:"starter", churnRisk:"medium" },
  { id:"M005", name:"Casey B.",  pod:"P002", verified:true,  escrowFunded:true,  gamesAllocated:4, gamesAttended:3, nps:8,    referrals:2, tier:"captain", churnRisk:"low"    },
  { id:"M006", name:"Riley S.",  pod:"P002", verified:true,  escrowFunded:false, gamesAllocated:3, gamesAttended:2, nps:null, referrals:0, tier:"starter", churnRisk:"high"   },
  { id:"M007", name:"Drew W.",   pod:"P003", verified:true,  escrowFunded:true,  gamesAllocated:2, gamesAttended:2, nps:10,   referrals:1, tier:"pro",     churnRisk:"low"    },
  { id:"M008", name:"Quinn A.",  pod:"P006", verified:true,  escrowFunded:true,  gamesAllocated:1, gamesAttended:0, nps:6,    referrals:0, tier:"starter", churnRisk:"high"   },
  { id:"M009", name:"Sage L.",   pod:"P008", verified:false, escrowFunded:false, gamesAllocated:0, gamesAttended:0, nps:null, referrals:0, tier:"starter", churnRisk:"high"   },
  { id:"M010", name:"Blake N.",  pod:"P009", verified:true,  escrowFunded:true,  gamesAllocated:4, gamesAttended:3, nps:10,   referrals:3, tier:"captain", churnRisk:"low"    },
];

const WEEKLY_DATA = [
  { week:"Dec W1", newPods:1, newMembers:3, gmv:7400,  resaleRev:180  },
  { week:"Dec W2", newPods:2, newMembers:7, gmv:12540, resaleRev:420  },
  { week:"Dec W3", newPods:1, newMembers:4, gmv:6800,  resaleRev:310  },
  { week:"Dec W4", newPods:2, newMembers:6, gmv:10540, resaleRev:580  },
  { week:"Jan W1", newPods:1, newMembers:5, gmv:8500,  resaleRev:390  },
  { week:"Jan W2", newPods:2, newMembers:4, gmv:4110,  resaleRev:310  },
  { week:"Jan W3", newPods:1, newMembers:3, gmv:2260,  resaleRev:180  },
];

// ─── Primitives ────────────────────────────────────────────────────────────────
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

// ─── Main Component ────────────────────────────────────────────────────────────
export default function BetaDashboard() {
  const [tab, setTab] = useState("overview");
  const [podFilter, setPodFilter] = useState("all");
  const [memberSort, setMemberSort] = useState("churnRisk");

  const metrics = useMemo(() => {
    const totalMembers = MEMBERS_DATA.length;
    const verifiedMembers = MEMBERS_DATA.filter(m => m.verified).length;
    const fundedMembers = MEMBERS_DATA.filter(m => m.escrowFunded).length;
    const totalGMV = PODS_DATA.reduce((s, p) => s + p.gmv, 0);
    const totalResale = PODS_DATA.reduce((s, p) => s + p.resaleRevenue, 0);
    const totalGamesAttended = PODS_DATA.reduce((s, p) => s + p.gamesAttended, 0);
    const totalGamesTotal = PODS_DATA.reduce((s, p) => s + p.gamesTotal, 0);
    const attendanceRate = totalGamesTotal ? Math.round((totalGamesAttended / totalGamesTotal) * 100) : 0;
    const npsScores = MEMBERS_DATA.filter(m => m.nps).map(m => m.nps);
    const avgNPS = npsScores.length
      ? Math.round(npsScores.reduce((a, b) => a + b) / npsScores.length * 10) / 10 : 0;
    const renewalYes = PODS_DATA.filter(p => p.renewalIntent === "yes").length;
    const renewalRate = Math.round((renewalYes / PODS_DATA.length) * 100);
    const platformFees = totalResale * 0.08 + totalMembers * 52 + totalGamesAttended * 4.99;
    const activePods = PODS_DATA.filter(p => p.status === "active").length;
    return {
      activePods, totalPods: PODS_DATA.length, totalMembers, verifiedMembers, fundedMembers,
      totalGMV, totalResale, attendanceRate, avgNPS, renewalRate,
      highRisk: MEMBERS_DATA.filter(m => m.churnRisk === "high").length,
      platformFees: Math.round(platformFees),
    };
  }, []);

  const sortedMembers = useMemo(() => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return [...MEMBERS_DATA].sort((a, b) => {
      if (memberSort === "churnRisk") return riskOrder[a.churnRisk] - riskOrder[b.churnRisk];
      if (memberSort === "nps") return (b.nps || 0) - (a.nps || 0);
      if (memberSort === "referrals") return b.referrals - a.referrals;
      return 0;
    });
  }, [memberSort]);

  const filteredPods = podFilter === "all" ? PODS_DATA : PODS_DATA.filter(p => p.status === podFilter);
  const riskColor = { low: T.lime, medium: T.amber, high: T.red };
  const statusColor = { active: T.lime, partial: T.amber, recruiting: T.teal };

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.lime,
            boxShadow: `0 0 6px ${T.lime}` }} />
          <span style={{ fontSize: 11, color: T.mist }}>
            Live · {PODS_DATA.length} pods · {MEMBERS_DATA.length} members
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1A4A2E",
        background: T.dark, padding: "0 24px" }}>
        {[["overview","📊 Overview"],["pods","🏟️ Pods"],["members","👥 Members"],
          ["funnel","🔽 Funnel"],["alerts","🚨 Alerts"]].map(([k, lbl]) => (
          <div key={k} onClick={() => setTab(k)}
            style={{ padding: "12px 16px", fontSize: 12, fontWeight: 700,
              color: tab === k ? T.lime : T.mist,
              borderBottom: `2px solid ${tab === k ? T.lime : "transparent"}`,
              cursor: "pointer", whiteSpace: "nowrap" }}>{lbl}</div>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 12 }}>
              <Stat label="Total GMV" value={`$${(metrics.totalGMV / 1000).toFixed(1)}K`} sub="since beta launch" icon="💰" />
              <Stat label="Active Pods" value={metrics.activePods} sub={`of ${metrics.totalPods} total`} color={T.teal} icon="🏟️" />
              <Stat label="Members" value={metrics.totalMembers} sub={`${metrics.fundedMembers} escrow funded`} icon="👥" />
              <Stat label="Renewal Intent" value={`${metrics.renewalRate}%`} sub="saying yes" icon="🔄" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
              <Stat label="Avg NPS" value={metrics.avgNPS} sub="out of 10" color={T.teal} icon="⭐" />
              <Stat label="Attendance Rate" value={`${metrics.attendanceRate}%`} sub="games attended/allocated" icon="🎟️" />
              <Stat label="Resale Revenue" value={`$${metrics.totalResale.toLocaleString()}`} sub="distributed to members" color={T.amber} icon="♻️" />
              <Stat label="Platform Fees" value={`$${metrics.platformFees.toLocaleString()}`} sub="est. from beta cohort" color={T.purple} icon="📈" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {/* Weekly GMV chart */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>Weekly GMV ($)</div>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 80 }}>
                  {WEEKLY_DATA.map((w, i) => {
                    const mx = Math.max(...WEEKLY_DATA.map(x => x.gmv));
                    const h = Math.round((w.gmv / mx) * 70) + 4;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 3 }}>
                        <div style={{ width: "100%", height: h,
                          background: i === WEEKLY_DATA.length - 1 ? T.lime : `${T.lime}55`,
                          borderRadius: "3px 3px 0 0" }} />
                        <div style={{ fontSize: 8, color: T.mist }}>{w.week.split(" ")[1]}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: T.mist, marginTop: 8 }}>
                  Trend: <span style={{ color: T.lime }}>↗ +12% WoW</span>
                </div>
              </Card>

              {/* Activation funnel */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>Activation Funnel</div>
                {[
                  { stage: "Signed up",      n: metrics.totalMembers,    color: T.mist  },
                  { stage: "Verified KYC",   n: metrics.verifiedMembers, color: T.teal  },
                  { stage: "Joined pod",     n: metrics.fundedMembers+2, color: T.lime2 },
                  { stage: "Funded escrow",  n: metrics.fundedMembers,   color: T.lime  },
                  { stage: "Attended game",  n: MEMBERS_DATA.filter(m => m.gamesAttended > 0).length, color: T.lime },
                ].map((row, i, arr) => {
                  const drop = i > 0 ? Math.round(((arr[i-1].n - row.n) / arr[i-1].n) * 100) : 0;
                  return (
                    <div key={row.stage} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: T.chalk }}>{row.stage}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          {drop > 0 && <span style={{ fontSize: 10, color: T.amber }}>-{drop}%</span>}
                          <span style={{ fontSize: 10, fontWeight: 700, color: row.color }}>{row.n}</span>
                        </div>
                      </div>
                      <Bar value={row.n} max={arr[0].n} color={row.color} h={5} />
                    </div>
                  );
                })}
              </Card>

              {/* Revenue mix */}
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>Revenue Mix</div>
                {[
                  { label: "Resale commission", val: Math.round(metrics.totalResale * 0.08), color: T.lime },
                  { label: "Membership fees",   val: metrics.totalMembers * 52,             color: T.teal },
                  { label: "Transfer fees",     val: Math.round(metrics.totalGMV / 240),    color: T.amber },
                  { label: "Premium services",  val: 240,                                   color: T.purple },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: T.chalk }}>{row.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: row.color }}>
                        ${row.val.toLocaleString()}
                      </span>
                    </div>
                    <Bar value={row.val} max={metrics.platformFees} color={row.color} h={4} />
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1A4A2E",
                  display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: T.mist }}>Total fees earned</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                    fontFamily: "Georgia,serif" }}>${metrics.platformFees.toLocaleString()}</span>
                </div>
              </Card>
            </div>

            {/* Insights */}
            <Card>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.white, marginBottom: 12 }}>🔍 Key Insights</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { c: T.lime, t: "P009 (Logan Square) hit 100% escrow funding in 8 days — fastest in cohort. Investigate referral-loop pattern for replication." },
                  { c: T.red,  t: "M006 + M009 are high churn risk: unfunded escrow, no games attended. Trigger Email 4/5 urgency sequence immediately." },
                  { c: T.amber,t: "Resale conversion dropped to 67% this week (from 84%). Pricing slider defaults may need adjustment." },
                  { c: T.lime, t: "M010 (Blake N.) referred 3 members — activate referral reward and request a testimonial for the pitch deck." },
                ].map(({ c, t }, i) => (
                  <div key={i} style={{ background: "#0A0A0A", borderRadius: 10, padding: 12,
                    borderLeft: `3px solid ${c}` }}>
                    <div style={{ fontSize: 12, color: T.chalk, lineHeight: 1.6 }}>{t}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── PODS ── */}
        {tab === "pods" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["all", "active", "partial", "recruiting"].map(f => (
                <div key={f} onClick={() => setPodFilter(f)}
                  style={{ padding: "5px 14px", borderRadius: 20, cursor: "pointer",
                    fontSize: 11, fontWeight: 700,
                    background: podFilter === f ? T.lime : "#1A4A2E",
                    color: podFilter === f ? T.dark : T.mist, transition: "all .2s" }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}&nbsp;
                  ({f === "all" ? PODS_DATA.length : PODS_DATA.filter(p => p.status === f).length})
                </div>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.forest, borderBottom: "1px solid #1A4A2E" }}>
                    {["Pod","Team","Members","Escrow %","GMV","Attend %","Resale","NPS","Renewal","Status"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left",
                        color: T.mist, fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPods.map((pod, i) => {
                    const escrowPct = Math.round((pod.escrowFunded / (pod.escrowFunded + pod.escrowPending)) * 100) || 0;
                    const attendPct = pod.gamesTotal ? Math.round((pod.gamesAttended / pod.gamesTotal) * 100) : 0;
                    return (
                      <tr key={pod.id} style={{ background: i%2===0 ? "transparent" : "#0D2B1A44", borderBottom: "1px solid #0D2B1A" }}>
                        <td style={{ padding: "9px 12px" }}>
                          <div style={{ fontWeight: 700, color: T.white }}>{pod.sport} {pod.name}</div>
                          <div style={{ fontSize: 10, color: T.mist }}>{pod.id}</div>
                        </td>
                        <td style={{ padding: "9px 12px", color: T.chalk }}>{pod.team}</td>
                        <td style={{ padding: "9px 12px", color: T.white }}>{pod.members}/{pod.maxMembers}</td>
                        <td style={{ padding: "9px 12px", color: escrowPct===100 ? T.lime : T.amber, fontWeight: 700 }}>{escrowPct}%</td>
                        <td style={{ padding: "9px 12px", color: T.lime, fontWeight: 700 }}>${pod.gmv.toLocaleString()}</td>
                        <td style={{ padding: "9px 12px", color: attendPct>=70 ? T.lime : attendPct>=50 ? T.amber : T.red, fontWeight: 700 }}>{attendPct}%</td>
                        <td style={{ padding: "9px 12px", color: T.teal }}>${pod.resaleRevenue.toLocaleString()}</td>
                        <td style={{ padding: "9px 12px", color: pod.nps>=8 ? T.lime : pod.nps>=6 ? T.amber : T.red }}>{pod.nps||"—"}/10</td>
                        <td style={{ padding: "9px 12px" }}><Badge color={pod.renewalIntent==="yes" ? T.lime : pod.renewalIntent==="maybe" ? T.amber : T.mist}>{pod.renewalIntent}</Badge></td>
                        <td style={{ padding: "9px 12px" }}><Badge color={statusColor[pod.status]}>{pod.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── MEMBERS ── */}
        {tab === "members" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.mist }}>Sort by:</span>
              {[["churnRisk","Churn Risk"],["nps","NPS"],["referrals","Referrals"]].map(([k, lbl]) => (
                <div key={k} onClick={() => setMemberSort(k)}
                  style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer",
                    fontSize: 11, fontWeight: 700,
                    background: memberSort === k ? T.lime : "#1A4A2E",
                    color: memberSort === k ? T.dark : T.mist, transition: "all .2s" }}>{lbl}</div>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.forest, borderBottom: "1px solid #1A4A2E" }}>
                    {["Member","Pod","Verified","Funded","Games","NPS","Refs","Tier","Risk","Action"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left",
                        color: T.mist, fontWeight: 700, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m, i) => {
                    const pod = PODS_DATA.find(p => p.id === m.pod);
                    const action = m.churnRisk==="high" && !m.escrowFunded ? "Send Email 4"
                      : m.churnRisk==="high" ? "Call/DM"
                      : m.referrals>=2 ? "Issue reward" : "—";
                    return (
                      <tr key={m.id} style={{ background: i%2===0 ? "transparent" : "#0D2B1A44", borderBottom: "1px solid #0D2B1A" }}>
                        <td style={{ padding: "9px 12px" }}><div style={{ fontWeight: 700, color: T.white }}>{m.name}</div><div style={{ fontSize: 10, color: T.mist }}>{m.id}</div></td>
                        <td style={{ padding: "9px 12px", color: T.mist, fontSize: 11 }}>{pod?.name?.split(" ").slice(0,2).join(" ")}</td>
                        <td style={{ padding: "9px 12px" }}><Badge color={m.verified ? T.lime : T.red}>{m.verified ? "✓" : "✗"}</Badge></td>
                        <td style={{ padding: "9px 12px" }}><Badge color={m.escrowFunded ? T.teal : T.amber}>{m.escrowFunded ? "✓" : "Pending"}</Badge></td>
                        <td style={{ padding: "9px 12px", color: T.chalk }}>{m.gamesAttended}/{m.gamesAllocated}</td>
                        <td style={{ padding: "9px 12px", color: m.nps>=8 ? T.lime : m.nps>=6 ? T.amber : m.nps ? T.red : T.mist }}>{m.nps||"—"}</td>
                        <td style={{ padding: "9px 12px", color: m.referrals>0 ? T.lime : T.mist }}>{m.referrals}</td>
                        <td style={{ padding: "9px 12px" }}><Badge color={m.tier==="captain" ? T.lime : m.tier==="pro" ? T.teal : T.mist}>{m.tier}</Badge></td>
                        <td style={{ padding: "9px 12px" }}><Badge color={riskColor[m.churnRisk]}>{m.churnRisk}</Badge></td>
                        <td style={{ padding: "9px 12px" }}>
                          {action !== "—"
                            ? <div style={{ background: `${T.lime}18`, color: T.lime, border: `1px solid ${T.lime}44`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{action}</div>
                            : <span style={{ color: T.mist }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── FUNNEL ── */}
        {tab === "funnel" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 16 }}>Full Activation Funnel</div>
              {[
                { stage: "1. Signed up",        n: metrics.totalMembers },
                { stage: "2. Completed KYC",    n: metrics.verifiedMembers },
                { stage: "3. Joined a pod",     n: metrics.fundedMembers+2 },
                { stage: "4. Funded escrow",    n: metrics.fundedMembers },
                { stage: "5. Received tickets", n: MEMBERS_DATA.filter(m=>m.gamesAllocated>0).length },
                { stage: "6. Attended a game",  n: MEMBERS_DATA.filter(m=>m.gamesAttended>0).length },
                { stage: "7. Left a review",    n: MEMBERS_DATA.filter(m=>m.nps).length },
                { stage: "8. Made a referral",  n: MEMBERS_DATA.filter(m=>m.referrals>0).length },
              ].map((row, i, arr) => {
                const drop = i > 0 ? Math.round(((arr[i-1].n - row.n) / arr[i-1].n) * 100) : 0;
                return (
                  <div key={row.stage} style={{ marginBottom: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: T.chalk }}>{row.stage}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        {drop > 0 && <span style={{ fontSize: 10, color: T.amber }}>↓{drop}%</span>}
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.lime }}>
                          {row.n} ({Math.round((row.n/arr[0].n)*100)}%)
                        </span>
                      </div>
                    </div>
                    <Bar value={row.n} max={arr[0].n} color={T.lime} h={6} />
                  </div>
                );
              })}
            </Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 12 }}>Biggest Drop-offs & Actions</div>
                {[
                  { step: "Pod join → Funded escrow", rate: "78%", action: "Trigger Email 3 within 12h of pod join (currently 48h)", sev: "high" },
                  { step: "Funded → Attended game",   rate: "72%", action: "Add 3-day pre-game reminder — not currently in sequence", sev: "high" },
                  { step: "Attended → Left review",   rate: "64%", action: "A/B test in-app prompt timing: immediate vs. next morning", sev: "med" },
                  { step: "Review → Referral",        rate: "44%", action: "Referral ask is too generic — personalise with savings figure", sev: "med" },
                ].map(r => (
                  <div key={r.step} style={{ padding: "9px 0", borderBottom: "1px solid #1A4A2E" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: T.white, fontWeight: 700 }}>{r.step}</span>
                      <Badge color={r.sev === "high" ? T.red : T.amber}>{r.rate}</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: T.mist }}>→ {r.action}</div>
                  </div>
                ))}
              </Card>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white, marginBottom: 12 }}>Weekly New Members</div>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
                  {WEEKLY_DATA.map((w, i) => {
                    const mx = Math.max(...WEEKLY_DATA.map(x => x.newMembers));
                    const h = Math.round((w.newMembers / mx) * 50) + 4;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 2 }}>
                        <div style={{ fontSize: 9, color: T.lime }}>{w.newMembers}</div>
                        <div style={{ width: "100%", height: h,
                          background: i === WEEKLY_DATA.length-1 ? T.lime : `${T.lime}55`,
                          borderRadius: "3px 3px 0 0" }} />
                        <div style={{ fontSize: 8, color: T.mist }}>{w.week.split(" ")[1]}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ── ALERTS ── */}
        {tab === "alerts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { sev:"high",   icon:"🔴", title:"M006 (Riley S.) — Escrow unfunded, Day 7",      body:"Final deadline email not triggered. Manual follow-up or release pod spot to waitlist within 24 hours.", action:"Send Email 5 now" },
              { sev:"high",   icon:"🔴", title:"M009 (Sage L.) — Unverified, Day 10",             body:"KYC never started. Pod P008 is at partial funding. Notify pod captain (M008).", action:"Flag to pod captain" },
              { sev:"medium", icon:"🟡", title:"P005 (Soldier Field South) — 1 member unfunded",  body:"Bears pod has renewal intent 'maybe' and one pending escrow. Season starts in 18 days.", action:"Trigger Email 4" },
              { sev:"medium", icon:"🟡", title:"P006 (Section 220) — 3 games with no confirmed attendee", body:"Allocation ran but 3 upcoming games assigned to members who haven't confirmed attendance.", action:"Send no-show reminder" },
              { sev:"low",    icon:"🟢", title:"M010 (Blake N.) — 3 referrals, reward pending",   body:"Referral reward not yet issued. Delay risks reducing future referral motivation.", action:"Issue $50 credit" },
              { sev:"low",    icon:"🟢", title:"P003 (North End Bloc) — NPS 10, testimonial opportunity", body:"Drew W. rated 10/10 after their second game. High-quality testimonial candidate.", action:"Request testimonial" },
            ].map((alert, i) => (
              <div key={i} style={{
                background: T.forest,
                border: `1px solid ${alert.sev==="high" ? T.red+"44" : alert.sev==="medium" ? T.amber+"44" : "#1A4A2E"}`,
                borderLeft: `4px solid ${alert.sev==="high" ? T.red : alert.sev==="medium" ? T.amber : T.lime}`,
                borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>{alert.icon} {alert.title}</div>
                  <Badge color={alert.sev==="high" ? T.red : alert.sev==="medium" ? T.amber : T.lime}>{alert.sev}</Badge>
                </div>
                <div style={{ fontSize: 12, color: T.mist, lineHeight: 1.5, marginBottom: 10 }}>{alert.body}</div>
                <div style={{ background: `${T.lime}18`, color: T.lime, border: `1px solid ${T.lime}33`,
                  borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700,
                  display: "inline-block", cursor: "pointer" }}>→ {alert.action}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

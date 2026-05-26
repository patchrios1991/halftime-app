// ─── AllocationScreen ─────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Avatar from "../../components/Avatar";
import Bar from "../../components/Bar";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import Pill from "../../components/Pill";
import { useMyPods, usePod } from "../../hooks/usePod";
import { useGames } from "../../hooks/useGames";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { deleteGame } from "../../api/games";
import { searchESPNTeams, fetchESPNSchedule } from "../../api/schedule";

const MEMBER_COLORS = ["#C8F135", "#34D399", "#A78BFA", "#FBBF24", "#F87171", "#60A5FA"];

const METHOD_INFO = {
  snake:   { icon: "🐍", name: "Snake Draft",    desc: "Reverse-order picks each round. Fairest over a full season." },
  lottery: { icon: "🎲", name: "Random Lottery", desc: "Weighted by ownership %. Pure chance — great for casual pods." },
  ai:      { icon: "🤖", name: "AI Fairness",    desc: "Balances quality, recency & share % for maximum fairness." },
};

const TIERS = ["standard", "premium", "marquee"];

// ── Schedule import parser ─────────────────────────────────────────────────────
const MONTH_MAP = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,
  september:9,october:10,november:11,december:12,
};

function parseImportDate(s) {
  s = s.trim();
  // ISO 2026-01-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D or M/D/YY or M/D/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    let y = slash[3] ? parseInt(slash[3]) : new Date().getFullYear();
    if (y < 100) y += 2000;
    return `${y}-${slash[1].padStart(2,"0")}-${slash[2].padStart(2,"0")}`;
  }
  // "Jan 15" or "January 15, 2026"
  const named = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/i);
  if (named) {
    const mo = MONTH_MAP[named[1].toLowerCase()];
    if (mo) {
      const y = named[3] ? parseInt(named[3]) : new Date().getFullYear();
      return `${y}-${String(mo).padStart(2,"0")}-${named[2].padStart(2,"0")}`;
    }
  }
  return null;
}

function parseImportTime(s) {
  s = s.trim();
  const ampm = s.match(/^(\d{1,2}):?(\d{0,2})\s*(am|pm)$/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const min = ampm[2] || "00";
    if (ampm[3].toUpperCase() === "PM" && h < 12) h += 12;
    if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2,"0")}:${min.padStart(2,"0")}`;
  }
  const mil = s.match(/^(\d{2}):(\d{2})$/);
  if (mil && parseInt(mil[1]) < 24) return `${mil[1]}:${mil[2]}`;
  return null;
}

function parseImportLine(line) {
  const parts = line.split(/[,;\t]/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const opponent = parts[0].replace(/^(vs\.?\s*|@\s*)/i, "").trim();
  if (!opponent) return null;

  let game_date = null, game_time = "19:30", face_value = "", tier = "standard";

  for (const p of parts.slice(1)) {
    if (!game_date)      { const d = parseImportDate(p); if (d) game_date = d; }
    if (game_time === "19:30") { const t = parseImportTime(p); if (t) game_time = t; }
    if (!face_value) {
      const m = p.match(/\$?(\d+(?:\.\d{1,2})?)/);
      if (m && parseFloat(m[1]) >= 1) face_value = m[1];
    }
    const pl = p.toLowerCase();
    if (pl.includes("marquee")) tier = "marquee";
    else if (pl.includes("premium")) tier = "premium";
  }

  if (!game_date) return null;
  return { opponent, game_date, game_time, face_value, tier };
}

function parseScheduleText(text) {
  return text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#") && !l.startsWith("//"))
    .map(parseImportLine)
    .filter(Boolean);
}

const inputStyle = {
  width: "100%", padding: "9px 12px", background: "#0D1F12",
  border: `1px solid ${T.green}`, borderRadius: 8, color: T.white,
  fontSize: 13, fontFamily: "Calibri,sans-serif", outline: "none", boxSizing: "border-box",
};

export default function AllocationScreen({ state, dispatch }) {
  const [method, setMethod]     = useState(state.allocationMethod || "snake");
  const [showAddGame, setShowAddGame] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [importText, setImportText]   = useState("");
  const [importing, setImporting]     = useState(false);
  const [importErr, setImportErr]     = useState(null);

  // ESPN fetch state
  const [showFetch,    setShowFetch]    = useState(false);
  const [fetchQuery,   setFetchQuery]   = useState("");
  const [teamResults,  setTeamResults]  = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [fetchedGames, setFetchedGames] = useState([]);
  const [defaultPrice, setDefaultPrice] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchErr,     setFetchErr]     = useState(null);
  const [importing2,   setImporting2]   = useState(false);
  const [gameForm, setGameForm] = useState({
    opponent: "", game_date: "", game_time: "19:30", face_value: "", tier: "standard",
  });
  const [addingGame, setAddingGame]   = useState(false);
  const [addGameErr, setAddGameErr]   = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  if (!currentUserId && isSupabaseConfigured) {
    supabase.auth.getSession().then(({ data: { session } }) =>
      session?.user?.id && setCurrentUserId(session.user.id));
  }

  const { pods }           = useMyPods();
  const activePod          = pods?.[0] ?? null;
  const activePodId        = activePod?.id ?? null;
  const { pod: fullPod, members: rawMembers, refresh: refreshPod } = usePod(activePodId);
  const { games, addGames, runAllocation, allocating, refresh: refreshGames } = useGames(activePodId);

  const isCaptain = fullPod?.captain_id === currentUserId;

  // Map members for display
  const members = rawMembers.map((m, idx) => ({
    ...m,
    id:       m.user_id,
    name:     m.user_id === currentUserId ? "You" : (m.profiles?.display_name || "Member"),
    initials: m.profiles?.avatar_initials || "??",
    share:    parseFloat(m.share_pct) || 0,
    color:    MEMBER_COLORS[idx % MEMBER_COLORS.length],
  }));

  // Allocation state from DB
  const allocationDone = fullPod?.allocation_done || false;
  const allocationMethod = fullPod?.allocation_method || method;

  // Per-member game counts from DB
  function gamesForMember(userId) {
    return games.filter(g => g.assignments?.[0]?.user_id === userId);
  }

  // My allocated games
  const myGames = gamesForMember(currentUserId);

  // Format date for display
  function fmtDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function fmtTime(timeStr) {
    if (!timeStr) return "";
    const [h, min] = timeStr.split(":");
    const hour = parseInt(h);
    return `${hour > 12 ? hour - 12 : hour}:${min} ${hour >= 12 ? "PM" : "AM"}`;
  }

  async function handleAddGame() {
    setAddGameErr(null);
    if (!gameForm.opponent.trim()) return setAddGameErr("Opponent is required");
    if (!gameForm.game_date)       return setAddGameErr("Date is required");
    if (!gameForm.face_value)      return setAddGameErr("Face value is required");
    setAddingGame(true);
    try {
      const { addGame } = await import("../../api/games");
      await addGame(activePodId, {
        ...gameForm,
        sport_emoji: fullPod?.sport_emoji || "🏀",
      });
      setGameForm({ opponent: "", game_date: "", game_time: "19:30", face_value: "", tier: "standard" });
      setShowAddGame(false);
      await refreshGames();
    } catch (e) {
      setAddGameErr(e.message);
    } finally {
      setAddingGame(false);
    }
  }

  async function handleDeleteGame(gameId) {
    try {
      await deleteGame(gameId);
      await refreshGames();
    } catch (e) {
      console.error("Delete game:", e.message);
    }
  }

  async function handleImport() {
    setImportErr(null);
    const parsed = parseScheduleText(importText);
    if (parsed.length === 0) { setImportErr("No valid games found. Check the format below."); return; }
    setImporting(true);
    try {
      await addGames(parsed);
      setImportText("");
      setShowImport(false);
    } catch (e) {
      setImportErr(e.message);
    } finally {
      setImporting(false);
    }
  }

  // ── ESPN fetch handlers ──────────────────────────────────────────────────────
  async function handleSearchTeams(q) {
    setFetchQuery(q);
    setSelectedTeam(null);
    setFetchedGames([]);
    setFetchErr(null);
    if (!q.trim()) { setTeamResults([]); return; }
    setFetchLoading(true);
    try {
      const sport = fullPod?.sport || "basketball";
      const results = await searchESPNTeams(sport, q);
      setTeamResults(results.slice(0, 6));
    } catch (e) {
      setFetchErr(e.message);
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleSelectTeam(team) {
    setSelectedTeam(team);
    setTeamResults([]);
    setFetchedGames([]);
    setFetchErr(null);
    setFetchLoading(true);
    try {
      const sport = fullPod?.sport || "basketball";
      const games = await fetchESPNSchedule(sport, team.id, defaultPrice);
      setFetchedGames(games);
    } catch (e) {
      setFetchErr(e.message);
    } finally {
      setFetchLoading(false);
    }
  }

  async function handleImportFetched() {
    if (!fetchedGames.length) return;
    setImporting2(true);
    setFetchErr(null);
    try {
      const gamesWithPrice = fetchedGames.map(g => ({
        ...g,
        face_value: defaultPrice || "0",
        sport_emoji: fullPod?.sport_emoji || "🏀",
      }));
      await addGames(gamesWithPrice);
      setShowFetch(false);
      setSelectedTeam(null);
      setFetchedGames([]);
      setDefaultPrice("");
      await refreshGames();
    } catch (e) {
      setFetchErr(e.message);
    } finally {
      setImporting2(false);
    }
  }

  async function handleRunAllocation() {
    try {
      await runAllocation(fullPod, rawMembers, method);
      await refreshPod();
      dispatch({ type: "RUN_ALLOCATION", method });
    } catch (e) {
      console.error("Allocation error:", e.message);
    }
  }

  // ── No pod ──────────────────────────────────────────────────────────────────
  if (isSupabaseConfigured && !activePodId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 32, minHeight: "60vh", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 8 }}>No pod yet</div>
        <div style={{ fontSize: 12, color: T.mist, marginBottom: 20 }}>
          Create or join a pod to run allocation.
        </div>
        <button onClick={() => dispatch({ type: "SET_SCREEN", screen: "pod" })}
          style={{ padding: "12px 24px", background: T.lime, color: T.dark, border: "none",
            borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Go to Pod →
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: T.dark, padding: "20px 16px 16px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.white,
          fontFamily: "Georgia,serif", marginBottom: 4 }}>Allocation Engine ⚡</div>
        <div style={{ fontSize: 12, color: T.mist }}>
          {games.length} game{games.length !== 1 ? "s" : ""} · {members.length} member{members.length !== 1 ? "s" : ""} · {fullPod?.name || "—"}
        </div>
      </div>

      <div style={{ padding: 14 }}>

        {/* ── Game Management (captain only) ── */}
        {isCaptain && (
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
                🎟️ Season Games ({games.length})
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div onClick={() => {
                  setShowFetch(v => !v);
                  setShowImport(false); setShowAddGame(false);
                  if (!fetchQuery && fullPod?.team_name) {
                    handleSearchTeams(fullPod.team_name);
                  }
                }} style={{ fontSize: 11, color: "#60A5FA", fontWeight: 700, cursor: "pointer" }}>
                  {showFetch ? "✕" : "🔍 ESPN"}
                </div>
                <div onClick={() => { setShowImport(v => !v); setShowAddGame(false); setShowFetch(false); }}
                  style={{ fontSize: 11, color: T.teal, fontWeight: 700, cursor: "pointer" }}>
                  {showImport ? "✕" : "📋 Import"}
                </div>
                <div onClick={() => { setShowAddGame(v => !v); setShowImport(false); setShowFetch(false); }}
                  style={{ fontSize: 11, color: T.lime, fontWeight: 700, cursor: "pointer" }}>
                  {showAddGame ? "✕ Cancel" : "+ Add"}
                </div>
              </div>
            </div>

            {/* Add game form */}
            {showAddGame && (
              <div style={{ background: "#0D1F12", borderRadius: 10, padding: 12, marginBottom: 12,
                border: `1px solid ${T.green}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div style={{ gridColumn: "1/-1" }}>
                    <input style={inputStyle} placeholder="Opponent (e.g. Lakers)"
                      value={gameForm.opponent} onChange={e => setGameForm(f => ({ ...f, opponent: e.target.value }))} />
                  </div>
                  <input style={inputStyle} type="date" value={gameForm.game_date}
                    onChange={e => setGameForm(f => ({ ...f, game_date: e.target.value }))} />
                  <input style={inputStyle} type="time" value={gameForm.game_time}
                    onChange={e => setGameForm(f => ({ ...f, game_time: e.target.value }))} />
                  <input style={inputStyle} type="number" placeholder="Face value ($)"
                    value={gameForm.face_value} onChange={e => setGameForm(f => ({ ...f, face_value: e.target.value }))} />
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={gameForm.tier}
                    onChange={e => setGameForm(f => ({ ...f, tier: e.target.value }))}>
                    {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                {addGameErr && <div style={{ color: T.red, fontSize: 11, marginBottom: 6 }}>{addGameErr}</div>}
                <button onClick={handleAddGame} disabled={addingGame}
                  style={{ width: "100%", padding: "9px", background: T.lime, color: T.dark,
                    border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {addingGame ? "Adding…" : "Add Game"}
                </button>
              </div>
            )}

            {/* ── ESPN fetch panel ── */}
            {showFetch && (
              <div style={{ background: "#0D1520", borderRadius: 10, padding: 12, marginBottom: 12,
                border: "1px solid #60A5FA44" }}>
                <div style={{ fontSize: 11, color: "#60A5FA", fontWeight: 700, marginBottom: 8 }}>
                  🔍 Fetch schedule from ESPN
                </div>

                {/* Team search */}
                {!selectedTeam && (
                  <>
                    <input
                      style={{ ...inputStyle, marginBottom: 8 }}
                      placeholder="Search team (e.g. Chicago Bulls)"
                      value={fetchQuery}
                      onChange={e => handleSearchTeams(e.target.value)}
                    />
                    {fetchLoading && (
                      <div style={{ fontSize: 11, color: T.mist, textAlign: "center", padding: "8px 0" }}>
                        Searching ESPN…
                      </div>
                    )}
                    {teamResults.map(team => (
                      <div key={team.id} onClick={() => handleSelectTeam(team)}
                        style={{ display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                          background: "#ffffff08", marginBottom: 6,
                          border: "1px solid #60A5FA22" }}>
                        {team.logos?.[0]?.href && (
                          <img src={team.logos[0].href} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
                        )}
                        <div>
                          <div style={{ fontSize: 13, color: T.white, fontWeight: 700 }}>{team.displayName}</div>
                          <div style={{ fontSize: 10, color: T.mist }}>{team.abbreviation}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Schedule preview */}
                {selectedTeam && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      {selectedTeam.logos?.[0]?.href && (
                        <img src={selectedTeam.logos[0].href} alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.white }}>{selectedTeam.displayName}</span>
                      <span onClick={() => { setSelectedTeam(null); setFetchedGames([]); }}
                        style={{ fontSize: 10, color: T.mist, cursor: "pointer", textDecoration: "underline", marginLeft: "auto" }}>
                        Change team
                      </span>
                    </div>

                    {fetchLoading && (
                      <div style={{ fontSize: 11, color: T.mist, textAlign: "center", padding: "8px 0" }}>
                        Loading schedule…
                      </div>
                    )}

                    {fetchedGames.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: "#60A5FA", marginBottom: 8 }}>
                          ✓ {fetchedGames.length} home games found · {fetchedGames.filter(g => g.tier === "marquee").length} marquee · {fetchedGames.filter(g => g.tier === "premium").length} premium
                        </div>

                        {/* Default price input */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 11, color: T.mist, whiteSpace: "nowrap" }}>Face value per ticket</span>
                          <input
                            type="number"
                            placeholder="e.g. 150"
                            value={defaultPrice}
                            onChange={e => setDefaultPrice(e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                          />
                        </div>

                        {/* Preview — first 5 games */}
                        <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 10 }}>
                          {fetchedGames.slice(0, 5).map((g, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between",
                              fontSize: 11, color: T.mist, padding: "4px 0",
                              borderBottom: "1px solid #1A4A2E" }}>
                              <span>
                                {g.tier === "marquee" ? "⭐ " : g.tier === "premium" ? "🔥 " : ""}
                                vs. <span style={{ color: T.chalk }}>{g.opponent}</span>
                              </span>
                              <span>{g.game_date}</span>
                            </div>
                          ))}
                          {fetchedGames.length > 5 && (
                            <div style={{ fontSize: 10, color: T.mist, paddingTop: 4 }}>
                              …and {fetchedGames.length - 5} more home games
                            </div>
                          )}
                        </div>

                        <button onClick={handleImportFetched} disabled={importing2}
                          style={{ width: "100%", padding: "10px", background: "#60A5FA",
                            color: "#fff", border: "none", borderRadius: 8,
                            fontSize: 13, fontWeight: 700, cursor: "pointer",
                            opacity: importing2 ? 0.6 : 1 }}>
                          {importing2 ? "Importing…" : `Import ${fetchedGames.length} Games from ESPN →`}
                        </button>
                        <div style={{ fontSize: 10, color: T.mist, textAlign: "center", marginTop: 6 }}>
                          Times shown in your local timezone · You can edit games after import
                        </div>
                      </>
                    )}

                    {!fetchLoading && fetchedGames.length === 0 && (
                      <div style={{ fontSize: 11, color: T.amber, textAlign: "center", padding: "8px 0" }}>
                        No upcoming home games found for this team.
                      </div>
                    )}
                  </>
                )}

                {fetchErr && (
                  <div style={{ fontSize: 11, color: T.red, marginTop: 8 }}>{fetchErr}</div>
                )}
              </div>
            )}

            {/* ── Bulk import panel ── */}
            {showImport && (
              <div style={{ background: "#0D1F12", borderRadius: 10, padding: 12, marginBottom: 12,
                border: `1px solid ${T.teal}44` }}>
                <div style={{ fontSize: 11, color: T.teal, fontWeight: 700, marginBottom: 6 }}>
                  📋 Paste your schedule — one game per line
                </div>
                <div style={{ fontSize: 10, color: T.mist, marginBottom: 8, lineHeight: 1.6 }}>
                  Format: <span style={{ color: T.chalk }}>Opponent, Date, Time, Price, Tier</span><br />
                  e.g. <span style={{ color: T.chalk }}>Lakers, Jan 15, 7:30 PM, $180, marquee</span><br />
                  e.g. <span style={{ color: T.chalk }}>Celtics, 2/20, 8pm, 120</span><br />
                  Tier (optional): standard / premium / marquee
                </div>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder={"Lakers, Jan 15, 7:30 PM, $180, marquee\nCeltics, Jan 22, 8 PM, $150, premium\nNets, Feb 3, 7 PM, $95"}
                  rows={6}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontSize: 12,
                    fontFamily: "monospace" }}
                />
                {/* Live parse preview */}
                {importText.trim() && (() => {
                  const parsed = parseScheduleText(importText);
                  return (
                    <div style={{ marginTop: 8, marginBottom: 8 }}>
                      {parsed.length > 0 ? (
                        <div style={{ fontSize: 10, color: T.teal, marginBottom: 6 }}>
                          ✓ {parsed.length} game{parsed.length !== 1 ? "s" : ""} ready to import
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: T.amber, marginBottom: 6 }}>
                          ⚠ No valid games parsed yet — check your format
                        </div>
                      )}
                      {parsed.slice(0, 3).map((g, i) => (
                        <div key={i} style={{ fontSize: 10, color: T.mist, padding: "3px 0",
                          borderBottom: "1px solid #1A4A2E" }}>
                          {fullPod?.sport_emoji || "🏀"} vs. <span style={{ color: T.chalk }}>{g.opponent}</span>
                          {" · "}{g.game_date}{" · "}${g.face_value || "?"}{" · "}{g.tier}
                        </div>
                      ))}
                      {parsed.length > 3 && (
                        <div style={{ fontSize: 10, color: T.mist, marginTop: 4 }}>
                          …and {parsed.length - 3} more
                        </div>
                      )}
                    </div>
                  );
                })()}
                {importErr && (
                  <div style={{ color: T.red, fontSize: 11, marginBottom: 6 }}>{importErr}</div>
                )}
                <button
                  onClick={handleImport}
                  disabled={importing || !importText.trim()}
                  style={{ width: "100%", padding: "9px", background: T.teal, color: T.dark,
                    border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    opacity: !importText.trim() ? 0.5 : 1 }}>
                  {importing ? "Importing…" : `Import ${parseScheduleText(importText).length || 0} Games`}
                </button>
              </div>
            )}

            {/* Game list */}
            {games.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: T.mist, fontSize: 12 }}>
                No games yet — add your season schedule above.
              </div>
            ) : (
              games.map(g => {
                const assignedTo = g.assignments?.[0]?.user_id;
                const assignee   = members.find(m => m.id === assignedTo);
                return (
                  <div key={g.id} style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1A4A2E" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.white }}>
                        {fullPod?.sport_emoji || "🏀"} vs. {g.opponent}
                      </div>
                      <div style={{ fontSize: 10, color: T.mist }}>
                        {fmtDate(g.game_date)} · {fmtTime(g.game_time)} · ${g.face_value}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Pill label={g.tier}
                        color={g.tier === "marquee" ? T.lime : g.tier === "premium" ? T.teal : T.mist} />
                      {assignee
                        ? <Badge color={assignee.id === currentUserId ? T.lime : T.mist}>
                            {assignee.name}
                          </Badge>
                        : !allocationDone && (
                          <div onClick={() => handleDeleteGame(g.id)}
                            style={{ color: T.red, fontSize: 16, cursor: "pointer", lineHeight: 1, opacity: 0.6 }}>✕</div>
                        )}
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        )}

        {/* ── Method picker ── */}
        {!allocationDone && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 10 }}>Choose Allocation Method</div>

            {Object.entries(METHOD_INFO).map(([key, { icon, name, desc }]) => (
              <div key={key} onClick={() => setMethod(key)}
                style={{
                  background: method === key ? `${T.lime}18` : T.forest,
                  border: `1px solid ${method === key ? T.lime + "55" : "#1A4A2E"}`,
                  borderRadius: 12, padding: "12px 14px", marginBottom: 8,
                  cursor: "pointer", display: "flex", gap: 12, alignItems: "center",
                }}>
                <div style={{ fontSize: 28 }}>{icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700,
                    color: method === key ? T.lime : T.white }}>{name}</div>
                  <div style={{ fontSize: 11, color: T.mist, marginTop: 2 }}>{desc}</div>
                </div>
                {method === key && <div style={{ color: T.lime, fontSize: 18 }}>✓</div>}
              </div>
            ))}

            {isCaptain ? (
              <button onClick={handleRunAllocation} disabled={allocating || games.length === 0}
                style={{
                  width: "100%", padding: "14px",
                  background: games.length === 0 ? "#1A4A2E" : allocating ? "#1A4A2E" : T.lime,
                  color: T.dark, border: "none", borderRadius: 12,
                  fontSize: 15, fontWeight: 700, fontFamily: "Georgia,serif",
                  cursor: games.length === 0 || allocating ? "not-allowed" : "pointer",
                  marginTop: 8, marginBottom: 16, opacity: games.length === 0 ? 0.5 : 1,
                }}>
                {allocating
                  ? "🤖 Running allocation…"
                  : games.length === 0
                    ? "Add games first"
                    : `Run ${METHOD_INFO[method].name} →`}
              </button>
            ) : (
              <div style={{ textAlign: "center", padding: "14px 0", color: T.mist, fontSize: 12 }}>
                Only the pod captain can run allocation.
              </div>
            )}
          </>
        )}

        {/* ── Results ── */}
        {allocationDone && (
          <div>
            <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
              borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: T.lime, fontWeight: 700, marginBottom: 4 }}>
                ✓ Allocation complete — {METHOD_INFO[allocationMethod]?.name || allocationMethod}
              </div>
              <div style={{ fontSize: 11, color: T.mist }}>
                {myGames.length} game{myGames.length !== 1 ? "s" : ""} assigned to you
              </div>
            </div>

            {/* Per-member summary */}
            <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
              fontFamily: "Georgia,serif", marginBottom: 10 }}>Results Summary</div>
            {members.map(m => {
              const mGames = gamesForMember(m.id);
              const fair   = (m.share / 100) * games.length;
              const diff   = mGames.length - fair;
              return (
                <div key={m.id} style={{ background: T.forest, borderRadius: 10,
                  padding: "10px 12px", marginBottom: 8,
                  border: `1px solid ${m.id === currentUserId ? T.lime + "44" : "#1A4A2E"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Avatar initials={m.initials} size={28} color={m.color} />
                      <span style={{ fontSize: 12, color: m.id === currentUserId ? T.lime : T.white,
                        fontWeight: 700 }}>{m.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                        fontFamily: "Georgia,serif" }}>{mGames.length}</span>
                      <span style={{ fontSize: 10, color: T.mist }}>games</span>
                      <span style={{ fontSize: 10, color: Math.abs(diff) <= 0.5 ? T.teal : T.amber }}>
                        ({diff >= 0 ? "+" : ""}{diff.toFixed(1)})
                      </span>
                    </div>
                  </div>
                  <Bar value={mGames.length} max={games.length} color={m.color} h={4} />
                </div>
              );
            })}

            {/* My games */}
            {myGames.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.white,
                  fontFamily: "Georgia,serif", marginBottom: 10, marginTop: 14 }}>
                  Your {myGames.length} Games
                </div>
                {myGames.map(g => (
                  <div key={g.id} style={{ background: T.forest, borderRadius: 10,
                    padding: "10px 12px", marginBottom: 6, border: `1px solid ${T.lime}33`,
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>
                        {fullPod?.sport_emoji || "🏀"} vs. {g.opponent}
                      </div>
                      <div style={{ fontSize: 10, color: T.mist }}>
                        {fmtDate(g.game_date)} · {fmtTime(g.game_time)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.lime,
                        fontFamily: "Georgia,serif" }}>${g.face_value}</div>
                      <Pill label={g.tier}
                        color={g.tier === "marquee" ? T.lime : g.tier === "premium" ? T.teal : T.mist} />
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Captain can re-run */}
            {isCaptain && (
              <button onClick={handleRunAllocation} disabled={allocating}
                style={{ width: "100%", marginTop: 14, padding: "11px",
                  background: "transparent", border: `1px solid ${T.mist}44`,
                  color: T.mist, borderRadius: 10, fontSize: 12, cursor: "pointer" }}>
                {allocating ? "Running…" : "↺ Re-run allocation"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

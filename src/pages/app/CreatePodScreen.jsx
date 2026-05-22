// ─── CreatePodScreen ──────────────────────────────────────────────────────────
import { useState } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import { createPod } from "../../api/pods";

const SPORTS = [
  { value: "NBA",  label: "🏀 NBA"  },
  { value: "NFL",  label: "🏈 NFL"  },
  { value: "MLB",  label: "⚾ MLB"  },
  { value: "NHL",  label: "🏒 NHL"  },
  { value: "MLS",  label: "⚽ MLS"  },
  { value: "WNBA", label: "🏀 WNBA" },
  { value: "other",label: "🎫 Other" },
];

const SPORT_EMOJI = {
  NBA: "🏀", NFL: "🏈", MLB: "⚾", NHL: "🏒", MLS: "⚽", WNBA: "🏀", other: "🎫",
};

const inputStyle = {
  width: "100%", padding: "11px 13px", background: "#0D1F12",
  border: `1px solid ${T.green}`, borderRadius: 10, color: T.white,
  fontSize: 14, fontFamily: "Calibri,sans-serif", outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 10, fontWeight: 700, color: T.mist,
  letterSpacing: 1.2, marginBottom: 5, display: "block",
};

export default function CreatePodScreen({ dispatch }) {
  const [form, setForm] = useState({
    name: "", team_name: "", sport: "NBA", season: "2025-26",
    season_cost: "", max_members: "4", captainShare: "25",
    venue: "", section: "", row: "",
  });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleCreate() {
    setError(null);
    const cost = parseFloat(form.season_cost);
    if (!form.name.trim())      return setError("Pod name is required");
    if (!form.team_name.trim()) return setError("Team name is required");
    if (!cost || cost <= 0)     return setError("Enter a valid season cost");

    setBusy(true);
    try {
      await createPod({
        name:             form.name.trim(),
        team_name:        form.team_name.trim(),
        sport:            form.sport,
        sport_emoji:      SPORT_EMOJI[form.sport],
        season:           form.season,
        season_cost:      cost,
        escrow_required:  cost,
        max_members:      parseInt(form.max_members) || 4,
        captainShare:     parseFloat(form.captainShare) || 25,
        venue:            form.venue.trim() || null,
        section:          form.section.trim() || null,
        row:              form.row.trim() || null,
        status:           "recruiting",
      });
      dispatch({ type: "SET_SCREEN", screen: "pod" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingBottom: 100, padding: "0 0 100px" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div onClick={() => dispatch({ type: "SET_SCREEN", screen: "onboarding" })}
            style={{ color: T.mist, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>‹</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
            Create a Pod
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.mist, marginLeft: 30 }}>
          You'll be the captain — invite members after setup
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Basic info */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 14 }}>🏟️ Pod Details</div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>POD NAME</label>
            <input style={inputStyle} placeholder='e.g. "Section 114 Squad"'
              value={form.name} onChange={e => set("name", e.target.value)} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>SPORT</label>
            <select style={{ ...inputStyle, cursor: "pointer" }}
              value={form.sport} onChange={e => set("sport", e.target.value)}>
              {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>TEAM NAME</label>
            <input style={inputStyle} placeholder='e.g. "Chicago Bulls"'
              value={form.team_name} onChange={e => set("team_name", e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>SEASON</label>
            <input style={inputStyle} placeholder="2025-26"
              value={form.season} onChange={e => set("season", e.target.value)} />
          </div>
        </Card>

        {/* Cost & Members */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 14 }}>💰 Cost & Members</div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>TOTAL SEASON TICKET COST ($)</label>
            <input style={inputStyle} type="number" placeholder="e.g. 7400"
              value={form.season_cost} onChange={e => set("season_cost", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>MAX MEMBERS</label>
              <select style={{ ...inputStyle, cursor: "pointer" }}
                value={form.max_members} onChange={e => set("max_members", e.target.value)}>
                {[2,3,4,5,6,7,8].map(n => (
                  <option key={n} value={n}>{n} members</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>YOUR SHARE (%)</label>
              <input style={inputStyle} type="number" min="1" max="99"
                value={form.captainShare} onChange={e => set("captainShare", e.target.value)} />
            </div>
          </div>

          {/* Cost preview */}
          {form.season_cost && form.captainShare && (
            <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
              borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
              <div style={{ fontSize: 11, color: T.mist }}>Your captain cost</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>
                ${((parseFloat(form.season_cost) || 0) * (parseFloat(form.captainShare) || 0) / 100).toFixed(2)}
              </div>
            </div>
          )}
        </Card>

        {/* Venue (optional) */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 14 }}>📍 Seat Info <span style={{ color: T.mist, fontWeight: 400 }}>(optional)</span></div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>VENUE</label>
            <input style={inputStyle} placeholder='e.g. "United Center"'
              value={form.venue} onChange={e => set("venue", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>SECTION</label>
              <input style={inputStyle} placeholder="114"
                value={form.section} onChange={e => set("section", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>ROW</label>
              <input style={inputStyle} placeholder="8"
                value={form.row} onChange={e => set("row", e.target.value)} />
            </div>
          </div>
        </Card>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.12)", border: `1px solid ${T.red}`,
            borderRadius: 10, padding: "10px 14px", color: T.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={busy}
          style={{
            width: "100%", padding: "14px 0", background: busy ? T.mist : T.lime,
            color: T.dark, border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 700, fontFamily: "Georgia,serif",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Creating Pod…" : "Create Pod →"}
        </button>
      </div>
    </div>
  );
}

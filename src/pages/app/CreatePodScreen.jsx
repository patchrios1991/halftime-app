// ─── CreatePodScreen ──────────────────────────────────────────────────────────
import { useState, useRef, useMemo, useEffect } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import { createPod } from "../../api/pods";
import { supabase } from "../../lib/supabase";
import { findTeamTicketUrl } from "../../lib/teamTicketUrls";
import { findTeamVenue } from "../../lib/teamVenues";
import { fetchVenueSeatMap } from "../../api/ticketmaster";

const SPORTS = [
  // ── Pro ──────────────────────────────────────────────────────────────────────
  { value: "NBA",            label: "🏀 NBA"                    },
  { value: "NFL",            label: "🏈 NFL"                    },
  { value: "MLB",            label: "⚾ MLB"                    },
  { value: "NHL",            label: "🏒 NHL"                    },
  { value: "MLS",            label: "⚽ MLS"                    },
  { value: "WNBA",           label: "🏀 WNBA"                   },
  // ── NCAA ─────────────────────────────────────────────────────────────────────
  { value: "ncaa-football",   label: "🏈 NCAA Football"          },
  { value: "ncaa-basketball", label: "🏀 NCAA Men's Basketball"  },
  { value: "ncaa-wbasketball",label: "🏀 NCAA Women's Basketball"},
  { value: "ncaa-baseball",   label: "⚾ NCAA Baseball"          },
  { value: "ncaa-hockey",     label: "🏒 NCAA Hockey"            },
  // ── Other ────────────────────────────────────────────────────────────────────
  { value: "other",           label: "🎫 Other"                  },
];

const SPORT_EMOJI = {
  NBA: "🏀", NFL: "🏈", MLB: "⚾", NHL: "🏒", MLS: "⚽", WNBA: "🏀",
  "ncaa-football":   "🏈",
  "ncaa-basketball": "🏀",
  "ncaa-wbasketball":"🏀",
  "ncaa-baseball":   "⚾",
  "ncaa-hockey":     "🏒",
  other: "🎫",
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
  const ticketUrl = useMemo(
    () => findTeamTicketUrl(form.team_name, form.sport),
    [form.team_name, form.sport]
  );

  // Auto-populate venue when team/sport changes, unless captain manually edited it
  const [venueAutoSet, setVenueAutoSet] = useState(false);
  useEffect(() => {
    const autoVenue = findTeamVenue(form.team_name, form.sport);
    if (autoVenue && (!form.venue.trim() || venueAutoSet)) {
      set("venue", autoVenue);
      setVenueAutoSet(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.team_name, form.sport]);

  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState(null);
  const [fieldErr,    setFE]          = useState({});
  const [receiptFile, setReceiptFile] = useState(null);   // File | null
  const [uploadPct,   setUploadPct]   = useState(null);   // null | 0-100
  const fileInputRef = useRef(null);

  function clearFE(key) { setFE(f => ({ ...f, [key]: null })); }
  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    // Accept images and PDFs only
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Please upload an image (JPG, PNG) or PDF receipt.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10 MB.");
      return;
    }
    setError(null);
    setReceiptFile(file);
  }

  async function uploadReceipt(podId) {
    if (!receiptFile) return null;
    const ext  = receiptFile.name.split(".").pop().toLowerCase();
    const path = `${podId}/receipt.${ext}`;

    setUploadPct(0);
    const { error: uploadErr } = await supabase.storage
      .from("receipts")
      .upload(path, receiptFile, { upsert: true });

    if (uploadErr) throw new Error(`Receipt upload failed: ${uploadErr.message}`);
    setUploadPct(100);

    const { data: { publicUrl } } = supabase.storage
      .from("receipts")
      .getPublicUrl(path);

    return publicUrl;
  }

  async function handleCreate() {
    setError(null);
    const cost = parseFloat(form.season_cost);
    const errs = {};
    if (!form.name.trim())      errs.name        = "Pod name is required.";
    if (!form.team_name.trim()) errs.team_name   = "Team name is required.";
    if (!cost || cost <= 0)     errs.season_cost = "Enter a valid season ticket cost.";
    // TODO (post-beta): make receipt required before launch
    // if (!receiptFile)        errs.receipt     = "A season ticket receipt is required.";
    if (Object.keys(errs).length) { setFE(errs); return; }

    setBusy(true);
    try {
      // 1. Fetch seat map URL from Ticketmaster (non-blocking if it fails)
      let seatMapUrl = null;
      if (form.venue.trim()) {
        const venueData = await fetchVenueSeatMap(form.venue.trim());
        seatMapUrl = venueData?.seatMapUrl ?? null;
      }

      // 2. Create the pod
      const pod = await createPod({
        name:            form.name.trim(),
        team_name:       form.team_name.trim(),
        sport:           form.sport,
        sport_emoji:     SPORT_EMOJI[form.sport],
        season:          form.season,
        season_cost:     cost,
        escrow_required: cost,
        max_members:     parseInt(form.max_members) || 4,
        captainShare:    parseFloat(form.captainShare) || 25,
        venue:           form.venue.trim() || null,
        section:         form.section.trim() || null,
        row:             form.row.trim() || null,
        seat_map_url:    seatMapUrl,
        status:          "recruiting",
      });

      // 2. Upload receipt if provided, then store URL on the pod
      if (receiptFile) {
        const receiptUrl = await uploadReceipt(pod.id);
        if (receiptUrl) {
          await supabase
            .from("pods")
            .update({ receipt_url: receiptUrl })
            .eq("id", pod.id);
        }
      }

      dispatch({ type: "SET_SCREEN", screen: "pod" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  }

  const receiptLabel = receiptFile
    ? receiptFile.name
    : "Tap to upload receipt (JPG, PNG, or PDF)";

  return (
    <div style={{ padding: "0 0 calc(100px + var(--kb-height, 0px))" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,${T.dark},${T.forest})`,
        padding: "20px 16px", borderBottom: "1px solid #1A4A2E" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div
            onClick={() => dispatch({ type: "SET_SCREEN",
              screen: localStorage.getItem("ht_onboarded") ? "dashboard" : "onboarding" })}
            style={{ color: T.mist, fontSize: 22, cursor: "pointer", lineHeight: 1,
              padding: "4px 8px 4px 0", minWidth: 44, minHeight: 44,
              display: "flex", alignItems: "center" }}>‹
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.white, fontFamily: "Georgia,serif" }}>
            Create a Pod
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.mist, marginLeft: 30 }}>
          You'll be the captain — invite members after setup
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── Pod Details ───────────────────────────────────────────────────── */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 14 }}>🏟️ Pod Details</div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ ...labelStyle, color: fieldErr.name ? T.red : T.mist }}>POD NAME</label>
            <input
              style={{ ...inputStyle, borderColor: fieldErr.name ? T.red : T.green }}
              placeholder='e.g. "Section 114 Squad"'
              value={form.name}
              onChange={e => { set("name", e.target.value); clearFE("name"); }}
            />
            {fieldErr.name && <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{fieldErr.name}</div>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>SPORT</label>
            <select style={{ ...inputStyle, cursor: "pointer" }}
              value={form.sport} onChange={e => set("sport", e.target.value)}>
              {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ ...labelStyle, color: fieldErr.team_name ? T.red : T.mist }}>TEAM NAME</label>
            <input
              style={{ ...inputStyle, borderColor: fieldErr.team_name ? T.red : T.green }}
              placeholder='e.g. "Chicago Bulls"'
              value={form.team_name}
              onChange={e => { set("team_name", e.target.value); clearFE("team_name"); }}
            />
            {fieldErr.team_name && <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{fieldErr.team_name}</div>}

            {/* Season ticket portal link */}
            {ticketUrl && (
              <a
                href={ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 7, fontSize: 11, color: T.lime,
                  textDecoration: "none", fontWeight: 700,
                }}
              >
                🎟️ Buy season tickets (official site) →
              </a>
            )}
          </div>

          <div>
            <label style={labelStyle}>SEASON</label>
            <input style={inputStyle} placeholder="2025-26"
              value={form.season} onChange={e => set("season", e.target.value)} />
          </div>
        </Card>

        {/* ── Cost & Members ────────────────────────────────────────────────── */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 14 }}>💰 Cost & Members</div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ ...labelStyle, color: fieldErr.season_cost ? T.red : T.mist }}>
              TOTAL SEASON TICKET COST ($)
            </label>
            <input
              style={{ ...inputStyle, borderColor: fieldErr.season_cost ? T.red : T.green }}
              type="number" placeholder="e.g. 7400"
              value={form.season_cost}
              onChange={e => { set("season_cost", e.target.value); clearFE("season_cost"); }}
            />
            {fieldErr.season_cost && (
              <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{fieldErr.season_cost}</div>
            )}
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

          {/* Captain cost preview */}
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

        {/* ── Receipt Upload ────────────────────────────────────────────────── */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 6 }}>
            🧾 Season Ticket Receipt
          </div>
          <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6, marginBottom: 12 }}>
            Upload proof of your ticket purchase so HalfTime can verify the price.
            Members will see a <span style={{ color: T.lime }}>✓ Verified</span> badge
            on your pod once reviewed — this builds trust and helps your pod fill faster.
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {/* Styled upload tap target */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${receiptFile ? T.lime : "#1A4A2E"}`,
              borderRadius: 10, padding: "16px 12px",
              textAlign: "center", cursor: "pointer",
              background: receiptFile ? `${T.lime}08` : "transparent",
              transition: "all .2s",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>
              {receiptFile ? "📄" : "📂"}
            </div>
            <div style={{ fontSize: 12, color: receiptFile ? T.lime : T.mist,
              fontWeight: receiptFile ? 700 : 400, wordBreak: "break-all" }}>
              {receiptLabel}
            </div>
            {receiptFile && (
              <div style={{ fontSize: 10, color: T.mist, marginTop: 4 }}>
                {(receiptFile.size / 1024).toFixed(0)} KB · tap to change
              </div>
            )}
          </div>

          {/* Remove file button */}
          {receiptFile && (
            <button
              onClick={() => { setReceiptFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              style={{ marginTop: 8, background: "none", border: "none",
                color: T.mist, fontSize: 11, cursor: "pointer", padding: 0 }}>
              ✕ Remove receipt
            </button>
          )}

          {/* Skip note */}
          {!receiptFile && (
            <div style={{ fontSize: 10, color: T.mist, marginTop: 8, opacity: 0.7 }}>
              Optional but strongly recommended — pods without verified receipts convert at a lower rate.
            </div>
          )}

          {/* Upload progress */}
          {uploadPct !== null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 4, background: "#1A4A2E", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${uploadPct}%`,
                  background: T.lime, transition: "width .3s", borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10, color: T.mist, marginTop: 4 }}>
                {uploadPct < 100 ? "Uploading receipt…" : "Upload complete ✓"}
              </div>
            </div>
          )}
        </Card>

        {/* ── Seat Info (optional) ──────────────────────────────────────────── */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 14 }}>
            📍 Seat Info <span style={{ color: T.mist, fontWeight: 400 }}>(optional)</span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>VENUE</label>
            <input style={inputStyle} placeholder='e.g. "Kaseya Center"'
              value={form.venue} onChange={e => {
                set("venue", e.target.value);
                setVenueAutoSet(false); // captain took manual control
              }} />
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
            width: "100%", padding: "14px 0",
            background: busy ? T.mist : T.lime,
            color: T.dark, border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 700, fontFamily: "Georgia,serif",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy
            ? uploadPct !== null ? "Uploading receipt…" : "Creating Pod…"
            : "Create Pod →"}
        </button>
      </div>
    </div>
  );
}

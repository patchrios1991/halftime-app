// ─── CreatePodScreen ──────────────────────────────────────────────────────────
import { useState, useRef, useMemo, useEffect } from "react";
import { T } from "../../tokens";
import Card from "../../components/Card";
import { createPod, verifyTickets } from "../../api/pods";
import { supabase } from "../../lib/supabase";
import { findTeamTicketUrl } from "../../lib/teamTicketUrls";
import { findTeamVenue } from "../../lib/teamVenues";
import { fetchVenueSeatMap } from "../../api/ticketmaster";
import { useActivePod } from "../../context/ActivePodContext";

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
  const { setActivePodId, refresh: refreshPods } = useActivePod();

  const [podType, setPodType] = useState("standard"); // "standard" | "group_buy"
  const [organizerConsent, setOrganizerConsent] = useState(false);

  // Read pod template from localStorage (set by Browse Pods "Create like this")
  const podTemplate = (() => {
    try {
      const raw = localStorage.getItem("ht_pod_template");
      if (raw) { localStorage.removeItem("ht_pod_template"); return JSON.parse(raw); }
    } catch { /* ignore */ }
    return null;
  })();

  const [form, setForm] = useState({
    name: "", team_name: podTemplate?.team_name || "", sport: podTemplate?.sport || "NBA",
    season: podTemplate?.season || "2025-26",
    season_cost: "", max_members: String(podTemplate?.max_members || "4"), captainShare: "25",
    venue: podTemplate?.venue || "", section: podTemplate?.section || "",
    row: podTemplate?.row || "", seats: [""],
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

  const [busy,           setBusy]          = useState(false);
  const [error,          setError]         = useState(null);
  const [fieldErr,       setFE]            = useState({});
  const [receiptFile,    setReceiptFile]   = useState(null);   // File | null
  const [uploadPct,      setUploadPct]     = useState(null);   // null | 0-100
  const [availabilityUrl, setAvailabilityUrl] = useState(""); // ticket availability URL for group_buy
  const [perksIncluded,  setPerksIncluded]  = useState(true);  // whether event perks are shared
  const [perkCommitment, setPerkCommitment] = useState(false); // required only when perks included
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
    if (!form.venue.trim())     errs.venue       = "Venue is required.";
    if (!form.section.trim())   errs.section     = "Section is required.";
    if (!form.row.trim())       errs.row         = "Row is required.";
    if (!form.seats.some(s => s.trim())) errs.seat = "At least one seat number is required.";
    if (podType === "group_buy" && !organizerConsent)
      errs.consent = "You must agree to the purchase commitment.";
    if (perksIncluded && !perkCommitment)
      errs.perkCommitment = "You must commit to disclosing team perks to your members.";
    if (Object.keys(errs).length) { setFE(errs); return; }

    setBusy(true);
    try {
      // 1. Fetch seat map URL from Ticketmaster — 5s timeout so a slow/
      //    unreachable API never blocks pod creation.
      let seatMapUrl = null;
      if (form.venue.trim()) {
        try {
          const venueData = await Promise.race([
            fetchVenueSeatMap(form.venue.trim()),
            new Promise(resolve => setTimeout(() => resolve(null), 5000)),
          ]);
          seatMapUrl = venueData?.seatMapUrl ?? null;
        } catch {
          seatMapUrl = null;
        }
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
        seat:            form.seats.filter(s => s.trim()).join(", ") || null,
        seat_map_url:       seatMapUrl,
        pod_type:           podType,
        organizer_consent:  podType === "group_buy" ? organizerConsent : false,
        ticket_url:         podType === "group_buy" && availabilityUrl.trim() ? availabilityUrl.trim() : null,
        perks_included:     perksIncluded,
        perk_commitment:    perksIncluded ? perkCommitment : false,
        status:             "recruiting",
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

      // Fire ticket verification in background — non-blocking
      if (podType === "group_buy" && (availabilityUrl.trim() || receiptFile)) {
        verifyTickets(pod.id).catch(() => {});
      }

      // Refresh pods list so context knows about the new pod,
      // then switch to it before navigating to the pod screen
      await refreshPods();
      setActivePodId(pod.id);
      dispatch({ type: "SET_SCREEN", screen: "pod" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  }

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

        {/* ── Pod Type Toggle ───────────────────────────────────────────────── */}
        <div style={{ background: "#0D1F12", borderRadius: 12,
          border: "1px solid #1A4A2E", padding: 4, display: "flex", gap: 4 }}>
          {[
            { key: "standard",  label: "🎟️ Standard",  sub: "You already bought the tickets" },
            { key: "group_buy", label: "🛒 Group Buy",  sub: "Pool funds, then buy together"  },
          ].map(({ key, label, sub }) => (
            <button key={key} onClick={() => { setPodType(key); setOrganizerConsent(false); }}
              style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: "none",
                background: podType === key ? T.lime : "transparent",
                color: podType === key ? T.dark : T.mist,
                cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 9, marginTop: 2, opacity: 0.75 }}>{sub}</div>
            </button>
          ))}
        </div>

        {/* Group buy info banner */}
        {podType === "group_buy" && (
          <div style={{ background: `${T.teal}10`, border: `1px solid ${T.teal}33`,
            borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.teal, marginBottom: 4 }}>
              🛒 How Group Buy works
            </div>
            <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6 }}>
              Members fund their share into escrow. Once the pod is fully funded, you'll have
              <strong style={{ color: T.chalk }}> 48 hours</strong> to purchase the tickets and
              upload your receipt. HalfTime verifies the receipt and releases the escrow to
              reimburse you. If you miss the window, the pod is cancelled and all members are
              automatically refunded.
            </div>
          </div>
        )}

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
          {form.season_cost && form.captainShare && (() => {
            const s = parseFloat(form.season_cost) || 0;
            const c = parseFloat(form.captainShare) || 0;
            const captainCost = perksIncluded
              ? s * c / 100
              : s * (1 - ((100 - c) / 100) * 0.95);
            const memberCost  = perksIncluded
              ? s * ((100 - c) / 100) / Math.max(1, (parseInt(form.max_members) || 4) - 1)
              : s * ((100 - c) / 100) / Math.max(1, (parseInt(form.max_members) || 4) - 1) * 0.95;
            return (
              <div style={{ background: `${T.lime}12`, border: `1px solid ${T.lime}33`,
                borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.mist }}>Your captain cost</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.lime, fontFamily: "Georgia,serif" }}>
                      ${captainCost.toFixed(2)}
                    </div>
                    {!perksIncluded && (
                      <div style={{ fontSize: 9, color: T.mist, marginTop: 2 }}>
                        (includes perk offset)
                      </div>
                    )}
                  </div>
                  {s > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: T.mist }}>Est. member cost</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: perksIncluded ? T.lime : T.teal,
                        fontFamily: "Georgia,serif" }}>
                        ${memberCost.toFixed(2)}
                      </div>
                      {!perksIncluded && (
                        <div style={{ fontSize: 9, color: T.teal, marginTop: 2 }}>
                          5% perk discount
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Perks included toggle */}
          <div style={{ marginTop: 12, background: "#0D1F12", borderRadius: 10,
            border: "1px solid #1A4A2E", padding: "12px 14px" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={perksIncluded}
                onChange={e => {
                  setPerksIncluded(e.target.checked);
                  if (!e.target.checked) setPerkCommitment(false);
                }}
                style={{ marginTop: 2, accentColor: T.lime, width: 18, height: 18,
                  flexShrink: 0, cursor: "pointer" }}
              />
              <span>
                <span style={{ fontSize: 13, fontWeight: 700,
                  color: perksIncluded ? T.lime : T.mist, display: "block" }}>
                  🎁 Event perks included in this pod
                </span>
                <span style={{ fontSize: 11, color: T.mist, lineHeight: 1.6, display: "block", marginTop: 3 }}>
                  {perksIncluded
                    ? "Members share in all team perks (events, meet-and-greets, postseason seats) via the pod's bidding system."
                    : "You retain all team perks as captain. Members pay 5% less than their share to reflect this — you cover the difference."}
                </span>
              </span>
            </label>
          </div>
        </Card>

        {/* ── Proof of purchase / availability ─────────────────────────────── */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 6 }}>
            {podType === "group_buy" ? "🎟️ Ticket Availability Proof" : "🧾 Season Ticket Receipt"}
          </div>
          <div style={{ fontSize: 11, color: T.mist, lineHeight: 1.6, marginBottom: 12 }}>
            {podType === "group_buy"
              ? <>Provide evidence that these tickets are still available to buy.
                  Both fields are optional but <span style={{ color: T.lime }}>strongly recommended</span> —
                  HalfTime will verify your screenshot with AI and confirm the link is live,
                  giving prospective members confidence before they fund.</>
              : <>Upload proof of your ticket purchase so HalfTime can verify the price.
                  Members will see a <span style={{ color: T.lime }}>✓ Verified</span> badge
                  on your pod once reviewed — this builds trust and helps your pod fill faster.</>
            }
          </div>

          {/* Ticket URL — group_buy only */}
          {podType === "group_buy" && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TICKET AVAILABILITY URL</label>
              <input
                style={inputStyle}
                type="url"
                placeholder="https://www.ticketmaster.com/..."
                value={availabilityUrl}
                onChange={e => setAvailabilityUrl(e.target.value)}
              />
              <div style={{ fontSize: 10, color: T.mist, marginTop: 5, lineHeight: 1.5 }}>
                Paste the direct link to the ticket page (Ticketmaster, team site, AXS, etc.).
                HalfTime will automatically check that the link is live.
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {podType === "group_buy" && (
            <label style={{ ...labelStyle, marginBottom: 6 }}>AVAILABILITY SCREENSHOT</label>
          )}

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
              {receiptFile
                ? receiptFile.name
                : podType === "group_buy"
                  ? "Tap to upload a seat map screenshot (JPG, PNG)"
                  : "Tap to upload receipt (JPG, PNG, or PDF)"}
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
              ✕ Remove {podType === "group_buy" ? "screenshot" : "receipt"}
            </button>
          )}

          {/* Skip note */}
          {!receiptFile && (
            <div style={{ fontSize: 10, color: T.mist, marginTop: 8, opacity: 0.7 }}>
              {podType === "group_buy"
                ? "Optional — screenshot of the seat map or ticket listing page. Our AI will verify it shows available tickets."
                : "Optional but strongly recommended — pods without verified receipts convert at a lower rate."}
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
                {uploadPct < 100 ? "Uploading…" : "Upload complete ✓"}
              </div>
            </div>
          )}
        </Card>

        {/* ── Seat Info ─────────────────────────────────────────────────────── */}
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.white,
            fontFamily: "Georgia,serif", marginBottom: 14 }}>
            📍 Seat Info
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ ...labelStyle, color: fieldErr.venue ? T.red : T.mist }}>VENUE</label>
            <input
              style={{ ...inputStyle, borderColor: fieldErr.venue ? T.red : T.green }}
              placeholder=""
              value={form.venue}
              onChange={e => { set("venue", e.target.value); setVenueAutoSet(false); clearFE("venue"); }}
            />
            {fieldErr.venue && <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{fieldErr.venue}</div>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ ...labelStyle, color: fieldErr.section ? T.red : T.mist }}>SECTION</label>
              <input
                style={{ ...inputStyle, borderColor: fieldErr.section ? T.red : T.green }}
                value={form.section}
                onChange={e => { set("section", e.target.value); clearFE("section"); }}
              />
              {fieldErr.section && <div style={{ fontSize: 10, color: T.red, marginTop: 3 }}>{fieldErr.section}</div>}
            </div>
            <div>
              <label style={{ ...labelStyle, color: fieldErr.row ? T.red : T.mist }}>ROW</label>
              <input
                style={{ ...inputStyle, borderColor: fieldErr.row ? T.red : T.green }}
                value={form.row}
                onChange={e => { set("row", e.target.value); clearFE("row"); }}
              />
              {fieldErr.row && <div style={{ fontSize: 10, color: T.red, marginTop: 3 }}>{fieldErr.row}</div>}
            </div>
          </div>

          {/* Dynamic seat list */}
          <div>
            <label style={{ ...labelStyle, color: fieldErr.seat ? T.red : T.mist }}>
              SEAT{form.seats.length > 1 ? "S" : ""}
            </label>
            {form.seats.map((seat, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input
                  style={{ ...inputStyle, borderColor: fieldErr.seat ? T.red : T.green, flex: 1 }}
                  value={seat}
                  onChange={e => {
                    const updated = [...form.seats];
                    updated[idx] = e.target.value;
                    set("seats", updated);
                    clearFE("seat");
                  }}
                />
                {form.seats.length > 1 && (
                  <button
                    onClick={() => set("seats", form.seats.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: `1px solid ${T.red}55`,
                      borderRadius: 8, color: T.red, fontSize: 16, cursor: "pointer",
                      width: 36, height: 36, flexShrink: 0, display: "flex",
                      alignItems: "center", justifyContent: "center" }}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {fieldErr.seat && <div style={{ fontSize: 10, color: T.red, marginTop: 2 }}>{fieldErr.seat}</div>}
            <button
              onClick={() => set("seats", [...form.seats, ""])}
              style={{ marginTop: 4, background: "none", border: `1px solid ${T.teal}44`,
                borderRadius: 8, color: T.teal, fontSize: 11, fontWeight: 700,
                cursor: "pointer", padding: "6px 14px" }}>
              + Add Another Seat
            </button>
          </div>
        </Card>

        {/* Group buy consent */}
        {podType === "group_buy" && (
          <Card style={{ border: fieldErr.consent ? `1px solid ${T.red}` : undefined }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12,
              cursor: "pointer" }}>
              <input type="checkbox" checked={organizerConsent}
                onChange={e => { setOrganizerConsent(e.target.checked); clearFE("consent"); }}
                style={{ marginTop: 2, accentColor: T.lime, width: 18, height: 18,
                  flexShrink: 0, cursor: "pointer" }} />
              <span style={{ fontSize: 12, color: T.mist, lineHeight: 1.6 }}>
                I agree to purchase the season tickets within{" "}
                <strong style={{ color: T.white }}>48 hours</strong> of full funding,
                under my own name, and to upload the purchase receipt for HalfTime verification.
                I understand that failure to do so will result in the pod being cancelled and
                all members being automatically refunded.
              </span>
            </label>
            {fieldErr.consent && (
              <div style={{ fontSize: 11, color: T.red, marginTop: 6 }}>{fieldErr.consent}</div>
            )}
          </Card>
        )}

        {/* ── Perk Disclosure Commitment (only when perks are included) ────── */}
        {perksIncluded && <Card style={{ border: fieldErr.perkCommitment ? `1px solid ${T.red}` : undefined }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12,
            cursor: "pointer" }}>
            <input type="checkbox" checked={perkCommitment}
              onChange={e => { setPerkCommitment(e.target.checked); clearFE("perkCommitment"); }}
              style={{ marginTop: 2, accentColor: T.lime, width: 18, height: 18,
                flexShrink: 0, cursor: "pointer" }} />
            <span style={{ fontSize: 12, color: T.mist, lineHeight: 1.6 }}>
              I agree to post all team-communicated member perks — player events, meet-and-greets,
              lounge access, postseason seat opportunities, and any other season ticket holder
              benefits — to the pod within{" "}
              <strong style={{ color: T.white }}>48 hours</strong> of receiving notice, so members
              can bid on them fairly. I understand that failing to do so is a violation of
              HalfTime's Terms of Service and may result in account suspension.
            </span>
          </label>
          {fieldErr.perkCommitment && (
            <div style={{ fontSize: 11, color: T.red, marginTop: 6 }}>{fieldErr.perkCommitment}</div>
          )}
        </Card>}

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

import { useState } from "react";

const ACCENT = "#6366F1";

const fmt = v => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const fmtPct = v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

function StatusBadge({ value, colorMap }) {
  const cfg = colorMap[value] || { bg: "#F3F4F6", fg: "#374151" };
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: cfg.bg, color: cfg.fg, fontWeight: 600 }}>
      {value}
    </span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "var(--border-radius-lg)",
      padding: "1.25rem 1.5rem",
      ...style
    }}>
      {children}
    </div>
  );
}

function OptionCard({ opt, onSelect, selected, stateCode, address, currentValue, stateLawName }) {
  const likelihoodColors = {
    "Very High": { bg: "#D1FAE5", fg: "#065F46" },
    "High":      { bg: "#D1FAE5", fg: "#065F46" },
    "Medium":    { bg: "#FEF3C7", fg: "#92400E" },
    "Low":       { bg: "#FEE2E2", fg: "#991B1B" },
  };
  const typeIcons = { duplex: "ti-building", lotSplit: "ti-scissors", both: "ti-layout-grid" };

  return (
    <button
      onClick={() => onSelect(opt)}
      style={{
        display: "block", width: "100%", textAlign: "left",
        border: selected ? `2px solid ${ACCENT}` : "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
        padding: "1rem",
        background: selected ? ACCENT + "08" : "var(--color-background-primary)",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected ? `0 0 0 3px ${ACCENT}22` : "none",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = ACCENT; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = "var(--color-border-tertiary)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className={`ti ${typeIcons[opt.type] || "ti-home"}`} style={{ fontSize: 18, color: ACCENT }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{opt.title}</span>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 99, background: "#EEF2FF", color: ACCENT, fontWeight: 600 }}>
            Up to {opt.maxUnits} units
          </span>
          {opt.likelihood?.rating && (
            <StatusBadge value={opt.likelihood.rating} colorMap={likelihoodColors} />
          )}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>{opt.description}</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "var(--color-text-tertiary)" }}>
        <span><i className="ti ti-currency-dollar" style={{ fontSize: 11 }} /> Cost: <strong style={{ color: "var(--color-text-primary)" }}>{opt.estimatedCost}</strong></span>
        <span><i className="ti ti-calendar" style={{ fontSize: 11 }} /> {opt.timeline}</span>
        <span><i className="ti ti-trending-up" style={{ fontSize: 11, color: ACCENT }} /> +{(opt.valueUplift * 100).toFixed(0)}% value</span>
        <span style={{ color: ACCENT, marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}>
          <i className="ti ti-chevron-right" style={{ fontSize: 12 }} />Details
        </span>
      </div>
    </button>
  );
}

function OptionDetail({ detail, onBack }) {
  if (!detail) return null;
  const { costModel, rentalRates, roi, process: permitProcess } = detail;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: ACCENT, fontSize: 13, fontWeight: 500, padding: "0 0 14px 0" }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Back to options
      </button>

      {/* Cost breakdown */}
      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-receipt" style={{ fontSize: 15, color: ACCENT }} />Cost breakdown
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Low estimate",  value: fmt(costModel.low)  },
            { label: "Mid estimate",  value: fmt(costModel.mid)  },
            { label: "High estimate", value: fmt(costModel.high) },
          ].map(c => (
            <div key={c.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px" }}>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>{c.value}</p>
            </div>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              {["Item", "Low", "High"].map(h => (
                <th key={h} style={{ padding: "4px 8px", textAlign: h === "Item" ? "left" : "right", fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {costModel.breakdown.map((row, i) => (
              <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <td style={{ padding: "5px 8px", color: "var(--color-text-secondary)" }}>{row.item}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmt(row.low)}</td>
                <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmt(row.high)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ROI summary */}
      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-chart-bar" style={{ fontSize: 15, color: ACCENT }} />Return on investment
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          {[
            { label: "Est. value added",    value: fmt(roi.valueUpliftAmt), highlight: true },
            { label: "ROI",                 value: roi.roi ? roi.roi + "%" : "—", highlight: true },
            { label: "Annual rental income",value: fmt(roi.annualRent) },
            { label: "Payback period",      value: roi.paybackYrs ? roi.paybackYrs.toFixed(1) + " years" : "—" },
            { label: "Gross yield",         value: roi.grossYield.toFixed(1) + "%" },
            { label: "Net yield (est.)",    value: roi.netYield.toFixed(1) + "%" },
          ].map(c => (
            <div key={c.label} style={{ background: c.highlight ? ACCENT + "0a" : "var(--color-background-secondary)", border: c.highlight ? `1px solid ${ACCENT}33` : "none", borderRadius: "var(--border-radius-md)", padding: "10px 12px" }}>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: c.highlight ? ACCENT : "var(--color-text-primary)", margin: 0 }}>{c.value}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
          Rental estimate based on {rentalRates.twoBed ? fmt(rentalRates.twoBed) + "/mo" : "local market rates"} for 2-bedroom unit. ROI = value added ÷ midpoint cost.
        </p>
      </Card>

      {/* Permit steps */}
      {permitProcess?.steps?.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <i className="ti ti-file-certificate" style={{ fontSize: 15, color: ACCENT }} />Permit process
            {permitProcess.isLocalData
              ? <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: "#D1FAE5", color: "#065F46", fontWeight: 700 }}>📍 Local data</span>
              : <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: "#F3F4F6", color: "#6B7280", fontWeight: 500 }}>General guide</span>
            }
          </p>
          {permitProcess.portalUrl && (
            <a href={permitProcess.portalUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: ACCENT, textDecoration: "none", margin: "6px 0 12px", padding: "4px 10px", border: `1px solid ${ACCENT}44`, borderRadius: 99 }}>
              <i className="ti ti-external-link" style={{ fontSize: 11 }} />Official permit portal
            </a>
          )}
          {permitProcess.fees && (
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 10, padding: "6px 10px", background: "#FEF9C3", borderRadius: 6, lineHeight: 1.4 }}>
              <strong>Fees:</strong> {permitProcess.fees}
            </p>
          )}
          <div style={{ position: "relative", paddingLeft: 24 }}>
            <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 1.5, background: "var(--color-border-secondary)" }} />
            {permitProcess.steps.map((s, i) => (
              <div key={i} style={{ position: "relative", marginBottom: 14 }}>
                <div style={{ position: "absolute", left: -24, top: 3, width: 15, height: 15, borderRadius: "50%", background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{s.step}</span>
                </div>
                <div style={{ paddingLeft: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{s.title}</span>
                    {s.duration && <span style={{ fontSize: 11, color: ACCENT, background: ACCENT + "18", padding: "1px 6px", borderRadius: 99 }}>{s.duration}</span>}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0", lineHeight: 1.45 }}>{s.description}</p>
                </div>
              </div>
            ))}
          </div>
          {permitProcess.localNotes && (
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "6px 0 0", padding: "6px 10px", background: ACCENT + "0a", borderRadius: 6, lineHeight: 1.4, fontStyle: "italic" }}>
              <i className="ti ti-info-circle" style={{ fontSize: 11, marginRight: 4 }} />{permitProcess.localNotes}
            </p>
          )}
        </Card>
      )}

      {/* Handoff to permit submission */}
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 10 }}>Ready to start your application?</p>
        <button
          onClick={() => {
            const params = new URLSearchParams({
              address: detail.address || "",
              type: detail.optionType || "",
              estimatedValue: roi.valueUpliftAmt || "",
              fromApp: "lot-potential",
            });
            window.open(`/permit-submission?${params.toString()}`, "_blank");
          }}
          style={{
            padding: "12px 32px", borderRadius: "var(--border-radius-md)", border: "none",
            background: ACCENT, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
            boxShadow: `0 2px 10px ${ACCENT}44`,
          }}
        >
          <i className="ti ti-file-plus" style={{ fontSize: 15, marginRight: 6 }} />
          Start permit application
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [address,       setAddress]       = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [result,        setResult]        = useState(null);
  const [selectedOpt,   setSelectedOpt]   = useState(null);
  const [optionDetail,  setOptionDetail]  = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function handleCheck() {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedOpt(null);
    setOptionDetail(null);

    try {
      const res = await fetch("/api/lot/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eligibility check failed");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectOption(opt) {
    setSelectedOpt(opt.type);
    setOptionDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch("/api/lot/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address:      result.address,
          stateCode:    result.stateCode,
          optionType:   opt.type,
          stateLawName: result.stateLaw?.name,
          currentValue: 800000,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load option details");
      setOptionDetail({ ...data, address: result.address, optionType: opt.type });
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  const likelihoodColors = {
    "Very High": { bg: "#D1FAE5", fg: "#065F46" },
    "High":      { bg: "#D1FAE5", fg: "#065F46" },
    "Medium":    { bg: "#FEF3C7", fg: "#92400E" },
    "Low":       { bg: "#FEE2E2", fg: "#991B1B" },
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 760, margin: "0 auto", padding: "2rem 1rem" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
          <i className="ti ti-layout-grid" style={{ fontSize: 21, color: ACCENT }} />
          <span style={{ fontSize: 21, fontWeight: 500, color: "var(--color-text-primary)" }}>Lot Potential</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.55 }}>
          Check if your property qualifies for lot splits or additional units under state zoning reform laws.
          Covers California SB 9, Oregon HB 2001, Washington HB 1110, Montana SB 382, and more.
        </p>
      </div>

      {/* Input */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5 }}>Property address</label>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <i className="ti ti-map-pin" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "var(--color-text-tertiary)", pointerEvents: "none" }} />
            <input
              type="text"
              value={address}
              onChange={e => { setAddress(e.target.value); setResult(null); setError(null); }}
              onKeyDown={e => e.key === "Enter" && handleCheck()}
              placeholder="123 Main St, Portland, OR 97201"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <button
            onClick={handleCheck}
            disabled={!address.trim() || loading}
            style={{
              padding: "0 20px", borderRadius: "var(--border-radius-md)", border: "none",
              background: (!address.trim() || loading) ? "var(--color-background-secondary)" : ACCENT,
              color: (!address.trim() || loading) ? "var(--color-text-tertiary)" : "#fff",
              cursor: (!address.trim() || loading) ? "not-allowed" : "pointer",
              fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {loading
              ? <><span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Checking…</>
              : <><i className="ti ti-search" style={{ fontSize: 14 }} />Check eligibility</>
            }
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "6px 0 0" }}>
          Include full address with state abbreviation — e.g. San Francisco, CA or Portland, OR
        </p>
      </Card>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--border-radius-md)", background: "#FEE2E2", color: "#991B1B", fontSize: 13, marginBottom: "1rem" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 13, marginRight: 6 }} />{error}
        </div>
      )}

      {result && !result.hasReformLaw && (
        <Card>
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <i className="ti ti-map-off" style={{ fontSize: 36, color: "var(--color-text-tertiary)", display: "block", marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 6 }}>{result.stateCode} — No statewide reform law</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>{result.message}</p>
          </div>
        </Card>
      )}

      {result && result.hasReformLaw && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* State law banner */}
          <Card style={{ borderLeft: `4px solid ${ACCENT}`, background: ACCENT + "06" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>{result.stateCode} — {result.stateLaw.name}</p>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{result.stateLaw.summary}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>{result.stateLaw.notes}</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                {result.stateLaw.ownerOccupyRequired && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
                    Owner-occupy {result.stateLaw.ownerOccupyYears}yr required
                  </span>
                )}
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#EEF2FF", color: ACCENT, fontWeight: 600 }}>
                  Up to {result.stateLaw.maxUnits} units
                </span>
              </div>
            </div>
          </Card>

          {/* Property data */}
          {result.propertyData && (
            <Card>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-home-search" style={{ fontSize: 15, color: ACCENT }} />Property details found
                <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: result.propertyData.confidence === "high" ? "#D1FAE5" : "#FEF3C7", color: result.propertyData.confidence === "high" ? "#065F46" : "#92400E", fontWeight: 700, marginLeft: 4 }}>
                  {result.propertyData.confidence} confidence
                </span>
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                {[
                  { label: "Zoning",         value: result.propertyData.zoning || "Unknown" },
                  { label: "Lot size",        value: result.propertyData.lotSizeSqft ? result.propertyData.lotSizeSqft.toLocaleString() + " sqft" : "Unknown" },
                  { label: "Current units",   value: result.propertyData.currentUnits ?? "Unknown" },
                  { label: "Historic district", value: result.propertyData.historicDistrict === true ? "Yes" : result.propertyData.historicDistrict === false ? "No" : "Unknown" },
                  { label: "Fire hazard zone", value: result.propertyData.fireHazardZone === true ? "Yes" : result.propertyData.fireHazardZone === false ? "No" : "Unknown" },
                  { label: "Flood zone",       value: result.propertyData.floodZone === true ? "Yes" : result.propertyData.floodZone === false ? "No" : "Unknown" },
                ].map(item => (
                  <div key={item.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                    <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{String(item.value)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Not eligible */}
          {!result.isEligible && result.disqualified?.length > 0 && (
            <Card style={{ borderLeft: "4px solid #DC2626" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#991B1B", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-circle-x" style={{ fontSize: 15 }} />Property does not appear eligible
              </p>
              {result.disqualified.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                  <i className="ti ti-x" style={{ fontSize: 12, color: "#DC2626", marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{d.reason}</span>
                    <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0", lineHeight: 1.4 }}>{d.detail}</p>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                Consult a land use attorney to verify — AI research may not capture recent changes.
              </p>
            </Card>
          )}

          {/* Eligible — show options */}
          {result.isEligible && result.options?.length > 0 && !optionDetail && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-circle-check" style={{ fontSize: 15, color: "#059669" }} />
                <span style={{ color: "#059669" }}>Eligible</span> — {result.options.length} development option{result.options.length > 1 ? "s" : ""} available
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.options.map((opt, i) => (
                  <OptionCard
                    key={i}
                    opt={opt}
                    selected={selectedOpt === opt.type}
                    onSelect={handleSelectOption}
                    stateCode={result.stateCode}
                    address={result.address}
                    stateLawName={result.stateLaw?.name}
                  />
                ))}
              </div>
              {detailLoading && (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-secondary)", fontSize: 13 }}>
                  <span style={{ display: "inline-block", width: 20, height: 20, border: `2px solid ${ACCENT}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 8 }} />
                  <p style={{ margin: "8px 0 0" }}>Loading cost model and permit steps…</p>
                </div>
              )}
            </div>
          )}

          {/* Option detail */}
          {optionDetail && !detailLoading && (
            <OptionDetail detail={optionDetail} onBack={() => { setOptionDetail(null); setSelectedOpt(null); }} />
          )}

          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.6, margin: 0 }}>
            <i className="ti ti-info-circle" style={{ fontSize: 13, verticalAlign: "-2px", marginRight: 3 }} />
            Not legal advice. Eligibility determined by AI research — verify with a licensed land use attorney and your local planning department before proceeding.
          </p>
        </div>
      )}

      {!result && !loading && (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--color-text-tertiary)", fontSize: 13 }}>
          <i className="ti ti-layout-grid" style={{ fontSize: 38, display: "block", marginBottom: 10, color: ACCENT + "66" }} />
          Enter any US address to check eligibility under state zoning reform laws
        </div>
      )}
    </div>
  );
}

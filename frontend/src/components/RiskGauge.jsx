// Analog risk meter + heist-viability badge, computed from real data
// (recent volatility + RSI extremity + forecast downside). Heuristic, not advice.

function computeRisk(data) {
  const hist = (data.historical || []).map((h) => h.price).filter((p) => p != null)
  const rsiArr = (data.indicators?.rsi || []).filter((v) => v != null)
  const lastRsi = rsiArr.length ? rsiArr[rsiArr.length - 1] : 50

  const rets = []
  for (let i = 1; i < hist.length; i++) if (hist[i - 1]) rets.push((hist[i] - hist[i - 1]) / hist[i - 1])
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0
  const vol = rets.length ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) : 0

  const last = hist[hist.length - 1] || 0
  const yend = data.forecast?.yhat?.length ? data.forecast.yhat[data.forecast.yhat.length - 1] : last
  const fchg = last ? (yend - last) / last : 0

  let score = 0
  score += Math.min(vol * 100 * 4, 40) // volatility → up to 40
  score += Math.min((Math.abs(lastRsi - 50) / 50) * 25, 25) // RSI extremity → up to 25
  score += fchg < 0 ? Math.min(-fchg * 120, 35) : 0 // forecast downside → up to 35
  score = Math.max(2, Math.min(98, Math.round(score)))

  let label = 'LOW RISK'
  let color = '#39ff14'
  if (score >= 66) { label = 'CRITICAL HEIST FAIL RISK'; color = '#ff2436' }
  else if (score >= 33) { label = 'MEDIUM RISK'; color = '#ffb000' }

  let viability = 'GO'
  let viaColor = '#39ff14'
  if (score >= 66) { viability = 'ABORT'; viaColor = '#ff2436' }
  else if (score >= 40) { viability = 'HOLD'; viaColor = '#ffb000' }

  return { score, label, color, viability, viaColor, vol, lastRsi, fchg }
}

function arcPoints(cx, cy, r, startDeg, endDeg, steps = 30) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const deg = startDeg + ((endDeg - startDeg) * i) / steps
    const rad = (deg * Math.PI) / 180
    pts.push(`${(cx + r * Math.cos(rad)).toFixed(1)},${(cy - r * Math.sin(rad)).toFixed(1)}`)
  }
  return pts.join(' ')
}

export default function RiskGauge({ data }) {
  const r = computeRisk(data)
  const cx = 110, cy = 108, radius = 86
  const needleDeg = 180 - (r.score / 100) * 180
  const nrad = (needleDeg * Math.PI) / 180
  const nx = cx + (radius - 12) * Math.cos(nrad)
  const ny = cy - (radius - 12) * Math.sin(nrad)

  return (
    <div className="risk-gauge">
      <svg viewBox="0 0 220 132" width="100%" className="gauge-svg" role="img" aria-label={`Risk ${r.score} of 100`}>
        {/* zones */}
        <polyline points={arcPoints(cx, cy, radius, 180, 120)} fill="none" stroke="#39ff14" strokeWidth="13" strokeLinecap="round" opacity="0.85" />
        <polyline points={arcPoints(cx, cy, radius, 120, 60)} fill="none" stroke="#ffb000" strokeWidth="13" opacity="0.85" />
        <polyline points={arcPoints(cx, cy, radius, 60, 0)} fill="none" stroke="#ff2436" strokeWidth="13" strokeLinecap="round" opacity="0.85" />
        {/* ticks */}
        <text x="16" y="128" className="gauge-tick">LOW</text>
        <text x="96" y="20" className="gauge-tick" textAnchor="middle">MED</text>
        <text x="188" y="128" className="gauge-tick" textAnchor="end">CRIT</text>
        {/* needle */}
        <line x1={cx} y1={cy} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke={r.color} strokeWidth="3" />
        <circle cx={cx} cy={cy} r="6" fill="#0a141b" stroke={r.color} strokeWidth="2" />
        <text x={cx} y="80" textAnchor="middle" className="gauge-score" fill={r.color}>
          {r.score}
        </text>
      </svg>

      <div className="risk-readout">
        <span className="risk-label" style={{ color: r.color, borderColor: r.color }}>
          {r.label}
        </span>
        <div className="viability" title="Heist viability — derived from the risk score">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={r.viaColor} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 7 L16 7 L19 21 L5 21 Z" />
            <path d="M9 7 C9 4 15 4 15 7" />
            <text x="12" y="17" textAnchor="middle" fontSize="7" fill={r.viaColor} stroke="none">$</text>
          </svg>
          <span className="viability-tag" style={{ color: r.viaColor }}>HEIST: {r.viability}</span>
        </div>
      </div>
    </div>
  )
}

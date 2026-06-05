// Compact market snapshot computed from the current analysis data.
const UP = '#39ff14'
const DOWN = '#ff2436'
const AMBER = '#ffb000'

function fmtUsd(v) {
  if (v == null) return '—'
  const abs = Math.abs(v)
  return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: abs < 1 ? 4 : abs < 100 ? 2 : 0 })
}
function pct(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
}

function Tile({ label, value, color, arrow }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={color ? { color } : undefined}>
        {arrow && <span className="stat-arrow">{arrow}</span>}
        {value}
      </span>
    </div>
  )
}

export default function StatStrip({ data }) {
  const hist = data.historical || []
  if (!hist.length) return null

  const prices = hist.map((h) => h.price)
  const cur = prices[prices.length - 1]
  const first = prices[0]
  const change = first ? ((cur - first) / first) * 100 : 0
  const high = Math.max(...prices)
  const low = Math.min(...prices)

  const rsiArr = (data.indicators?.rsi || []).filter((v) => v != null)
  const rsi = rsiArr.length ? rsiArr[rsiArr.length - 1] : null

  const yhat = data.forecast?.yhat || []
  const fend = yhat.length ? yhat[yhat.length - 1] : cur
  const fpct = cur ? ((fend - cur) / cur) * 100 : 0

  const rsiColor = rsi == null ? 'var(--muted)' : rsi >= 70 ? DOWN : rsi <= 30 ? UP : AMBER

  return (
    <div className="stat-strip">
      <Tile label="Price" value={fmtUsd(cur)} />
      <Tile label={`Change ${data.days}d`} value={pct(change)} color={change >= 0 ? UP : DOWN} arrow={change >= 0 ? '▲' : '▼'} />
      <Tile label="Period High" value={fmtUsd(high)} />
      <Tile label="Period Low" value={fmtUsd(low)} />
      <Tile label="RSI now" value={rsi == null ? 'n/a' : rsi.toFixed(1)} color={rsiColor} />
      <Tile label={`Forecast ${data.horizon}d`} value={pct(fpct)} color={fpct >= 0 ? UP : DOWN} arrow={fpct >= 0 ? '▲' : '▼'} />
    </div>
  )
}

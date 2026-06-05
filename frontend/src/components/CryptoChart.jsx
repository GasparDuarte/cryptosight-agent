import { useState, useMemo } from 'react'
import {
  ComposedChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts'
import StatStrip from './StatStrip'

// CRIME.NET tactical palette
const COLORS = {
  price: '#00eaff',
  forecast: '#39ff14',
  ma7: '#ffb000',
  ma30: '#ff2436',
  band: 'rgba(0, 234, 255, 0.10)',
  bandChip: '#5f93a3',
  boll: '#46c2d6',
  tenkan: '#ff6ec7',
  kijun: '#6e9bff',
  rsi: '#c061ff',
}
const AXIS = '#7cc0d0'
const GRID = '#123842'

const INDICATORS = [
  { key: 'price', name: 'Price', color: COLORS.price, desc: 'Actual market price' },
  { key: 'ma7', name: '7-day avg', color: COLORS.ma7, desc: '7-day moving average — smooths short-term noise' },
  { key: 'ma30', name: '30-day avg', color: COLORS.ma30, desc: '30-day moving average — the broader trend' },
  { key: 'forecast', name: 'Forecast', color: COLORS.forecast, desc: "Prophet's projection for your horizon" },
  { key: 'band', name: 'Confidence', color: COLORS.bandChip, desc: 'Forecast confidence range' },
  { key: 'boll', name: 'Bollinger', color: COLORS.boll, desc: 'Bollinger Bands (20, 2σ) — volatility envelope' },
  { key: 'ichimoku', name: 'Ichimoku', color: COLORS.tenkan, desc: 'Ichimoku Tenkan (9) & Kijun (26) lines' },
]

// ---------- client-side indicator math ----------
function bollinger(prices, period = 20, k = 2) {
  const up = [], lo = []
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { up.push(null); lo.push(null); continue }
    const win = prices.slice(i - period + 1, i + 1)
    const m = win.reduce((a, b) => a + b, 0) / period
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / period)
    up.push(+(m + k * sd).toFixed(6))
    lo.push(+(m - k * sd).toFixed(6))
  }
  return { up, lo }
}
function donchianMid(prices, period) {
  const out = []
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { out.push(null); continue }
    const win = prices.slice(i - period + 1, i + 1)
    out.push(+(((Math.max(...win) + Math.min(...win)) / 2)).toFixed(6))
  }
  return out
}

function fmtDate(d) {
  return d ? d.slice(5) : ''
}
function fmtUsd(v) {
  if (v == null) return ''
  const abs = Math.abs(v)
  return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: abs < 1 ? 4 : abs < 100 ? 2 : 0 })
}

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="tooltip">
      <div className="tooltip-date">{label}</div>
      {payload
        .filter((p) => p.value != null && p.dataKey !== 'range')
        .map((p) => (
          <div key={p.dataKey} className="tooltip-row">
            <span className="dot" style={{ background: p.color }} />
            {p.name}: <b>{p.dataKey === 'rsi' ? Number(p.value).toFixed(1) : fmtUsd(p.value)}</b>
          </div>
        ))}
    </div>
  )
}

function downloadJSON(data) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cryptosight-${data.symbol || 'analysis'}-${data.generated_at || ''}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    /* ignore */
  }
}

export default function CryptoChart({ data, autoSR = false }) {
  const [visible, setVisible] = useState({
    price: true, ma7: true, ma30: true, forecast: true, band: true, boll: false, ichimoku: false,
  })
  const [chartType, setChartType] = useState('line')
  const [scale, setScale] = useState('linear')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showTable, setShowTable] = useState(false)

  const toggle = (k) => setVisible((v) => ({ ...v, [k]: !v[k] }))

  // Heavy, data-only derivations (Bollinger, Ichimoku, merged series, S/R, table)
  // are memoized so toggling layers/scale doesn't recompute them every render.
  const base = useMemo(() => {
    const { historical = [], forecast = {}, indicators = {} } = data
    const prices = historical.map((h) => h.price)
    const boll = bollinger(prices, 20, 2)
    const tenkan = donchianMid(prices, 9)
    const kijun = donchianMid(prices, 26)

    const hist = historical.map((h, i) => ({
      date: h.date,
      price: h.price,
      ma7: indicators.ma7?.[i] ?? null,
      ma30: indicators.ma30?.[i] ?? null,
      rsi: indicators.rsi?.[i] ?? null,
      bollUp: boll.up[i],
      bollLo: boll.lo[i],
      tenkan: tenkan[i],
      kijun: kijun[i],
    }))

    const fc = (forecast.dates || []).map((d, i) => ({
      date: d,
      yhat: forecast.yhat[i],
      range: [forecast.yhat_lower[i], forecast.yhat_upper[i]],
    }))

    const bridged = hist.map((p, i) =>
      i === hist.length - 1 ? { ...p, yhat: p.price, range: [p.price, p.price] } : p,
    )
    const merged = [...bridged, ...fc]

    const recent = prices.slice(-Math.min(30, prices.length))
    const support = recent.length ? Math.min(...recent) : null
    const resistance = recent.length ? Math.max(...recent) : null

    const tableRows = historical.slice(-10).map((h, i) => {
      const idx = historical.length - 10 + i
      return {
        date: h.date,
        price: h.price,
        ma7: indicators.ma7?.[idx],
        ma30: indicators.ma30?.[idx],
        rsi: indicators.rsi?.[idx],
      }
    })

    return { hist, fc, merged, support, resistance, tableRows }
  }, [data])

  const { hist, merged, support, resistance, tableRows } = base

  const yDomain = useMemo(() => {
    const lineVals = []
    hist.forEach((h) => {
      if (h.price != null) lineVals.push(h.price)
      if (visible.ma7 && h.ma7 != null) lineVals.push(h.ma7)
      if (visible.ma30 && h.ma30 != null) lineVals.push(h.ma30)
      if (visible.boll && h.bollUp != null) { lineVals.push(h.bollUp); lineVals.push(h.bollLo) }
      if (visible.ichimoku && h.kijun != null) { lineVals.push(h.kijun); lineVals.push(h.tenkan) }
    })
    if (visible.forecast) base.fc.forEach((f) => f.yhat != null && lineVals.push(f.yhat))
    if (autoSR && support != null) { lineVals.push(support); lineVals.push(resistance) }
    if (!lineVals.length) return ['auto', 'auto']
    const lo = Math.min(...lineVals)
    const hi = Math.max(...lineVals)
    if (scale === 'log') return [Math.max(lo * 0.9, 1e-9), hi * 1.1]
    const pad = (hi - lo) * 0.08 || hi * 0.04 || 1
    return [Math.max(0, lo - pad), hi + pad]
  }, [base, hist, support, resistance, visible, scale, autoSR])

  return (
    <div className="chart-wrap">
      <StatStrip data={data} />
      <div className="chart-body">
        <aside className={`indicators-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen((o) => !o)} title="Collapse / expand indicators">
            {sidebarOpen ? '◀ INDICATORS' : '▶'}
          </button>
          {sidebarOpen && (
            <div className="sidebar-list">
              {INDICATORS.map((s) => (
                <button
                  key={s.key}
                  className={`series-chip ${visible[s.key] ? 'on' : 'off'}`}
                  onClick={() => toggle(s.key)}
                  title={s.desc}
                >
                  <span className="series-dot" style={{ background: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="chart-main">
          <div className="chart-toolbar">
            <div className="toolbar-group">
              <span className="toolbar-label">View</span>
              <div className="seg" title="Line vs. filled area">
                <button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>Line</button>
                <button className={chartType === 'area' ? 'active' : ''} onClick={() => setChartType('area')}>Area</button>
              </div>
              <div className="seg" title="Linear vs. logarithmic price scale">
                <button className={scale === 'linear' ? 'active' : ''} onClick={() => setScale('linear')}>Linear</button>
                <button className={scale === 'log' ? 'active' : ''} onClick={() => setScale('log')}>Log</button>
              </div>
            </div>
            <div className="chart-actions">
              <button className="export-btn" onClick={() => downloadJSON(data)} title="Download this analysis as JSON">
                ⬇ Export
              </button>
              <button className={`data-table-btn ${showTable ? 'active' : ''}`} onClick={() => setShowTable((s) => !s)} title="Toggle raw data matrix">
                ▦ Data Matrix
              </button>
            </div>
          </div>

          <div className="chart-legend-note">
            ▸ PRICE TELEMETRY · historical vs. Prophet forecast · band = confidence interval · drag the bar below to zoom
          </div>

          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={merged} syncId="cs" margin={{ top: 10, right: 20, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.price} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.price} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={fmtDate} stroke={AXIS} fontSize={12} minTickGap={24} />
                <YAxis tickFormatter={fmtUsd} stroke={AXIS} fontSize={12} domain={yDomain} scale={scale} allowDataOverflow width={72} />
                <Tooltip content={<DarkTooltip />} />
                {autoSR && support != null && (
                  <ReferenceLine y={support} stroke={COLORS.forecast} strokeDasharray="6 4" label={{ value: `S ${fmtUsd(support)}`, fill: COLORS.forecast, fontSize: 11, position: 'insideBottomLeft' }} />
                )}
                {autoSR && resistance != null && (
                  <ReferenceLine y={resistance} stroke={COLORS.ma30} strokeDasharray="6 4" label={{ value: `R ${fmtUsd(resistance)}`, fill: COLORS.ma30, fontSize: 11, position: 'insideTopLeft' }} />
                )}
                {visible.band && <Area type="linear" dataKey="range" name="Interval" stroke="none" fill={COLORS.band} isAnimationActive={false} connectNulls />}
                {visible.boll && <Line type="monotone" dataKey="bollUp" name="Boll up" stroke={COLORS.boll} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls />}
                {visible.boll && <Line type="monotone" dataKey="bollLo" name="Boll low" stroke={COLORS.boll} strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls />}
                {visible.ichimoku && <Line type="monotone" dataKey="tenkan" name="Tenkan" stroke={COLORS.tenkan} strokeWidth={1.3} dot={false} connectNulls />}
                {visible.ichimoku && <Line type="monotone" dataKey="kijun" name="Kijun" stroke={COLORS.kijun} strokeWidth={1.3} dot={false} connectNulls />}
                {visible.price && chartType === 'area' && (
                  <Area type="linear" dataKey="price" name="Price" stroke={COLORS.price} strokeWidth={2.2} fill="url(#priceArea)" dot={false} connectNulls />
                )}
                {visible.price && chartType === 'line' && (
                  <Line type="linear" dataKey="price" name="Price" stroke={COLORS.price} strokeWidth={2.2} dot={false} connectNulls />
                )}
                {visible.ma7 && <Line type="monotone" dataKey="ma7" name="MA7" stroke={COLORS.ma7} strokeWidth={1.5} dot={false} connectNulls />}
                {visible.ma30 && <Line type="monotone" dataKey="ma30" name="MA30" stroke={COLORS.ma30} strokeWidth={1.5} dot={false} connectNulls />}
                {visible.forecast && <Line type="linear" dataKey="yhat" name="Forecast" stroke={COLORS.forecast} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />}
                <Brush dataKey="date" height={26} stroke={COLORS.price} fill="#06121a" travellerWidth={9} tickFormatter={fmtDate} />
              </ComposedChart>
            </ResponsiveContainer>

            {showTable && (
              <div className="data-matrix">
                <div className="matrix-head">
                  <span>RAW DATA MATRIX · last 10</span>
                  <button onClick={() => setShowTable(false)}>✕</button>
                </div>
                <table>
                  <thead>
                    <tr><th>DATE</th><th>PRICE</th><th>MA7</th><th>MA30</th><th>RSI</th></tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => (
                      <tr key={r.date}>
                        <td>{r.date}</td>
                        <td>{fmtUsd(r.price)}</td>
                        <td>{r.ma7 != null ? fmtUsd(r.ma7) : '—'}</td>
                        <td>{r.ma30 != null ? fmtUsd(r.ma30) : '—'}</td>
                        <td>{r.rsi != null ? r.rsi.toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="chart-legend-note rsi-title">RSI (14) — overbought &gt;70 · oversold &lt;30</div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={merged} syncId="cs" margin={{ top: 5, right: 20, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} stroke={AXIS} fontSize={12} minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} stroke={AXIS} fontSize={12} width={72} />
          <Tooltip content={<DarkTooltip />} />
          <ReferenceLine y={70} stroke={COLORS.ma30} strokeDasharray="4 4" />
          <ReferenceLine y={30} stroke={COLORS.forecast} strokeDasharray="4 4" />
          <Line type="linear" dataKey="rsi" name="RSI" stroke={COLORS.rsi} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

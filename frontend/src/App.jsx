import { useState, useEffect, useRef } from 'react'
import { analyze, searchCoins, fetchConfig } from './api/client'
import CryptoChart from './components/CryptoChart'
import AgentSteps from './components/AgentSteps'
import AgentReport from './components/AgentReport'
import Chat from './components/Chat'
import MaskLogo from './components/MaskLogo'
import IntroSplash from './components/IntroSplash'

const POPULAR = [
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
  { id: 'solana', name: 'Solana', symbol: 'SOL' },
  { id: 'cardano', name: 'Cardano', symbol: 'ADA' },
  { id: 'ripple', name: 'XRP', symbol: 'XRP' },
  { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' },
  { id: 'binancecoin', name: 'BNB', symbol: 'BNB' },
  { id: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX' },
  { id: 'chainlink', name: 'Chainlink', symbol: 'LINK' },
  { id: 'polkadot', name: 'Polkadot', symbol: 'DOT' },
  { id: 'litecoin', name: 'Litecoin', symbol: 'LTC' },
  { id: 'tron', name: 'TRON', symbol: 'TRX' },
]
const DAYS = [7, 14, 30, 90, 180, 365]
const HORIZONS = [3, 7, 14, 30, 60]
const HISTORY_MARKS = [
  { at: 7, label: '1w' }, { at: 30, label: '1m' }, { at: 90, label: '3m' },
  { at: 180, label: '6m' }, { at: 365, label: '1y' },
]
const HORIZON_MARKS = [
  { at: 3, label: '3d' }, { at: 7, label: '1w' }, { at: 14, label: '2w' },
  { at: 30, label: '1m' }, { at: 60, label: '2m' },
]

function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v != null ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
function clampNum(v, lo, hi, fb) {
  return typeof v === 'number' && isFinite(v) ? Math.min(Math.max(v, lo), hi) : fb
}

// ----- tactical neon-line icons -----
function IntelIcon() {
  return (
    <svg className="title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <rect x="6" y="3" width="13" height="16" rx="1" transform="rotate(8 12 11)" opacity="0.5" />
      <rect x="4" y="5" width="13" height="16" rx="1" />
      <path d="M7 10h7M7 13h7M7 16h4" />
    </svg>
  )
}
function ScopeIcon() {
  return (
    <svg className="title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z" />
      <path d="M9.5 12l1.8 1.8 3.5-3.6" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg className="title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3l9.5 16.5H2.5L12 3z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const pad = (n) => String(n).padStart(2, '0')
  return (
    <span className="clock">
      TERMINAL // {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
    </span>
  )
}

function CoinSelector({ coin, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState(POPULAR)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults(POPULAR)
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        setResults(await searchCoins(query.trim()))
      } catch {
        setResults([])
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(c) {
    onSelect(c)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="control coin-selector" ref={boxRef}>
      <div className="pill-head">
        <span className="pill-label brass">Target Asset</span>
      </div>
      <div className="pill-hint">The coin to analyze</div>
      <button type="button" className="coin-current brass-switch" onClick={() => setOpen((o) => !o)}>
        <span className="coin-led" />
        <span className="coin-symbol">{coin.symbol}</span>
        <span className="coin-name">{coin.name}</span>
        <span className="coin-caret">▾</span>
      </button>
      {open && (
        <div className="coin-dropdown">
          <input
            autoFocus
            className="coin-search"
            placeholder="SEARCH ANY ASSET… (e.g. pepe, arbitrum)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="coin-results">
            {loading && <div className="coin-result muted">SCANNING…</div>}
            {!loading && results.length === 0 && <div className="coin-result muted">NO MATCHES.</div>}
            {!loading &&
              results.map((c) => (
                <button key={c.id} className="coin-result" onClick={() => pick(c)}>
                  <span className="coin-symbol">{c.symbol}</span>
                  <span className="coin-name">{c.name}</span>
                  {c.rank != null && <span className="coin-rank">#{c.rank}</span>}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// continuous geared slider + preset pills, with a PRESET/CUSTOM mode toggle
function TimeControl({ label, hint, presets, min, max, marks, value, onChange, lockedNote }) {
  const [mode, setMode] = useState('preset')
  const clamped = Math.min(Math.max(value, min), max)
  return (
    <div className="control time-control">
      <div className="pill-head">
        <span className="pill-label">{label}</span>
        <span className="pill-value">{value} {value === 1 ? 'day' : 'days'}</span>
      </div>
      <div className="pill-hint">{hint}</div>
      <div className="seg mode-toggle">
        <button className={mode === 'preset' ? 'active' : ''} onClick={() => setMode('preset')}>Preset</button>
        <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Custom</button>
      </div>
      {mode === 'preset' ? (
        <div className="pill-row">
          {presets.map((p) => (
            <button key={p} type="button" className={`pill ${p === value ? 'active' : ''}`} onClick={() => onChange(p)}>
              {p}
            </button>
          ))}
        </div>
      ) : (
        <div className="geared-slider">
          <input
            type="range"
            className="geared"
            min={min}
            max={max}
            step={1}
            value={clamped}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <div className="slider-marks">
            {marks.map((m) => (
              <span key={m.label} className="slider-mark" style={{ left: `${((m.at - min) / (max - min)) * 100}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="locked-tier" title="Requires CoinGecko PRO data tier">
        <span className="lock">🔒</span> {lockedNote}
      </div>
    </div>
  )
}

function ResolutionControl() {
  const opts = [
    { v: '1m', locked: true },
    { v: '15m', locked: true },
    { v: '1h', locked: true },
    { v: '1d', locked: false },
  ]
  return (
    <div className="control res-control">
      <div className="pill-head">
        <span className="pill-label">Data Resolution</span>
        <span className="pill-value">1d</span>
      </div>
      <div className="pill-hint">Free tier delivers daily candles</div>
      <div className="pill-row">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={o.locked}
            className={`pill res-pill ${o.locked ? 'locked' : 'active'}`}
            title={o.locked ? 'Requires PRO data tier' : 'Active resolution'}
          >
            {o.locked && <span className="lock">🔒</span>}
            {o.v}
          </button>
        ))}
      </div>
    </div>
  )
}

function RefreshToggle({ on, onToggle }) {
  return (
    <div className="control refresh-control">
      <div className="pill-head">
        <span className="pill-label">Auto-Refresh</span>
        <span className="pill-value">{on ? 'ARMED' : 'SAFE'}</span>
      </div>
      <div className="pill-hint">Re-run analysis every 60s</div>
      <button type="button" className={`safety-toggle ${on ? 'on' : ''}`} onClick={onToggle}>
        <span className="safety-cover" />
        <span className="safety-knob" />
        <span className="safety-state">{on ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty-state">
      <MaskLogo size={150} variant="schematic" />
      <p className="empty-text">
        NO TARGET ACQUIRED.
        <br />
        INIT HEIST-PLAN PROTOCOL.
      </p>
      <ul className="heist-plan">
        <li>◇ Confirm trend</li>
        <li>◇ Check key levels</li>
        <li>◇ Verify forecast</li>
      </ul>
    </div>
  )
}

function ChartSkeleton() {
  return <div className="skeleton skeleton-chart" />
}
function StepsSkeleton() {
  return (
    <div>
      {[0, 1, 2].map((i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton skeleton-dot" />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-line" style={{ width: '40%' }} />
            <div className="skeleton skeleton-line" style={{ width: '90%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
function ReportSkeleton() {
  return (
    <div>
      <div className="skeleton skeleton-line" style={{ width: '30%', height: 22 }} />
      {[80, 95, 70, 88, 60].map((w, i) => (
        <div className="skeleton skeleton-line" key={i} style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

export default function App() {
  // The breach intro plays once per browser session (sessionStorage): a visitor
  // sees it on first open, but refreshes within the session skip straight to the app.
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return !sessionStorage.getItem('cs_intro_seen')
    } catch {
      return true
    }
  })

  const [coin, setCoin] = useState(() => {
    const c = loadPref('cs_coin', POPULAR[0])
    return c && c.id && c.symbol ? c : POPULAR[0]
  })
  const [days, setDays] = useState(() => clampNum(loadPref('cs_days', 30), 2, 365, 30))
  const [horizon, setHorizon] = useState(() => clampNum(loadPref('cs_horizon', 7), 1, 60, 7))
  const [confidence, setConfidence] = useState(() => clampNum(loadPref('cs_conf', 0.8), 0.5, 0.99, 0.8))
  const [autoSR, setAutoSR] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // The safety cover always starts CLOSED on each load, so the "flip the cover
  // to arm" reveal happens every session (intentionally not persisted).
  const [armed, setArmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [agentAvailable, setAgentAvailable] = useState(false)
  const [fx, setFx] = useState(() => {
    const v = loadPref('cs_fx', true)
    return typeof v === 'boolean' ? v : true
  })

  // Always open at the top of the page on load.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    fetchConfig()
      .then((c) => setAgentAvailable(!!c.agent_available))
      .catch(() => setAgentAvailable(false))
  }, [])

  // remember the selected coin + settings across reloads
  useEffect(() => {
    try {
      localStorage.setItem('cs_coin', JSON.stringify(coin))
      localStorage.setItem('cs_days', JSON.stringify(days))
      localStorage.setItem('cs_horizon', JSON.stringify(horizon))
      localStorage.setItem('cs_conf', JSON.stringify(confidence))
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  }, [coin, days, horizon, confidence])

  // useAgent=false → fast deterministic result (data + Prophet + rule-based), no API
  // spend. useAgent=true (the Initiate button) → full Claude ReAct reasoning.
  async function onAnalyze(useAgent = true) {
    setLoading(true)
    setError(null)
    try {
      const res = await analyze({ symbol: coin.id, days, horizon, confidence, useAgent })
      setData(res)
    } catch (e) {
      setError(e.message || 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // auto-refresh: keep the interval calling the latest onAnalyze
  const analyzeRef = useRef(onAnalyze)
  analyzeRef.current = onAnalyze
  useEffect(() => {
    if (!autoRefresh) return
    // Refresh in fast mode so an armed 60s loop never silently drains the API quota.
    const id = setInterval(() => analyzeRef.current(false), 60000)
    return () => clearInterval(id)
  }, [autoRefresh])

  // Auto-run the default coin once on first load so the dashboard is populated
  // right away (no big empty box on open).
  useEffect(() => {
    analyzeRef.current(false) // instant deterministic dashboard; the agent runs on the button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleArmed() {
    setArmed((a) => !a)
  }

  function scrollToDisclaimer() {
    document.getElementById('disclaimer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function toggleFx() {
    setFx((v) => {
      const next = !v
      try {
        localStorage.setItem('cs_fx', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <>
      {showIntro && (
        <IntroSplash
          onComplete={() => {
            try {
              sessionStorage.setItem('cs_intro_seen', '1')
            } catch {
              /* sessionStorage unavailable — non-fatal */
            }
            setShowIntro(false)
            window.scrollTo(0, 0)
          }}
        />
      )}

      {fx && <div className="crt-overlay" aria-hidden="true" />}

      <div className="app">
        <div className="statusbar">
          <span className="statusbar-left">
            <span className="live-dot" /> CRIME.NET ▸ SECURE LINK ESTABLISHED
          </span>
          <span className="statusbar-right">
            <Clock /> <span className="sep">·</span> SYS <span className="ok">ONLINE</span>
            <button className="fx-toggle" onClick={toggleFx} title="Toggle CRT screen effects (scanlines / vignette)">
              FX {fx ? 'ON' : 'OFF'}
            </button>
          </span>
        </div>

        <header className="header">
          <div className="brand">
            <div className="logo">
              <MaskLogo size={50} />
            </div>
            <div>
              <h1>
                CryptoSight <span>Agent</span>
              </h1>
              <p className="tagline">AI-powered crypto forecasting · Prophet · technical analysis</p>
            </div>
          </div>
          <div className="header-right">
            <button
              className="disclaimer-btn"
              onClick={scrollToDisclaimer}
              title="AI-generated · not financial advice — read the full disclaimer"
            >
              ⚠ Disclaimer
            </button>
            <span className={`api-pill ${agentAvailable ? 'on' : 'off'}`}>
              <span className="pill-dot" />
              {agentAvailable ? 'CLAUDE AGENT ONLINE' : 'DETERMINISTIC MODE'}
            </span>
          </div>
        </header>

        <section className="controls card reinforced">
          <div className="controls-row">
            <CoinSelector coin={coin} onSelect={setCoin} />
            <TimeControl label="History" hint="How much past data to analyze" presets={DAYS} min={1} max={365} marks={HISTORY_MARKS} value={days} onChange={setDays} lockedNote="3Y · 5Y · 10Y — PRO DATA TIER" />
            <TimeControl label="Horizon" hint="How far ahead to forecast" presets={HORIZONS} min={1} max={60} marks={HORIZON_MARKS} value={horizon} onChange={setHorizon} lockedNote="90D · 180D · 1Y — PRO DATA TIER" />
          </div>

          <div className="controls-row secondary">
            <ResolutionControl />
            <RefreshToggle on={autoRefresh} onToggle={() => setAutoRefresh((v) => !v)} />
            <button type="button" className={`adv-config-btn ${advancedOpen ? 'open' : ''}`} onClick={() => setAdvancedOpen((o) => !o)}>
              ⚙ Advanced Config
            </button>
          </div>

          {advancedOpen && (
            <div className="advanced-config">
              <div className="adv-row">
                <div className="adv-head">
                  <span className="pill-label">Confidence Interval</span>
                  <span className="pill-value">{Math.round(confidence * 100)}%</span>
                </div>
                <input type="range" min={50} max={95} step={5} value={Math.round(confidence * 100)} onChange={(e) => setConfidence(Number(e.target.value) / 100)} />
                <div className="pill-hint">Width of the forecast uncertainty band (wired to Prophet)</div>
              </div>
              <div className="adv-row">
                <label className="adv-toggle">
                  <input type="checkbox" checked={autoSR} onChange={(e) => setAutoSR(e.target.checked)} />
                  <span>Auto support / resistance</span>
                </label>
                <div className="pill-hint">Draw recent swing high & low on the chart</div>
              </div>
            </div>
          )}

          <div className="controls-summary">
            ▸ TARGET <b>{coin.symbol}</b> · <b>{days}d</b> history · <b>{horizon}d</b> forecast · <b>{Math.round(confidence * 100)}%</b> band · <b>1d</b> resolution
          </div>

          <div className={`analyze-housing ${armed ? 'armed' : ''}`}>
            <button type="button" className="safety-lid" onClick={toggleArmed} title="Flip the safety cover">
              <span className="lid-lock">⛒</span>
              <span className="lid-label">{armed ? 'COVER OPEN — FIRE WHEN READY' : 'LIFT SAFETY COVER TO ARM'}</span>
            </button>
            <button className="btn-primary btn-initiate" onClick={() => onAnalyze(true)} disabled={!armed || loading}>
              {loading ? '▶ PROCESSING TACTICAL DATA…' : 'INITIATE TACTICAL ANALYSIS'}
            </button>
          </div>
        </section>

        {error && (
          <div className="error-banner">
            <span>⚠ SYSTEM FAULT // {error}</span>
            <button className="retry-btn" onClick={() => onAnalyze(true)} disabled={loading}>
              ↻ Retry
            </button>
          </div>
        )}

        {agentAvailable && data && !data.agent_used && !loading && (
          <div className="agent-note fast-preview">
            ⚡ FAST PREVIEW — showing real data + Prophet forecast + rule-based analysis. Press{' '}
            <b>INITIATE TACTICAL ANALYSIS</b> to run the full Claude agent reasoning.
          </div>
        )}

        <section className="chart-section card">
          {loading ? <ChartSkeleton /> : data ? <CryptoChart data={data} autoSR={autoSR} /> : <EmptyState />}
        </section>

        <section className="bottom-grid">
          <div className="card steps-card">
            <h2 className="card-title">
              <IntelIcon /> Intel Logs
            </h2>
            {loading ? (
              <StepsSkeleton />
            ) : data ? (
              <AgentSteps steps={data.agent_steps} agentUsed={data.agent_used} agentAvailable={agentAvailable} />
            ) : (
              <p className="muted">The agent's steps will appear here.</p>
            )}
          </div>
          <div className="card report-card">
            <h2 className="card-title">
              <ScopeIcon /> Risk Profile
            </h2>
            {loading ? (
              <ReportSkeleton />
            ) : data ? (
              <AgentReport data={data} agentAvailable={agentAvailable} />
            ) : (
              <p className="muted">The agent's report will appear here.</p>
            )}
          </div>
        </section>

        <section className="card chat-section">
          <Chat symbol={coin.id} agentAvailable={agentAvailable} days={days} horizon={horizon} />
        </section>

        <section className="card security-section">
          <h2 className="card-title">
            <ShieldIcon /> Operational Security
          </h2>
          <p className="security-intro">
            CryptoSight is designed to be <b>self-hosted</b> — it runs entirely on your own machine via
            Docker. It follows the hardening measures in the README so your API keys can't be drained or
            abused.
          </p>
          <ul className="security-grid">
            <li>
              <span className="sec-tick">▸</span>
              <span>
                <b>Keys stay local.</b> API keys live only in <code>backend/.env</code> (git-ignored) and
                are injected as environment variables — never sent to the browser or returned by the API.
              </span>
            </li>
            <li>
              <span className="sec-tick">▸</span>
              <span>
                <b>Hardened API.</b> Strict input validation, allow-listed coin IDs (anti-SSRF), per-client
                rate limiting and a locked-down CORS policy.
              </span>
            </li>
            <li>
              <span className="sec-tick">▸</span>
              <span>
                <b>Locked-down runtime.</b> Containers run as a non-root user, dependencies are pinned, and
                nginx adds security headers (CSP, anti-clickjacking).
              </span>
            </li>
            <li>
              <span className="sec-tick">▸</span>
              <span>
                <b>No data collection.</b> No accounts, no tracking, nothing stored. Market data from
                CoinGecko; the optional AI agent uses your own Anthropic key.
              </span>
            </li>
          </ul>
          <p className="security-foot">
            Full details in the project README · <b>Not financial advice.</b>
          </p>
        </section>

        <section className="card disclaimer-section" id="disclaimer">
          <h2 className="card-title">
            <WarnIcon /> Disclaimer
          </h2>
          <div className="disclaimer-body">
            <p>
              <b>This is not financial advice.</b> CryptoSight is an educational / demo project — nothing
              here is a recommendation to buy, sell, or hold any asset.
            </p>
            <p>
              The analysis and the chat are produced by an <b>AI language model</b> and a statistical
              forecasting model (Prophet). The AI is <b>not a licensed financial advisor</b> and is not
              trained to give financial advice — it offers <b>one possible point of view</b> to help you
              think, and it can be wrong or incomplete.
            </p>
            <p>
              This tool does <b>not</b> try to influence or persuade you to invest in cryptocurrencies.
              Crypto is highly volatile and you can lose money. Forecasts are statistical estimates,{' '}
              <b>not</b> predictions of the future.
            </p>
            <p>
              <b>Always do your own research</b> and consult a qualified professional before making any
              financial decision. <b>You alone are responsible</b> for your decisions; the author accepts
              no liability for any loss arising from the use of this tool.
            </p>
          </div>
        </section>

        <footer className="footer">
          <span>CryptoSight Agent · Data from CoinGecko · Not financial advice</span>
          <span className="crimenet-sig">CRIME.NET</span>
        </footer>
      </div>
    </>
  )
}

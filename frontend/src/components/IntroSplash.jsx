// =====================================================================
// IntroSplash — Payday 2 "masking up" breach screen (auto-play).
//
// Plays by itself: the radial ring auto-fills, the exploit logs stream,
// then the screen flashes / glitches and the armored doors split open to
// reveal the terminal. The whole thing lasts < 3s (good for retention) and
// can be skipped instantly with ESC or a click.
//
// Design notes
// ------------
// • One requestAnimationFrame loop drives the fill, reading refs so it never
//   re-subscribes; React state is only set when a value changes.
// • Every listener / rAF / timeout is registered and torn down inside the
//   same effect → memory-safe, even under React 18 StrictMode in dev.
// • Colors/fonts come from the CRIME.NET theme tokens in index.css.
// =====================================================================
import { useEffect, useRef, useState } from 'react'
import MaskLogo from './MaskLogo'
import './IntroSplash.css'

// ---- timing (ms) — total ≈ 1600 + (110+190+400) + 560 = ~2.86s ----
const FILL_MS = 1600 // ring auto-fills 0→100% in this long
const FLASH_MS = 110 // white screen flash
const GLITCH_MS = 190 // digital corruption burst
const BANNER_MS = 400 // "VAULT BREACHED" hold before the doors move
const DOORS_MS = 560 // hydraulic doors slide-apart (keep >= CSS transition)

// Live "exploit" log feed. Each line is revealed once `progress` crosses `at`.
const LOG_FEED = [
  { at: 0.02, tag: 'INFO', text: 'INITIALIZING EXPLOIT FRAMEWORK v4.2 ...' },
  { at: 0.12, tag: 'OK', text: 'SECURE LINK ESTABLISHED // COINGECKO API' },
  { at: 0.27, tag: 'WARN', text: 'FIREWALL DETECTED // INJECTING PROPHET PACKETS' },
  { at: 0.4, tag: 'INFO', text: 'DEPLOYING DRILL ON LIQUIDITY VAULT MATRICES' },
  { at: 0.54, tag: 'OK', text: 'BYPASSING TRADING ANTI-CHEAT PROTOCOLS' },
  { at: 0.66, tag: 'INFO', text: 'EXTRACTING RSI + HISTORICAL TREND CHANNELS' },
  { at: 0.8, tag: 'CRIT', text: 'ALARM BYPASSED // SECURING LOOT DATA STREAM' },
  { at: 0.92, tag: 'INFO', text: 'PREPARING CRYPTOSIGHT AGENT TERMINAL ...' },
]

const R = 104 // ring radius
const C = 2 * Math.PI * R // circumference, for stroke-dash math

export default function IntroSplash({ onComplete }) {
  // 'idle' = filling · 'breached' = flash/glitch/banner · 'opening' = doors
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState([])

  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const progressRef = useRef(0)
  const revealedRef = useRef(0)
  const doneRef = useRef(false) // guards breach/skip from running twice
  const skipRef = useRef(null) // exposed to the click / SKIP handlers

  // Lock page scroll while the intro is mounted: with no scrollbar the fixed
  // overlay centres on the FULL viewport, and nothing scrolls behind it.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let lastTs = 0
    const timers = []

    // Reveal log lines as progress passes their threshold (cumulative).
    const reveal = (p) => {
      const target = LOG_FEED.filter((l) => l.at <= p).length
      if (target > revealedRef.current) {
        revealedRef.current = target
        setLogs(LOG_FEED.slice(0, target))
      }
    }

    const finish = () => onCompleteRef.current && onCompleteRef.current()

    // Reached 100% → cinematic breach, then hand off to the app.
    const breach = () => {
      if (doneRef.current) return
      doneRef.current = true
      cancelAnimationFrame(raf)
      progressRef.current = 1
      setProgress(1)
      revealedRef.current = LOG_FEED.length
      setLogs(LOG_FEED)
      setPhase('breached') // CSS plays flash → glitch → banner
      timers.push(setTimeout(() => setPhase('opening'), FLASH_MS + GLITCH_MS + BANNER_MS))
      timers.push(setTimeout(finish, FLASH_MS + GLITCH_MS + BANNER_MS + DOORS_MS))
    }

    // ESC / click → jump straight to the door-open.
    const skip = () => {
      if (doneRef.current) return
      doneRef.current = true
      cancelAnimationFrame(raf)
      setPhase('opening')
      timers.push(setTimeout(finish, DOORS_MS))
    }
    skipRef.current = skip

    // The auto-play loop.
    const tick = (ts) => {
      if (doneRef.current) return
      if (!lastTs) lastTs = ts
      const dt = Math.min(ts - lastTs, 60) // clamp big gaps (backgrounded tab)
      lastTs = ts
      const p = Math.min(1, progressRef.current + dt / FILL_MS)
      progressRef.current = p
      setProgress(p)
      reveal(p)
      if (p >= 1) return breach()
      raf = requestAnimationFrame(tick)
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip()
    }
    window.addEventListener('keydown', onKeyDown)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const pct = Math.round(progress * 100)
  const dashoffset = C * (1 - progress)
  const status =
    progress >= 0.92
      ? 'VAULT UNLOCKED'
      : progress >= 0.6
        ? 'EXTRACTING LOOT DATA …'
        : progress >= 0.3
          ? 'BYPASSING FIREWALL …'
          : 'INITIATING BREACH …'

  return (
    <div
      className={`intro intro-${phase}`}
      role="dialog"
      aria-label="Security bypass intro"
      onClick={() => skipRef.current && skipRef.current()}
    >
      {/* armored doors — the black backdrop that splits open on breach */}
      <div className="intro-door intro-door-l" />
      <div className="intro-door intro-door-r" />

      <button
        className="intro-skip"
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          skipRef.current && skipRef.current()
        }}
      >
        [ESC] SKIP
      </button>

      <div className="intro-stage">
        <div className="intro-head">
          <div className="intro-kicker">CRIME.NET ▸ SECURITY BYPASS</div>
          <div className="intro-target">TARGET // CRYPTOSIGHT VAULT</div>
        </div>

        <div className="intro-ring-wrap">
          <svg className="intro-ring" viewBox="0 0 240 240" width="240" height="240" aria-hidden="true">
            <circle className="ring-track" cx="120" cy="120" r={R} />
            <circle
              className="ring-fill"
              cx="120"
              cy="120"
              r={R}
              strokeDasharray={C}
              strokeDashoffset={dashoffset}
              transform="rotate(-90 120 120)"
            />
          </svg>
          <div className="intro-core" style={{ '--p': progress }}>
            <MaskLogo size={84} />
            <div className="intro-pct">
              {pct}
              <span>%</span>
            </div>
          </div>
        </div>

        <div className="intro-prompt">{status}</div>

        <div className="intro-meter">
          <div className="intro-meter-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* live exploit log feed, bottom-left */}
      <div className="intro-logs">
        {logs.map((l, i) => (
          <div className={`intro-log tag-${l.tag.toLowerCase()}`} key={i}>
            <span className="log-tag">[{l.tag === 'OK' ? ' OK ' : l.tag}]</span> {l.text}
          </div>
        ))}
        <div className="intro-cursor">▋</div>
      </div>

      {/* breach FX layers */}
      <div className="intro-flash" />
      <div className="intro-banner">
        <div className="banner-main" data-text="VAULT BREACHED">
          VAULT BREACHED
        </div>
        <div className="banner-sub">// ACCESS GRANTED</div>
      </div>
    </div>
  )
}

import { useState } from 'react'

const ICONS = {
  get_price_history: '💹',
  calculate_indicators: '📊',
  run_forecast: '🔮',
}

function summarizeOutput(out) {
  if (out == null) return ''
  const s = typeof out === 'string' ? out : JSON.stringify(out)
  return s.length > 260 ? s.slice(0, 260) + '…' : s
}

function fmtInput(input) {
  if (input == null) return ''
  if (typeof input === 'string') return input
  try {
    return Object.entries(input)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  } catch {
    return String(input)
  }
}

export default function AgentSteps({ steps, agentUsed, agentAvailable }) {
  const [replay, setReplay] = useState(0)
  if (!steps || !steps.length) {
    return <p className="muted">The agent recorded no steps.</p>
  }

  return (
    <div>
      {!agentUsed && (
        <div className="agent-note">
          {agentAvailable ? (
            <>
              ⚡ Fast preview — deterministic steps. Press{' '}
              <code>INITIATE TACTICAL ANALYSIS</code> for Claude's step-by-step reasoning.
            </>
          ) : (
            <>
              Deterministic mode (no LLM). Set <code>ANTHROPIC_API_KEY</code> in{' '}
              <code>backend/.env</code> to enable the Claude agent's reasoning.
            </>
          )}
        </div>
      )}
      <button className="replay-btn" onClick={() => setReplay((r) => r + 1)} title="Replay the reasoning step by step">
        ▶ Step-by-step replay
      </button>
      <ol className="timeline" key={replay}>
        {steps.map((s, i) => (
          <li key={i} className="timeline-item" style={{ animationDelay: `${i * 0.14}s` }}>
            <div className="timeline-dot">{ICONS[s.tool] || '🛠️'}</div>
            <div className="timeline-content">
              <div className="timeline-tool">{s.tool}</div>
              {s.input != null && <div className="timeline-input">→ {fmtInput(s.input)}</div>}
              <div className="timeline-output">{summarizeOutput(s.output)}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

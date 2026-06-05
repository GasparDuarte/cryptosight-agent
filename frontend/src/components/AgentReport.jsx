import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import RiskGauge from './RiskGauge'

export default function AgentReport({ data, agentAvailable }) {
  const { symbol, analysis, generated_at, agent_used } = data
  const [copied, setCopied] = useState(false)

  function copy() {
    try {
      navigator.clipboard.writeText(analysis || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="report">
      <div className="report-badges">
        <span className="badge badge-symbol">{(symbol || '').toUpperCase()}</span>
        {generated_at && <span className="badge badge-date">{generated_at}</span>}
        {agent_used ? (
          <span className="badge badge-ai">Claude · ReAct</span>
        ) : (
          <span className="badge badge-muted">{agentAvailable ? 'fast preview' : 'deterministic'}</span>
        )}
        <button className="copy-btn" onClick={copy} title="Copy the analysis text">
          {copied ? '✓ Copied' : '⧉ Copy'}
        </button>
      </div>
      <RiskGauge data={data} />
      <div className="markdown">
        <ReactMarkdown>{analysis || 'No analysis available.'}</ReactMarkdown>
      </div>
    </div>
  )
}

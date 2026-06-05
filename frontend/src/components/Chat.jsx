import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { chat } from '../api/client'

const SUGGESTIONS = [
  'Is it a good time to buy?',
  "What's the recent trend?",
  'What is the RSI telling us?',
  'Explain the forecast for next week',
]

export default function Chat({ symbol, agentAvailable, days, horizon }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const lastRef = useRef(null)

  // Single page scroll (no inner scrollbar): when a new message arrives, bring
  // it to the top of the viewport so a long reply is read from its start.
  // Never fires on the empty initial mount.
  useEffect(() => {
    if (!messages.length) return
    lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [messages])

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await chat({ messages: next, symbol, days, horizon })
      setMessages([...next, { role: 'assistant', content: res.reply, tools: res.tools_used }])
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `⚠ ${e.message}`, error: true }])
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <span className="chat-title">▣ Secure Comm Terminal</span>
        {symbol && (
          <span className="chat-context">
            channel: <b>{symbol.toUpperCase()}</b>
          </span>
        )}
      </div>

      {!agentAvailable && (
        <div className="agent-note crit fault-panel">
          <span className="fault-tag">⚠ SYSTEM FAULT</span>
          Chat needs an Anthropic API key. Add <code>ANTHROPIC_API_KEY</code> to{' '}
          <code>backend/.env</code> and restart the backend.
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p className="muted">
              Ask anything about {symbol ? symbol.toUpperCase() : 'a coin'} — trend, levels, RSI, or
              whether it's a good entry. The assistant pulls real data to answer.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            ref={i === messages.length - 1 ? lastRef : undefined}
            className={`bubble ${m.role}${m.error ? ' error' : ''}`}
          >
            {m.role === 'assistant' && !m.error ? (
              <div className="markdown">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
            {m.tools && m.tools.length > 0 && (
              <div className="bubble-tools">🔧 {m.tools.join(' · ')}</div>
            )}
          </div>
        ))}
        {loading && (
          <div className="bubble assistant">
            <span className="typing">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </div>
        )}
      </div>

      {messages.length === 0 && agentAvailable && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input">
        <textarea
          rows={1}
          placeholder={agentAvailable ? 'Type your question…' : 'Add your API key to chat'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!agentAvailable || loading}
        />
        <button
          className="btn-primary"
          onClick={() => send()}
          disabled={!agentAvailable || loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

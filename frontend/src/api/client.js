// Backend HTTP client.
// In dev we use relative paths (/api/...) and Vite proxies them to :8000.
// To point at a different backend, set VITE_API_BASE in a frontend .env file.
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      /* non-JSON response */
    }
    throw new Error(detail || `HTTP error ${res.status}`)
  }
  return res.json()
}

export async function fetchConfig() {
  return handle(await fetch(`${API_BASE}/api/config`))
}

export async function fetchPrices(symbol, days) {
  return handle(await fetch(`${API_BASE}/api/prices?symbol=${encodeURIComponent(symbol)}&days=${days}`))
}

export async function searchCoins(query) {
  const res = await fetch(`${API_BASE}/api/search?query=${encodeURIComponent(query)}`)
  const data = await handle(res)
  return data.results || []
}

export async function analyze({ symbol, days, horizon, confidence, useAgent = true }) {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, days, horizon, confidence, use_agent: useAgent }),
  })
  return handle(res)
}

export async function chat({ messages, symbol, days, horizon }) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, symbol, days, horizon }),
  })
  return handle(res)
}

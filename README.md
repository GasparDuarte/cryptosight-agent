# 🔮 CryptoSight Agent

An AI-powered **crypto forecasting** app that combines real market data, time-series
modeling, technical indicators, and a **LangChain (ReAct) agent** powered by Claude —
all in a dark, fintech-style React dashboard with a built-in **chat assistant**.

Given a coin, the agent **reasons step by step**: it fetches the price history,
computes indicators, generates a forecast, and writes a natural-language analysis
with concrete numbers and dates. You can also **chat** with it to ask follow-ups
("is it a good time to buy?", "what's the RSI saying?").

---

## ✨ Features

- 📥 **Real data** from the free public **CoinGecko** API (optional API key for higher limits).
- 🔎 **Search any coin** — not just a fixed list; type to find any CoinGecko coin.
- 📈 **Forecasting** of the next N days with **Prophet** (with a confidence band).
- 📊 **Technical indicators**: Wilder's RSI(14), 7-day (MA7) and 30-day (MA30) moving averages.
- 🧠 **LangChain agent (ReAct pattern)** with 3 tools that reasons over the data and
  writes the final analysis. The **intermediate steps** are shown as a timeline.
- 💬 **Chat assistant** — ask free-form questions; the agent uses the same tools to
  answer with real data (trend, levels, entries, forecasts).
- 💻 **React + Recharts** frontend: a composed chart (price, forecast, band, MAs) plus an
  RSI panel, the step-by-step reasoning, and the Markdown report.
- 🛟 **Deterministic mode**: without an Anthropic API key, the backend still returns data,
  indicators, a forecast, and a rule-based analysis (no LLM). The dashboard is never empty.
- ⚡ **Instant first paint**: on open, the dashboard loads in **fast mode** (real data +
  Prophet + rule-based analysis) so it's never slow to start. The **full Claude agent** runs
  on demand when you press **Initiate Tactical Analysis** — so your API spend stays intentional
  (no LLM call on every page load / refresh).

---

## 🖼️ Screenshots

> _Placeholders — replace with real screenshots once you run it._

| Dashboard | Agent reasoning + chat |
| --- | --- |
| `docs/screenshot-dashboard.png` | `docs/screenshot-chat.png` |

---

## 🧱 Stack

| Layer | Tech |
| --- | --- |
| **Backend** | Python · FastAPI · Uvicorn · LangChain 1.x · langchain-anthropic (Claude) · Prophet · pandas · numpy · requests |
| **Frontend** | React 18 · Vite · Recharts · react-markdown |
| **Data** | CoinGecko API (free; optional key) |
| **LLM** | Claude (`claude-haiku-4-5` by default — cheapest; configurable) |

---

## 📁 Structure

```
cryptosight-agent/
├── backend/
│   ├── main.py              # FastAPI app + CORS + endpoints
│   ├── agent.py             # ReAct agent (create_agent) + chat + deterministic fallback
│   ├── tools/
│   │   ├── coingecko.py     # Tool: price history + coin search (+ API key support)
│   │   ├── forecasting.py   # Tool: Prophet forecast
│   │   └── indicators.py    # Tool: Wilder RSI(14), MA7, MA30
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env                 # ANTHROPIC_API_KEY, ANTHROPIC_MODEL, COINGECKO_API_KEY
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── CryptoChart.jsx
│   │   │   ├── AgentSteps.jsx
│   │   │   ├── AgentReport.jsx
│   │   │   └── Chat.jsx
│   │   └── api/client.js
│   ├── index.html
│   ├── vite.config.js       # proxy /api -> :8000 (dev)
│   ├── Dockerfile           # Vite build + nginx
│   ├── nginx.conf           # serves the SPA and proxies /api
│   └── package.json
├── docker-compose.yml       # runs backend + frontend together
├── demo.html                # serverless preview (double-click)
└── README.md
```

---

## 🐳 Run with Docker (recommended)

The simplest path: brings up backend + frontend with **one command**, no need to install
Python/Node or worry about the Prophet version (it uses Python 3.11 inside).

> Requirement: **Docker Desktop** installed and **running**.

```powershell
cd cryptosight-agent

# (Optional) add your keys:
notepad backend\.env        # ANTHROPIC_API_KEY=sk-ant-...   COINGECKO_API_KEY=...

# Build + start (first run takes a few minutes: downloads Prophet, etc.)
docker compose up --build
```

Then open:
- 🖥️ **Frontend**: <http://localhost:5173>
- 📚 **API + docs**: <http://localhost:8000/docs>

Stop with `Ctrl + C`, then `docker compose down`. Rebuild after code changes with
`docker compose up -d --build`.

> 💡 Without `ANTHROPIC_API_KEY`, everything still works in **deterministic mode** (data +
> indicators + forecast + rule-based analysis). The chat needs the key. nginx already
> proxies `/api` to the backend, so there's no CORS to configure.

---

## 🚀 Run manually (without Docker)

> Requirements: **Python 3.11 or 3.12** (recommended — see the Prophet note) and **Node 18+**.

**Backend** (port 8000):

```powershell
cd cryptosight-agent\backend
py -3.12 -m venv venv
.\venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env        # edit your keys
.\venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

**Frontend** (port 5173, separate terminal):

```powershell
cd cryptosight-agent\frontend
npm install
npm run dev
```

---

## 🔧 Environment variables (`backend/.env`)

| Variable | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | _(placeholder)_ | Required for the AI agent + chat. Without it → deterministic mode. |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Cheapest model. Also: `claude-sonnet-4-5`, `claude-opus-4-5`. |
| `COINGECKO_API_KEY` | _(empty)_ | Optional. A free Demo key raises rate limits. |
| `COINGECKO_PLAN` | `demo` | `demo` (free key) or `pro` (paid key). |

---

## 🔌 API

### `GET /api/config`
`{ "agent_available": true, "model": "claude-haiku-4-5" }`

### `GET /api/search?query=pepe`
`{ "results": [ { "id": "pepe", "name": "Pepe", "symbol": "PEPE", "rank": 35 } ] }`

### `GET /api/prices?symbol=bitcoin&days=30`
`{ "symbol": "bitcoin", "days": 30, "prices": [ { "date": "...", "price": 0 } ] }`

### `POST /api/analyze`  body `{ "symbol": "bitcoin", "days": 30, "horizon": 7, "use_agent": true }`
Returns `historical`, `forecast`, `indicators`, `agent_steps`, `analysis`, `agent_used`.
The `indicators` arrays are **index-aligned** with `historical` (`null` where an
indicator doesn't apply yet, e.g. MA30 in the first 29 days).
`use_agent: false` forces the **fast deterministic path** (no LLM call) even when a key is
configured — the frontend uses it for the instant initial dashboard, then runs the full
Claude agent on demand.

### `POST /api/chat`  body `{ "messages": [{ "role": "user", "content": "..." }], "symbol": "bitcoin" }`
`{ "reply": "...Markdown...", "tools_used": ["get_price_history", "run_forecast"] }`
Requires an Anthropic API key (returns 400 otherwise).

---

## 🧠 How the agent works (ReAct pattern)

**ReAct** = *Reasoning + Acting*. Instead of answering in one shot, the LLM alternates
between **reasoning** (what do I still need to know?), **acting** (call a tool) and
**observing** (read the result), looping until it can conclude:

```
Thought → Action (tool) → Observation → Thought → ... → Final answer
```

The agent has 3 tools:

1. `get_price_history(symbol)` — download prices from CoinGecko.
2. `calculate_indicators(symbol)` — compute RSI(14), MA7 and MA30.
3. `run_forecast(symbol, horizon)` — predict with Prophet.

We capture the tool calls + their results and return them as `agent_steps` to draw the
timeline on the frontend.

### Implementation note
Passing hundreds of prices *through* the LLM (as text) would be brittle and costly. So
the tools the agent sees take small args (`symbol`, `horizon`) and share a **per-request
store**: the price tool downloads and caches the series; the indicator/forecast tools read
it from there. Each tool returns a **short summary** to Claude (so it reasons well), while
the **full arrays** stay in the store for the endpoint to feed the chart. The "pure"
functions matching the brief's signatures (`run_forecast(prices, horizon)`,
`calculate_indicators(prices)`) live in `tools/` and run underneath.

> Built on **LangChain 1.x**: uses `create_agent` (langgraph). The legacy
> `AgentExecutor` / `create_tool_calling_agent` API was removed in 1.0.

---

## ⚠️ Notes & troubleshooting

- **Prophet + new Python**: Prophet (via `cmdstanpy`) ships binary wheels that lag behind
  brand-new Python releases (e.g. 3.14). If `pip install prophet` tries to compile and fails,
  create the venv with **Python 3.11/3.12** (`py -3.11 -m venv venv`). Docker avoids this entirely.
- **CoinGecko rate limit (429)**: the free API limits calls per minute. Add a `COINGECKO_API_KEY`
  for higher limits, or wait ~1 minute.
- **Containers stopped?** If Docker Desktop closes or the machine sleeps, the containers exit
  cleanly (`Exited (0)`). Bring them back with `docker compose up -d` (no `--build` needed).
- **`days=7`**: with so few days, MA30 and RSI(14) may be mostly `null` (not enough data for
  the window). Use 30 or 90 days to see them fully.

---

## 🛣️ Future ideas

- 🔁 **Stream** the agent's steps (SSE/WebSocket) to watch the reasoning live.
- 🗄️ **Cache** CoinGecko responses (Redis or in-memory TTL) to avoid rate limits.
- 📐 More indicators: MACD, Bollinger Bands, volume, EMA.
- 🧪 **Backtesting**: measure forecast error (MAPE/RMSE) against real data.
- 🤖 Compare models: Prophet vs ARIMA vs LSTM, and let the agent choose.
- 💱 Multi-coin comparisons and correlations.
- 🔔 Alerts (RSI overbought/oversold, MA crossovers) with notifications.
- 🧰 Tests (pytest for tools, Vitest/RTL for components) and CI.

---

## 🔒 Security

CryptoSight is built to be **self-hosted** — it runs entirely on your own machine (or your own
server) via Docker, and is designed so your API keys can't be leaked or drained.

**Secrets**
- API keys live only in `backend/.env`, which is **git-ignored** (`.env.example` is the template that
  ships). They're injected as environment variables and are **never** sent to the browser or returned
  by any API response — `/api/config` reports *availability*, never the key.
- Use the free **CoinGecko Demo** key (rate-limit only, no billing). Keep your **Anthropic key**
  private — it's billed per use. Rotate either key anytime from its provider dashboard.

**Hardened API**
- Strict input validation (Pydantic) on every endpoint: allow-listed coin IDs (anti-SSRF /
  path-injection), bounded numbers, capped chat payloads.
- Per-client **rate limiting** (sliding window) on the data / LLM endpoints to protect your quota.
- **Restricted CORS** (local frontend only) and generic `5xx` errors so internals aren't leaked.
- Outbound calls to CoinGecko use HTTPS with timeouts.

**Hardened runtime**
- Both containers run as a **non-root** user; the frontend uses `nginx-unprivileged`.
- **Pinned dependencies** (`requirements.txt` + `package-lock.json`) for reproducible builds.
- nginx sends security headers: **CSP**, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`.

**If you expose it publicly** (beyond `localhost`): add **HTTPS/TLS** in front, consider
**authentication** (so nobody can spend your Anthropic key), and run it behind a reverse proxy that
sets a trusted `X-Real-IP` for the rate limiter.

> No accounts, no tracking, no user data stored.

---

## ⚖️ Disclaimer

CryptoSight Agent is an **educational / demo** project. Prophet's forecasts and the agent's
analysis are **not financial advice**. Don't make investment decisions based on this tool.

---

## 📄 License

[MIT](LICENSE) — free to use, modify and share. Built by **Gaspar Duarte** as a portfolio project.

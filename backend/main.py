"""CryptoSight Agent — FastAPI API.

Endpoints:
    GET  /api/health
    GET  /api/config
    GET  /api/prices?symbol=bitcoin&days=30
    GET  /api/search?query=bitcoin
    POST /api/analyze   body: {"symbol": "bitcoin", "days": 30, "horizon": 7, "confidence": 0.8}
    POST /api/chat      body: {"messages": [...], "symbol": "bitcoin"}

Security hardening: strict input validation (allowlisted coin ids, bounded
numbers, capped chat payloads), per-client rate limiting, restricted CORS, and
generic 500s so internal errors aren't leaked to clients.
"""

import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()  # load backend/.env BEFORE importing the agent

from fastapi import FastAPI, HTTPException, Query, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agent import MODEL, agent_available, run_analysis, run_chat  # noqa: E402
from tools.coingecko import CoinGeckoError, get_price_history, search_coins  # noqa: E402

logger = logging.getLogger("cryptosight")

SYMBOL_PATTERN = r"^[a-z0-9][a-z0-9-]{0,79}$"

app = FastAPI(title="CryptoSight Agent API", version="2.1.0")

# CORS: only the local Vite frontend may call the API from a browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


# --------------------------------------------------------------------------- #
# Rate limiting (in-memory sliding window, per client IP + path)
# --------------------------------------------------------------------------- #
_RATE_HITS: dict = defaultdict(deque)
# path prefix -> (max requests, window seconds). LLM/data endpoints are stricter
# because they cost money / external quota.
_RATE_RULES = {
    "/api/analyze": (20, 60),
    "/api/chat": (20, 60),
    "/api/search": (40, 60),
}
_DEFAULT_RATE = (120, 60)


def _client_ip(request: Request) -> str:
    # nginx sets X-Real-IP; fall back to the socket peer.
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/"):
        limit, window = next(
            (rule for prefix, rule in _RATE_RULES.items() if path.startswith(prefix)),
            _DEFAULT_RATE,
        )
        key = f"{_client_ip(request)}:{path}"
        now = time.time()
        hits = _RATE_HITS[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Slow down and retry shortly."},
            )
        hits.append(now)
    return await call_next(request)


# --------------------------------------------------------------------------- #
# Request models (validation = first line of defense)
# --------------------------------------------------------------------------- #
class AnalyzeRequest(BaseModel):
    symbol: str = Field(default="bitcoin", pattern=SYMBOL_PATTERN, description="CoinGecko id")
    days: int = Field(default=30, ge=2, le=365, description="days of history")
    horizon: int = Field(default=7, ge=1, le=60, description="days to forecast")
    confidence: float = Field(default=0.8, ge=0.5, le=0.99, description="forecast band width")
    use_agent: bool = Field(default=True, description="run the Claude agent; False = fast deterministic only")


class ChatMessage(BaseModel):
    role: str = Field(pattern=r"^(user|assistant|system)$")
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=40)
    symbol: str | None = Field(default=None, pattern=SYMBOL_PATTERN)
    days: int = Field(default=30, ge=2, le=365)
    horizon: int = Field(default=7, ge=1, le=60)


def _ms_to_date(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    """Frontend bootstrap info (never exposes the API keys themselves)."""
    return {"agent_available": agent_available(), "model": MODEL}


@app.get("/api/prices")
def prices(
    symbol: str = Query("bitcoin", pattern=SYMBOL_PATTERN),
    days: int = Query(30, ge=2, le=365),
):
    """Daily historical USD prices for a coin."""
    try:
        data = get_price_history(symbol, days)
    except CoinGeckoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    series = [{"date": _ms_to_date(ts), "price": round(float(p), 4)} for ts, p in data["prices"]]
    return {"symbol": symbol, "days": days, "prices": series}


@app.get("/api/search")
def search(query: str = Query(..., min_length=1, max_length=64)):
    """Search CoinGecko for coins matching `query`."""
    try:
        return {"results": search_coins(query)}
    except CoinGeckoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    """Full pipeline: prices + indicators + forecast + agent analysis."""
    try:
        return run_analysis(req.symbol, req.days, req.horizon, req.confidence, use_agent=req.use_agent)
    except CoinGeckoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Analyze failed")
        raise HTTPException(status_code=500, detail="Internal analysis error.") from exc


@app.post("/api/chat")
def chat(req: ChatRequest):
    """Free-form Q&A with the agent (requires an Anthropic API key)."""
    if not agent_available():
        raise HTTPException(
            status_code=400,
            detail="Chat requires an Anthropic API key. Add ANTHROPIC_API_KEY to backend/.env and restart the backend.",
        )
    try:
        messages = [m.model_dump() for m in req.messages]
        return run_chat(messages, symbol=req.symbol, days=req.days, horizon=req.horizon)
    except CoinGeckoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Chat failed")
        raise HTTPException(status_code=500, detail="Internal chat error.") from exc

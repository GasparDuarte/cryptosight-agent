"""CryptoSight agent (ReAct pattern via Claude tool-calling, LangChain 1.x).

The agent reasons in a *Reason -> Act -> Observe* loop: it decides which tool to
call, observes the result and decides again, until it produces a final answer.
It uses the 3 tools (prices, indicators, forecast) and we capture the intermediate
steps to show them on the frontend.

Two entry points:
- `run_analysis(symbol, days, horizon)` -> structured data + written analysis for
  the dashboard (falls back to a deterministic, rule-based analysis with no LLM).
- `run_chat(messages, symbol)` -> free-form Q&A with the same tools (LLM required).

Design note
-----------
Passing hundreds of prices "through" the LLM (as text) would be brittle and costly.
Instead, the tools the agent sees take small args (symbol/horizon) and share a
per-request *store*: the price tool downloads and caches the series, and the
indicator/forecast tools read it from there. Each tool returns a **short summary**
to the LLM (so it reasons well), while the full arrays stay in the store for the
endpoint to feed the chart. The "pure" functions matching the brief's signatures
live in `tools/` and are what runs underneath.
"""

import os
from datetime import datetime, timezone

from tools.coingecko import get_price_history
from tools.indicators import calculate_indicators
from tools.forecasting import run_forecast

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5")

SYSTEM_PROMPT = """You are a crypto market analyst. You have tools to fetch \
historical prices, compute technical indicators, and generate forecasts.

When the user asks for an analysis of a coin:
1. Fetch the price history.
2. Compute the technical indicators.
3. Generate the forecast.
4. Write an analysis covering: recent trend, key levels, what the RSI says, and \
what the model predicts for the next days.

Be specific with numbers and dates. Answer in English, in Markdown, with short \
sections. Always note that this is not financial advice."""

CHAT_SYSTEM_PROMPT = """You are CryptoSight, a sharp and friendly crypto market \
assistant. You have tools to fetch real historical prices (CoinGecko), compute \
technical indicators (RSI, moving averages), and run a Prophet price forecast.

Guidelines:
- When the user asks about a coin's trend, price levels, whether to buy/sell, or a \
forecast, USE the tools to pull real numbers before answering — never invent data.
- Be concrete: cite actual prices, percentages, RSI values and dates.
- Give a balanced view (both bullish and bearish factors). You may lean a \
direction, but explain the reasoning and the risks.
- Keep replies concise and use Markdown.
- Always remind the user this is not financial advice and that crypto is highly \
volatile.
- Reply in the same language the user writes in (default to English)."""


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #
def agent_available() -> bool:
    """True if a real Anthropic API key is configured (not the placeholder)."""
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not key or key == "tu_key_aqui":
        return False
    if key.lower().startswith("your_"):
        return False
    return True


# --------------------------------------------------------------------------- #
# Summary helpers (shared by the tools and the deterministic mode)
# --------------------------------------------------------------------------- #
def _last_non_null(values):
    for v in reversed(values or []):
        if v is not None:
            return v
    return None


def _interpret_rsi(value: float) -> str:
    if value >= 70:
        return "overbought"
    if value <= 30:
        return "oversold"
    return "neutral"


def _summary_prices(symbol: str, prices: list, days: int) -> str:
    first, last = prices[0][1], prices[-1][1]
    change = (last - first) / first * 100 if first else 0.0
    low = min(p for _, p in prices)
    high = max(p for _, p in prices)
    return (
        f"{len(prices)} daily points for {symbol}. Current price ${last:,.2f}. "
        f"Change {change:+.2f}% over {days}d. Range ${low:,.2f}-${high:,.2f}."
    )


def _summary_indicators(indicators: dict) -> str:
    rsi = _last_non_null(indicators.get("rsi"))
    ma7 = _last_non_null(indicators.get("ma7"))
    ma30 = _last_non_null(indicators.get("ma30"))
    parts = []
    parts.append(
        f"RSI(14)={rsi:.1f} ({_interpret_rsi(rsi)})" if rsi is not None
        else "RSI(14)=n/a (not enough data)"
    )
    if ma7 is not None:
        parts.append(f"MA7=${ma7:,.2f}")
    if ma30 is not None:
        parts.append(f"MA30=${ma30:,.2f}")
    if ma7 is not None and ma30 is not None:
        parts.append("MA7>MA30: bullish bias" if ma7 > ma30 else "MA7<MA30: bearish bias")
    return " · ".join(parts)


def _summary_forecast(forecast: dict, last_price: float) -> str:
    yhat = forecast.get("yhat") or []
    if not yhat:
        return "No forecast."
    end = yhat[-1]
    change = (end - last_price) / last_price * 100 if last_price else 0.0
    return (
        f"Forecast {len(yhat)}d ahead: ${end:,.2f} ({change:+.2f}%). "
        f"Final band ${forecast['yhat_lower'][-1]:,.2f}-${forecast['yhat_upper'][-1]:,.2f}."
    )


# --------------------------------------------------------------------------- #
# Agent tools (close over a per-request `store`)
# --------------------------------------------------------------------------- #
def _build_tools(store: dict):
    from langchain_core.tools import tool

    @tool("get_price_history")
    def get_price_history_tool(symbol: str) -> str:
        """Fetch a coin's daily USD price history from CoinGecko.
        `symbol` is the CoinGecko id (e.g. 'bitcoin', 'ethereum', 'solana', 'cardano').
        ALWAYS call this tool first."""
        days = store.get("days", 30)
        data = get_price_history(symbol, days)
        store["symbol"] = symbol
        store["prices"] = data["prices"]
        return _summary_prices(symbol, data["prices"], days)

    @tool("calculate_indicators")
    def calculate_indicators_tool(symbol: str) -> str:
        """Compute the technical indicators (14-period RSI, MA7 and MA30) over the
        already-downloaded history. Call this after get_price_history."""
        prices = store.get("prices")
        if not prices:
            data = get_price_history(symbol, store.get("days", 30))
            store["symbol"], store["prices"] = symbol, data["prices"]
            prices = data["prices"]
        indicators = calculate_indicators(prices)
        store["indicators"] = indicators
        return _summary_indicators(indicators)

    @tool("run_forecast")
    def run_forecast_tool(symbol: str, horizon: int = 7) -> str:
        """Generate a price forecast for the next `horizon` days with Prophet.
        Call this after get_price_history."""
        prices = store.get("prices")
        if not prices:
            data = get_price_history(symbol, store.get("days", 30))
            store["symbol"], store["prices"] = symbol, data["prices"]
            prices = data["prices"]
        steps = horizon or store.get("horizon", 7)
        forecast = run_forecast(prices, steps, interval_width=store.get("confidence", 0.8))
        store["forecast"] = forecast
        return _summary_forecast(forecast, prices[-1][1])

    return [get_price_history_tool, calculate_indicators_tool, run_forecast_tool]


# --------------------------------------------------------------------------- #
# Message parsing (LangChain 1.x / langgraph)
# --------------------------------------------------------------------------- #
def _content_to_text(content) -> str:
    """Extract the text from an AIMessage.content (str or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return str(content)


def _extract_steps_and_output(messages):
    """From langgraph's message list, derive (agent_steps, final answer).

    ReAct pattern: each `tool_call` on an AIMessage is an **Action**; the ToolMessage
    with the same `tool_call_id` is the **Observation**. The final answer is the text
    of the last AIMessage (the one that no longer calls tools).
    """
    tool_outputs = {}
    for m in messages:
        if getattr(m, "type", None) == "tool":
            tool_outputs[getattr(m, "tool_call_id", None)] = _content_to_text(m.content)

    steps, final = [], ""
    for m in messages:
        for tc in getattr(m, "tool_calls", None) or []:
            steps.append(
                {
                    "tool": tc.get("name", "unknown"),
                    "input": tc.get("args", {}),
                    "output": tool_outputs.get(tc.get("id"), ""),
                }
            )
        if getattr(m, "type", None) == "ai":
            text = _content_to_text(m.content)
            if text.strip():
                final = text
    return steps, final


def _make_agent(store: dict, system_prompt: str, temperature: float = 0.2, max_tokens: int = 2000):
    """Build a LangChain 1.x agent (langgraph) with our tools."""
    from langchain.agents import create_agent
    from langchain_anthropic import ChatAnthropic

    tools = _build_tools(store)
    llm = ChatAnthropic(model=MODEL, temperature=temperature, max_tokens=max_tokens)
    return create_agent(llm, tools, system_prompt=system_prompt)


def _run_agent(symbol: str, days: int, horizon: int, store: dict):
    """Run the analysis agent and return (agent_steps, analysis)."""
    agent = _make_agent(store, SYSTEM_PROMPT, temperature=0.2, max_tokens=2000)
    user_input = (
        f"Analyze the cryptocurrency '{symbol}'. Use {days} days of history and produce "
        f"a forecast for the next {horizon} days. First fetch the prices, then compute the "
        f"indicators and generate the forecast, and only then write the analysis."
    )
    result = agent.invoke(
        {"messages": [{"role": "user", "content": user_input}]},
        config={"recursion_limit": 12},
    )
    return _extract_steps_and_output(result.get("messages", []))


# --------------------------------------------------------------------------- #
# Chat (free-form Q&A) — LLM required
# --------------------------------------------------------------------------- #
def _normalize_role(role: str) -> str:
    role = (role or "").lower()
    if role in ("assistant", "ai"):
        return "assistant"
    return "user"


def run_chat(messages: list, symbol: str | None = None, days: int = 30, horizon: int = 7) -> dict:
    """Free-form chat with tool access. Returns {"reply": str, "tools_used": [...]}.

    `messages` is the conversation so far: [{"role": "user"|"assistant", "content": str}].
    Assumes a valid API key (callers should check `agent_available()` first).
    """
    store = {"days": days, "horizon": horizon}
    system = CHAT_SYSTEM_PROMPT
    if symbol:
        system += (
            f"\n\nThe user is currently viewing the coin '{symbol}'. If they don't "
            f"name a coin, assume they mean this one."
        )

    agent = _make_agent(store, system, temperature=0.3, max_tokens=1500)
    lc_messages = [
        {"role": _normalize_role(m.get("role")), "content": m.get("content", "")}
        for m in messages
        if m.get("content")
    ]
    if not lc_messages:
        return {"reply": "Ask me anything about a coin — trend, levels, RSI, or forecast.", "tools_used": []}

    result = agent.invoke({"messages": lc_messages}, config={"recursion_limit": 12})
    steps, reply = _extract_steps_and_output(result.get("messages", []))
    return {"reply": reply, "tools_used": [s["tool"] for s in steps]}


# --------------------------------------------------------------------------- #
# Deterministic mode (no LLM): fallback if no API key or the agent fails
# --------------------------------------------------------------------------- #
def _fallback_steps(symbol, days, horizon, prices, indicators, forecast) -> list:
    last = prices[-1][1]
    return [
        {"tool": "get_price_history", "input": {"symbol": symbol, "days": days},
         "output": _summary_prices(symbol, prices, days)},
        {"tool": "calculate_indicators", "input": {"symbol": symbol},
         "output": _summary_indicators(indicators)},
        {"tool": "run_forecast", "input": {"symbol": symbol, "horizon": horizon},
         "output": _summary_forecast(forecast, last)},
    ]


def _fallback_analysis(symbol, prices, indicators, forecast, days, horizon, note=False) -> str:
    first, last = prices[0][1], prices[-1][1]
    change = (last - first) / first * 100 if first else 0.0
    low = min(p for _, p in prices)
    high = max(p for _, p in prices)
    rsi = _last_non_null(indicators.get("rsi"))
    ma7 = _last_non_null(indicators.get("ma7"))
    ma30 = _last_non_null(indicators.get("ma30"))
    end = forecast["yhat"][-1] if forecast.get("yhat") else last
    fchange = (end - last) / last * 100 if last else 0.0

    trend = "uptrend" if change > 1 else "downtrend" if change < -1 else "sideways"
    lines = [
        f"## {symbol.capitalize()} analysis",
        f"**Recent trend ({days}d):** {trend} ({change:+.2f}%). "
        f"Current price **${last:,.2f}** (from ${first:,.2f}).",
        f"**Key levels:** support ~**${low:,.2f}** · resistance ~**${high:,.2f}**.",
    ]
    if rsi is not None:
        nuance = (
            "Overbought zone: watch for a pullback." if rsi >= 70
            else "Oversold zone: a bounce is possible." if rsi <= 30
            else "No extreme conditions."
        )
        lines.append(f"**RSI(14):** {rsi:.1f} → {_interpret_rsi(rsi)}. {nuance}")
    else:
        lines.append("**RSI(14):** not enough data for 14 periods (try more days).")
    if ma7 is not None and ma30 is not None:
        cross = (
            "MA7 above MA30 (short-term bullish signal)" if ma7 > ma30
            else "MA7 below MA30 (short-term bearish signal)"
        )
        lines.append(f"**Moving averages:** MA7 ${ma7:,.2f} vs MA30 ${ma30:,.2f} — {cross}.")
    direction = "up" if fchange > 0.5 else "down" if fchange < -0.5 else "flat"
    if forecast.get("yhat"):
        lines.append(
            f"**Forecast ({horizon}d, Prophet):** projected price **${end:,.2f}** "
            f"({fchange:+.2f}%), trending {direction}. Confidence band "
            f"${forecast['yhat_lower'][-1]:,.2f}–${forecast['yhat_upper'][-1]:,.2f}."
        )
    lines.append("\n_This is not financial advice._")
    if note:
        lines.insert(
            1,
            "> ⚙️ Generated in deterministic mode (no LLM). Set `ANTHROPIC_API_KEY` "
            "in backend/.env for the Claude agent's reasoning.\n",
        )
    return "\n\n".join(lines)


# --------------------------------------------------------------------------- #
# Main orchestrator used by the /api/analyze endpoint
# --------------------------------------------------------------------------- #
def _ms_to_date(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def run_analysis(symbol: str, days: int, horizon: int, confidence: float = 0.8, use_agent: bool = True) -> dict:
    """Run the full pipeline and build the /api/analyze response.

    `use_agent=False` forces the fast deterministic path (no LLM call) even when an
    API key is configured. The frontend uses this for the instant initial dashboard
    so it doesn't spend Anthropic quota on every page load; the full Claude agent
    then runs on demand when the user presses "Initiate".
    """
    store: dict = {"days": days, "horizon": horizon, "confidence": confidence}
    key_present = agent_available()
    run_llm = use_agent and key_present

    agent_steps = None
    analysis = None
    if run_llm:
        try:
            agent_steps, analysis = _run_agent(symbol, days, horizon, store)
        except Exception as exc:  # noqa: BLE001 - degrade to deterministic mode
            store["agent_error"] = str(exc)
            agent_steps, analysis = None, None

    # Guarantee structured data even if the agent didn't run / failed.
    # (If CoinGecko fails here, the CoinGeckoError bubbles up -> endpoint returns 502.)
    prices = store.get("prices") or get_price_history(symbol, days)["prices"]
    indicators = store.get("indicators") or calculate_indicators(prices)
    forecast = store.get("forecast") or run_forecast(prices, horizon, interval_width=confidence)

    agent_ok = run_llm and store.get("agent_error") is None and analysis
    if not agent_ok:
        agent_steps = _fallback_steps(symbol, days, horizon, prices, indicators, forecast)
        # Only nag about the missing key when there genuinely isn't one — not when
        # the caller deliberately asked for the fast path.
        analysis = _fallback_analysis(
            symbol, prices, indicators, forecast, days, horizon, note=not key_present
        )

    historical = [{"date": _ms_to_date(ts), "price": round(float(p), 4)} for ts, p in prices]

    return {
        "symbol": symbol,
        "days": days,
        "horizon": horizon,
        "confidence": confidence,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "agent_used": bool(agent_ok),
        "historical": historical,
        "forecast": forecast,
        "indicators": indicators,
        "agent_steps": agent_steps,
        "analysis": analysis,
    }

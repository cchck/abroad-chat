import logging

from duckduckgo_search import DDGS

logger = logging.getLogger(__name__)


async def web_search(query: str, max_results: int = 3) -> str:
    """Search the web and return a concise text block for LLM context injection."""
    try:
        results = DDGS().text(query, max_results=max_results)
        if not results:
            return ""
        lines = []
        for r in results:
            lines.append(f"- {r.get('title', '')}: {r.get('body', '')}")
        return "\n".join(lines)
    except Exception:
        logger.exception("web search failed: query=%s", query)
        return ""

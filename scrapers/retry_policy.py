"""Bounded HTTP retry policy used by the official-source scraper."""

from __future__ import annotations

from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def configure_retry_session(session: Session, attempts: int = 3, backoff_factor: float = 0.5) -> Session:
    """Retry transient GET failures with a bounded backoff and Retry-After support."""
    retries = max(0, min(5, int(attempts)))
    retry = Retry(
        total=retries,
        connect=retries,
        read=retries,
        status=retries,
        backoff_factor=max(0.0, float(backoff_factor)),
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

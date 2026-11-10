"""Configuration et helpers de journalisation (stdout, compatible Docker)."""

from __future__ import annotations

import logging
import sys
import time
from contextlib import contextmanager

_CONFIGURED = False


class _SkipHealthAccessLogFilter(logging.Filter):
    """Évite le spam uvicorn sur GET /health (sondes Docker, orchestrateurs)."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "/health" not in record.getMessage()


def setup_logging(level: str = "INFO") -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    numeric = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
        force=True,
    )
    access = logging.getLogger("uvicorn.access")
    access.setLevel(logging.INFO)
    access.addFilter(_SkipHealthAccessLogFilter())
    _CONFIGURED = True


def get_logger(component: str) -> logging.Logger:
    return logging.getLogger(f"crm_scraper.{component}")


@contextmanager
def log_step(logger: logging.Logger, label: str):
    """Journalise le début et la fin d'une étape avec sa durée."""
    t0 = time.perf_counter()
    logger.info("%s — démarrage", label)
    try:
        yield
    except Exception:
        elapsed = int((time.perf_counter() - t0) * 1000)
        logger.exception("%s — échec après %d ms", label, elapsed)
        raise
    else:
        elapsed = int((time.perf_counter() - t0) * 1000)
        logger.info("%s — terminé (%d ms)", label, elapsed)

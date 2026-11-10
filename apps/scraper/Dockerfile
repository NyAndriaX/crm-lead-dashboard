# Scraper Google Maps — FastAPI + Playwright (Chromium) + skill IA crm-lead-analysis.
# Contexte de build : racine du monorepo (`docker compose -f deploy/docker-compose.yml build`).
FROM mcr.microsoft.com/playwright/python:v1.60.0-noble

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HEADLESS=true \
    CLAUDE_SKILLS_ROOT=/app

COPY apps/scraper/requirements-prod.txt .
RUN pip install --upgrade pip && pip install -r requirements-prod.txt

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/scraper/app/ ./app/
COPY apps/scraper/fixtures/ ./fixtures/
COPY .claude/skills/crm-lead-analysis/ ./.claude/skills/crm-lead-analysis/

RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

# CLI Claude Code (installeur natif, sans Node) — exécute le skill crm-lead-analysis
# quand le fournisseur Claude Skills est actif (jeton fourni avec chaque mission). Les autres
# fournisseurs passent par l'API Chat Completions (httpx), sans CLI.
RUN curl -fsSL https://claude.ai/install.sh | bash -s 2.1.78
ENV PATH="/home/appuser/.local/bin:${PATH}"

EXPOSE 8000

HEALTHCHECK --interval=60s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -f -s -o /dev/null http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

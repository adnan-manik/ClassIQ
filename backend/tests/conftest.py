"""Test bootstrap.

The app reads its settings at import time, so the env is pinned here BEFORE
anything under `app` is imported. The DATABASE_URL points at a closed port:
SQLAlchemy creates the engine lazily and nothing in the unit suite ever opens
a connection. DB-backed tests (tests/rls) skip unless TEST_DATABASE_URL is set.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:9")  # closed port → JWKS fetch fails fast
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-test-secret-test-secret-1234")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://test:test@127.0.0.1:1/test"
)
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

# Pin the LLM off, for every provider. These are SET to "" rather than popped:
# popping only clears the process env, and pydantic-settings would then fall
# back to the developer's real `.env` — so a machine with a live key would fail
# the "unconfigured" tests. An empty env var outranks the dotenv value.
os.environ["LLM_PROVIDER"] = "anthropic"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPO = ROOT.parent
RDF_FILE = REPO / "Data_File_Collected_Data_for_KG_in_RDF_Triples.rdf"

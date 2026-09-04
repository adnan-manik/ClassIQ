"""DATA_MODEL §14 Q5 — RLS tenant isolation, run as different JWT subjects.

Needs a real Postgres with the ClassIQ schema and at least two institutions
with one auth_users row each. Set TEST_DATABASE_URL (asyncpg URL) to enable;
otherwise the module is skipped so the unit suite stays hermetic.

The check impersonates Supabase's `authenticated` role and sets the JWT
claims GUC that `auth.uid()` reads, then counts rows a tenant can see.
"""

from __future__ import annotations

import json
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

TEST_DB = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")


async def _tenants(conn):
    rows = (
        await conn.execute(
            text(
                "SELECT au.id::text, au.institution_id::text "
                "FROM auth_users au WHERE au.role IN ('hod','institution_admin') "
                "ORDER BY au.institution_id LIMIT 50"
            )
        )
    ).all()
    by_inst: dict[str, str] = {}
    for uid, inst in rows:
        by_inst.setdefault(inst, uid)
    return by_inst


async def _as_user(conn, user_id: str):
    await conn.execute(text("SET LOCAL ROLE authenticated"))
    claims = json.dumps({"sub": user_id, "role": "authenticated"})
    await conn.execute(text("SELECT set_config('request.jwt.claims', :c, true)"), {"c": claims})
    await conn.execute(text("SELECT set_config('request.jwt.claim.sub', :s, true)"), {"s": user_id})


@pytest.mark.parametrize("table", ["students", "sections", "scenarios", "simulation_runs", "ingestion_jobs"])
async def test_tenant_sees_only_its_own_rows(table):
    engine = create_async_engine(TEST_DB)
    try:
        async with engine.connect() as conn:
            tenants = await _tenants(conn)
            if len(tenants) < 2:
                pytest.skip("need two institutions with a HoD/admin each")
            for inst, uid in tenants.items():
                async with conn.begin():
                    await _as_user(conn, uid)
                    visible = (await conn.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one()
                    foreign = (
                        await conn.execute(
                            text(f"SELECT count(*) FROM {table} WHERE institution_id <> :i"), {"i": inst}
                        )
                    ).scalar_one()
                assert foreign == 0, f"{table}: tenant {inst} can see {foreign} foreign rows"
                assert visible >= 0
    finally:
        await engine.dispose()

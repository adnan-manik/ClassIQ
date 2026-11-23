"""Respondent-derived response ids are unique per academic term.

An RDF id is `rdf:<individual name>` and a CSV row without `response_id` is
hashed from identity + answers. Both repeat when the same cohort is surveyed
again next term; before term scoping that whole import came back as
duplicates and no new profile versions were created.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from app.ingestion.csv_adapter import parse_csv
from app.ingestion.rdf_parser import parse_rdf
from app.models.ingestion_job import ResponseSource
from app.services import ingestion_service as svc

TERM_1, TERM_2 = uuid4(), uuid4()
INSTITUTION = uuid4()

RDF = (
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
    'xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns="http://example.org/ils#">'
    '<owl:NamedIndividual rdf:about="#Rahema_Shakil">'
    '<rdf:type rdf:resource="#Student"/>'
    "<hasEmail>rahema@example.com</hasEmail>"
    + "".join(f"<Q{q}>{'A' if q % 2 else 'B'}{q}</Q{q}>" for q in range(1, 45))
    + "</owl:NamedIndividual></rdf:RDF>"
)


def csv_row(response_id: str = "") -> bytes:
    header = "response_id,email," + ",".join(f"q{q}" for q in range(1, 45))
    row = f"{response_id},ada@example.com," + ",".join("A" for _ in range(44))
    return f"{header}\n{row}\n".encode()


@pytest.fixture(autouse=True)
def _stubs(monkeypatch):
    monkeypatch.setattr(svc.refs, "term_in_institution", AsyncMock(return_value=True))
    monkeypatch.setattr(svc, "get_instrument", AsyncMock(return_value=SimpleNamespace(id=uuid4())))
    monkeypatch.setattr(svc, "question_map", AsyncMock(return_value={}))
    monkeypatch.setattr(
        svc, "_load_roster", AsyncMock(return_value=svc._Roster({}, {}, {}))
    )


def session(stored: list[tuple[str, object]]):
    """Dry-run reads: stored (id, term) pairs, then profile max versions."""
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[Mock(all=Mock(return_value=stored)), Mock(all=Mock(return_value=[]))]
    )
    return db


async def dry_run(responses, stored, term):
    report = await svc.run_ingestion(
        session(stored),
        institution_id=INSTITUTION,
        responses=responses,
        adapter_issues=[],
        source=ResponseSource.rdf_bulk_import,
        triggered_by=None,
        academic_term_id=term,
        dry_run=True,
    )
    return report.summary


def rdf_responses():
    responses, issues = parse_rdf(RDF)
    assert not issues and responses[0].term_scoped_id
    return responses


async def test_same_rdf_individual_next_term_is_ingested():
    s = await dry_run(rdf_responses(), [(f"rdf:Rahema_Shakil@term:{TERM_1}", TERM_1)], TERM_2)
    assert (s.responses_ingested, s.responses_duplicate) == (1, 0)


async def test_same_rdf_individual_same_term_is_a_duplicate():
    s = await dry_run(rdf_responses(), [(f"rdf:Rahema_Shakil@term:{TERM_1}", TERM_1)], TERM_1)
    assert (s.responses_ingested, s.responses_duplicate) == (0, 1)


async def test_rows_stored_before_scoping_still_dedupe_in_their_term():
    stored = [("rdf:Rahema_Shakil", TERM_1)]
    same = await dry_run(rdf_responses(), stored, TERM_1)
    assert same.responses_duplicate == 1
    other = await dry_run(rdf_responses(), stored, TERM_2)
    assert (other.responses_ingested, other.responses_duplicate) == (1, 0)


async def test_hashed_csv_id_is_term_scoped():
    responses, _ = parse_csv(csv_row())
    assert responses[0].term_scoped_id
    bare = responses[0].external_response_id
    s = await dry_run(responses, [(bare, TERM_1)], TERM_2)
    assert s.responses_ingested == 1


async def test_explicit_csv_response_id_stays_global():
    responses, _ = parse_csv(csv_row("resp-1"))
    assert not responses[0].term_scoped_id
    s = await dry_run(responses, [("resp-1", TERM_1)], TERM_2)
    assert (s.responses_ingested, s.responses_duplicate) == (0, 1)


def test_scoped_id_without_term_is_unchanged():
    assert svc.scoped_response_id("rdf:X", None) == "rdf:X"
    assert svc.scoped_response_id("rdf:X", TERM_1) == f"rdf:X@term:{TERM_1}"

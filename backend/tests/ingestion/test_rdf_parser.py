"""RDF adapter — parses the real dump shipped in the repo end to end."""

import collections

import pytest

from app.engines.fslsm.scorer import score_responses
from app.ingestion.rdf_parser import parse_rdf
from app.ingestion.types import validate_response
from app.models.ingestion_job import ResponseSource
from tests.conftest import RDF_FILE

SAMPLE = """<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns="C:/x/FSLSM.rdf#">
<owl:NamedIndividual rdf:about="#Rahema_Shakil">
  <rdf:type rdf:resource="#Student"/>
  <hasEmail rdf:datatype="http://www.w3.org/2001/XMLSchema#string">rahema@example.com</hasEmail>
  {answers}
</owl:NamedIndividual>
<owl:NamedIndividual rdf:about="#NotAStudent">
  <rdf:type rdf:resource="#Teacher"/>
</owl:NamedIndividual>
</rdf:RDF>
"""


def _sample(answers: dict[int, str]) -> bytes:
    body = "\n".join(
        f'<Q{q} rdf:datatype="http://www.w3.org/2001/XMLSchema#string">{a}{q}</Q{q}>' for q, a in answers.items()
    )
    return SAMPLE.format(answers=body).encode()


def test_parses_one_student_with_44_answers():
    resps, issues = parse_rdf(_sample({q: ("A" if q % 2 else "B") for q in range(1, 45)}))
    assert issues == []
    assert len(resps) == 1
    r = resps[0]
    assert r.email == "rahema@example.com"
    assert r.full_name == "Rahema Shakil"
    assert r.external_response_id == "rdf:Rahema_Shakil"
    assert r.source == ResponseSource.rdf_bulk_import
    assert len(r.answers) == 44 and r.answers[1] == "A" and r.answers[2] == "B"
    assert validate_response(r) == []


def test_reports_missing_answers_and_bad_values():
    resps, issues = parse_rdf(_sample({1: "A", 2: "Z"}))
    assert len(resps) == 1
    assert any("unrecognised" in i.message for i in issues)
    problems = validate_response(resps[0])
    assert any("missing" in p.message for p in problems)


def test_malformed_xml_is_an_issue_not_an_exception():
    resps, issues = parse_rdf(b"<not-xml")
    assert resps == []
    assert issues and issues[0].field == "xml"


@pytest.mark.skipif(not RDF_FILE.exists(), reason="RDF dump not present")
def test_real_dump_parses_cleanly():
    resps, issues = parse_rdf(RDF_FILE.read_bytes())
    assert issues == []
    assert len(resps) == 176
    assert all(len(r.answers) == 44 for r in resps)
    assert all(validate_response(r) == [] for r in resps)
    assert len(set(r.external_response_id for r in resps)) == 176
    assert all(r.email for r in resps)
    # Every score is odd and in range; duplicate emails become extra versions, not errors.
    for r in resps:
        for v in score_responses(r.answers).as_dict().values():
            assert -11 <= v <= 11 and v % 2 != 0
    emails = collections.Counter(r.email for r in resps)
    assert len(emails) == 138

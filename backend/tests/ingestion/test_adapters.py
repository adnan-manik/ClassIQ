"""CSV / form / manual adapters + the shared validator + instrument definition."""

from datetime import datetime, timezone
from uuid import uuid4

from app.engines.fslsm.scorer import axis_for_question
from app.ingestion.csv_adapter import parse_csv
from app.ingestion.form_app_adapter import parse_form_payload
from app.ingestion.ils_instrument import RDF_PROPERTIES, TOTAL_QUESTIONS, ils_questions
from app.ingestion.manual_admin_adapter import build_manual_response
from app.ingestion.types import InternalResponse, validate_response
from app.models.ingestion_job import ResponseSource


def _csv(rows: list[dict]) -> bytes:
    cols = ["external_id", "email", "full_name"] + [f"q{i}" for i in range(1, 45)] + ["participation_level"]
    lines = [",".join(cols)]
    for r in rows:
        lines.append(",".join(str(r.get(c, "")) for c in cols))
    return "\n".join(lines).encode()


def test_csv_happy_path():
    row = {"external_id": "SP23-0001", "email": "A@X.COM", "full_name": "Ali", "participation_level": "High"}
    row.update({f"q{i}": ("a" if i % 2 else "B1") for i in range(1, 45)})
    resps, issues = parse_csv(_csv([row]))
    assert issues == []
    r = resps[0]
    assert r.student_external_id == "SP23-0001"
    assert r.email == "a@x.com"
    assert r.answers[1] == "A" and r.answers[2] == "B"
    assert r.extra["participation_level"] == "high"
    assert r.source == ResponseSource.classiq_internal
    assert r.external_response_id.startswith("csv:")
    assert validate_response(r) == []


def test_csv_missing_question_columns_is_a_header_issue():
    resps, issues = parse_csv(b"email,q1,q2\na@b.com,A,B\n")
    assert resps == []
    assert issues[0].field == "columns"


def test_csv_rejects_non_ab_cell_but_keeps_row():
    row = {"email": "z@z.com"}
    row.update({f"q{i}": "A" for i in range(1, 45)})
    row["q7"] = "maybe"
    resps, issues = parse_csv(_csv([row]))
    assert len(resps) == 1
    assert any(i.field == "q7" for i in issues)
    assert 7 not in resps[0].answers


def test_form_payload_list_and_dict_answers():
    payload = [
        {
            "response_id": "form-1",
            "student": {"external_id": "S1", "email": "s1@x.com", "full_name": "S One"},
            "submitted_at": "2026-09-01T10:00:00Z",
            "answers": ["A"] * 44,
            "aux": {"collaboration_pref": "Group"},
        },
        {"student": {"email": "s2@x.com"}, "answers": {f"q{i}": "b" for i in range(1, 45)}},
    ]
    resps, issues = parse_form_payload(payload)
    assert issues == []
    assert resps[0].external_response_id == "form-1"
    assert resps[0].submitted_at == datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    assert resps[0].extra["collaboration_pref"] == "group"
    assert resps[1].answers[44] == "B"
    assert resps[1].external_response_id.startswith("form:")
    assert all(validate_response(r) == [] for r in resps)


def test_form_payload_bad_shapes_are_reported():
    resps, issues = parse_form_payload([{"answers": "nope"}, "not-an-object"])
    assert len(resps) == 1
    assert any(i.field == "answers" for i in issues)
    assert any(i.field == "body" for i in issues)


def test_manual_response_needs_identity():
    r, issues = build_manual_response(answers={i: "A" for i in range(1, 45)}, student_id=None, external_id=None, email=None, full_name=None)
    assert issues and issues[0].field == "identity"
    sid = uuid4()
    r, issues = build_manual_response(answers={i: "a" for i in range(1, 45)}, student_id=sid, external_id=None, email=None, full_name=None, participation_level="Medium")
    assert issues == []
    assert r.extra["student_id"] == sid
    assert r.extra["participation_level"] == "medium"
    assert r.source == ResponseSource.manual_admin
    assert validate_response(r) == []


def test_validator_flags_range_and_identity():
    r = InternalResponse(external_response_id="x", answers={0: "A", 45: "B"}, source=ResponseSource.form_app)
    fields = {i.field for i in validate_response(r)}
    assert "identity" in fields and "answers" in fields


def test_ils_instrument_is_consistent():
    qs = ils_questions()
    assert len(qs) == TOTAL_QUESTIONS == 44
    assert len(RDF_PROPERTIES) == 44
    for q in qs:
        assert q.axis == axis_for_question(q.sequence_no)
        assert q.answer_a_pole in ("active", "sensing", "visual", "sequential")
        assert q.answer_b_pole in ("reflective", "intuitive", "verbal", "global")
        assert "(A)" in q.question_text and "(B)" in q.question_text
    # the two "I am more likely to be considered" questions are Q22 and Q37
    dup = [q.sequence_no for q in qs if q.rdf_property == "I_am_more_likely_to_be_considered"]
    assert dup == [22, 37]

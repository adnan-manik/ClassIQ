"""S3 aggregation over profile rows (pure)."""

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from app.models.student import FslsmAxis, Student, StudentProfile
from app.repositories.longitudinal import ProfileRow
from app.routers.longitudinal import build_overview


def row(student: Student, version: int, scores: tuple[int, int, int, int], term=("Fall 2026", date(2026, 9, 1)), dominant=None):
    ar, si, vv, sg = scores
    p = StudentProfile(
        id=uuid4(), student_id=student.id, version=version, is_current=False,
        scored_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=version),
        scoring_engine_version="1.0.0",
        active_reflective_score=ar, sensing_intuitive_score=si,
        visual_verbal_score=vv, sequential_global_score=sg, dominant_axis=dominant,
    )
    term_id = _TERM_IDS.setdefault(term[0], uuid4()) if term else None
    return ProfileRow(profile=p, student=student, term_id=term_id, term_name=term[0] if term else None, term_start=term[1] if term else None, source="form_app", submitted_at=None)


_TERM_IDS: dict[str, object] = {}


def test_overview_counts_shifts_and_drift():
    s1 = Student(id=uuid4(), full_name="Ayesha", external_id="S1")
    s2 = Student(id=uuid4(), full_name="Bilal", external_id="S2")
    s3 = Student(id=uuid4(), full_name="Chen", external_id="S3")
    t1 = ("Spring 2026", date(2026, 2, 1))
    t2 = ("Fall 2026", date(2026, 9, 1))
    rows = [
        row(s1, 1, (1, 3, 5, 7), t1, FslsmAxis.sequential_global),
        row(s1, 2, (9, 3, 5, 1), t2, FslsmAxis.active_reflective),
        row(s2, 1, (-3, -3, -3, -3), t1, FslsmAxis.active_reflective),
        row(s2, 2, (-5, -3, -3, -3), t2, FslsmAxis.active_reflective),
        row(s3, 1, (1, 1, 1, 1), t2, None),
    ]
    ov = build_overview(rows, department_id=None, top=10)
    assert ov.students_total == 3
    assert ov.students_with_history == 2
    assert ov.versions_total == 5
    assert ov.dominant_changed == 1
    # terms sorted by start date
    assert [b.academic_term_name for b in ov.by_term] == ["Spring 2026", "Fall 2026"]
    assert ov.by_term[1].profiles == 3
    assert [b.version for b in ov.by_version] == [1, 2]
    # biggest mover first: s1 moved +8 on AR and −6 on SG → magnitude 14
    assert ov.top_shifts[0].full_name == "Ayesha"
    assert ov.top_shifts[0].magnitude == 14
    assert ov.top_shifts[0].delta.active_reflective == 8
    # mean drift over the two students with history: AR (8 + −2)/2 = 3
    assert ov.axis_drift is not None and ov.axis_drift.active_reflective == 3


def test_overview_with_no_history():
    s = Student(id=uuid4(), full_name="Solo", external_id=None)
    ov = build_overview([row(s, 1, (1, 1, 1, 1), None)], department_id=None, top=5)
    assert ov.students_with_history == 0
    assert ov.axis_drift is None
    assert ov.top_shifts == []
    assert ov.by_term[0].academic_term_name == "Unassigned term"

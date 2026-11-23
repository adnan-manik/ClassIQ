"""RDF/XML (OWL) adapter — the `rdf_bulk_import` source.

Input shape (Data_File_Collected_Data_for_KG_in_RDF_Triples.rdf):

    <owl:NamedIndividual rdf:about="#Rahema_Shakil">
      <rdf:type rdf:resource="#Student"/>
      <hasEmail rdf:datatype="…#string">someone@example.com</hasEmail>
      <I_understand_the_algorithm_better_After_I rdf:datatype="…#string">A1</…>
      …  (44 answer properties; the value encodes BOTH the choice and the
          question number: "A17" = question 17, answer A)
    </owl:NamedIndividual>

Because the value carries the question number we do not depend on property
names — two questions in the source ontology share the same property name.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from app.ingestion.types import IngestionIssue, InternalResponse
from app.models.ingestion_job import ResponseSource

_OWL = "http://www.w3.org/2002/07/owl#"
_RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
_ANSWER_RE = re.compile(r"^\s*([AaBb])\s*(\d{1,2})\s*$")
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _fragment(about: str) -> str:
    return about.split("#", 1)[1] if "#" in about else about


def _guess_name(fragment: str, email: str | None) -> str | None:
    """`Rahema_Shakil` → `Rahema Shakil`; identifiers like `29Jun123` fall back
    to the email local-part; None when neither helps."""
    words = [w for w in re.split(r"[_\s]+", fragment) if w]
    alpha = [w for w in words if w.isalpha()]
    if alpha and len("".join(alpha)) >= 3 and len(alpha) == len(words):
        return " ".join(w[:1].upper() + w[1:] for w in words)
    if email:
        local = email.split("@", 1)[0]
        local = re.sub(r"[\d._-]+", " ", local).strip()
        if len(local) >= 3:
            return " ".join(p[:1].upper() + p[1:] for p in local.split())
    return None


def parse_rdf(
    blob: bytes | str,
    *,
    submitted_at: datetime | None = None,
) -> tuple[list[InternalResponse], list[IngestionIssue]]:
    """Parse an RDF/XML dump into internal responses.

    Returns (responses, issues). Individuals that are not typed `#Student` are
    ignored; malformed answer values are reported as issues on that individual
    (the response is still returned so the pipeline can reject it with the
    full validation report).
    """
    issues: list[IngestionIssue] = []
    try:
        root = ET.fromstring(blob if isinstance(blob, (bytes, bytearray)) else blob.encode("utf-8"))
    except ET.ParseError as exc:
        return [], [IngestionIssue("file", "xml", f"not well-formed RDF/XML: {exc}")]

    when = submitted_at or datetime.now(timezone.utc)
    responses: list[InternalResponse] = []
    seen_ids: dict[str, int] = {}

    for indiv in root.iter(f"{{{_OWL}}}NamedIndividual"):
        about = indiv.get(f"{{{_RDF}}}about") or ""
        fragment = _fragment(about) or f"individual-{len(responses) + 1}"

        is_student = any(
            _local(child.tag) == "type"
            and (child.get(f"{{{_RDF}}}resource") or "").endswith("#Student")
            for child in indiv
        )
        if not is_student:
            continue

        email: str | None = None
        answers: dict[int, str] = {}
        for child in indiv:
            name = _local(child.tag)
            text = (child.text or "").strip()
            if name == "type":
                continue
            if name.lower() == "hasemail":
                email = text.lower() or None
                if email and not _EMAIL_RE.match(email):
                    issues.append(IngestionIssue(fragment, "email", f"invalid email {email!r}"))
                    email = None
                continue
            m = _ANSWER_RE.match(text)
            if not m:
                issues.append(
                    IngestionIssue(fragment, name, f"unrecognised answer value {text!r}")
                )
                continue
            choice, qno = m.group(1).upper(), int(m.group(2))
            if qno in answers:
                issues.append(
                    IngestionIssue(fragment, name, f"question {qno} answered twice")
                )
            answers[qno] = choice

        # rdf:about fragments are unique in practice; guard anyway so the
        # (instrument, external_response_id) uniqueness never trips.
        n = seen_ids.get(fragment, 0) + 1
        seen_ids[fragment] = n
        ext_id = fragment if n == 1 else f"{fragment}#{n}"

        responses.append(
            InternalResponse(
                external_response_id=f"rdf:{ext_id}",
                answers=answers,
                source=ResponseSource.rdf_bulk_import,
                email=email,
                full_name=_guess_name(fragment, email),
                student_external_id=None,
                submitted_at=when,
                ref=fragment,
                term_scoped_id=True,
            )
        )

    if not responses and not issues:
        issues.append(IngestionIssue("file", "content", "no owl:NamedIndividual of type #Student found"))
    return responses, issues

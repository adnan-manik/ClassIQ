"""Split an instructional artifact into chunks the encoder can actually read.

multi-qa-mpnet-base-dot-v1 truncates at 512 word pieces and was trained on
inputs of at most 250 — roughly 190 English words. A lecture deck or a set of
notes runs to thousands. Feeding a whole document in returns a confident label
derived from its first paragraph and silently discards the rest.

Chunking is also what makes the output useful. "This deck leans verbal" is not
an instruction; "slides 4, 9 and 12 are verbal-only" is. So the unit of
prediction is the chunk, and the document profile is an aggregate over chunks.

`TARGET_WORDS` is deliberately below the 190-word ceiling, leaving room for the
tokenizer to split long technical terms into several word pieces.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

TARGET_WORDS = 150
MIN_WORDS = 12  # below this a chunk is a heading or a stray bullet — no signal

_PARAGRAPH = re.compile(r"\n\s*\n+")
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


@dataclass(frozen=True)
class Chunk:
    """One scoreable unit of an artifact."""

    index: int
    text: str
    word_count: int
    source_label: str | None = None  # e.g. "Slide 12", "Section 3.1"


def _split_long(text: str, target: int) -> list[str]:
    """Break an over-long paragraph on sentence boundaries."""
    sentences = _SENTENCE.split(text)
    out: list[str] = []
    buf: list[str] = []
    count = 0
    for s in sentences:
        n = len(s.split())
        if buf and count + n > target:
            out.append(" ".join(buf))
            buf, count = [], 0
        buf.append(s)
        count += n
    if buf:
        out.append(" ".join(buf))
    return out


def chunk_text(
    text: str,
    *,
    target_words: int = TARGET_WORDS,
    min_words: int = MIN_WORDS,
    source_labels: list[str] | None = None,
) -> list[Chunk]:
    """Split on blank lines, then pack paragraphs up to `target_words`.

    Paragraph boundaries are respected because they usually mark a slide, a
    section or a worked example — the units a teacher would actually act on.
    `source_labels` lets a caller name each paragraph (slide numbers, section
    headings) so findings can point at something the teacher recognises.
    """
    paragraphs = [p.strip() for p in _PARAGRAPH.split(text or "") if p.strip()]

    pieces: list[tuple[str, str | None]] = []
    for i, para in enumerate(paragraphs):
        label = source_labels[i] if source_labels and i < len(source_labels) else None
        if len(para.split()) > target_words:
            for part in _split_long(para, target_words):
                pieces.append((part, label))
        else:
            pieces.append((para, label))

    # Pack consecutive short pieces together, but never across a label boundary —
    # merging slide 4 into slide 5 would make the finding unactionable.
    chunks: list[Chunk] = []
    buf: list[str] = []
    buf_label: str | None = None
    count = 0

    def flush() -> None:
        nonlocal buf, count, buf_label
        if not buf:
            return
        joined = " ".join(buf).strip()
        if len(joined.split()) >= min_words:
            chunks.append(
                Chunk(index=len(chunks), text=joined,
                      word_count=len(joined.split()), source_label=buf_label)
            )
        buf, count, buf_label = [], 0, None

    for text_piece, label in pieces:
        n = len(text_piece.split())
        if buf and (count + n > target_words or label != buf_label):
            flush()
        if not buf:
            buf_label = label
        buf.append(text_piece)
        count += n
    flush()

    return chunks

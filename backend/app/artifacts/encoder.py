"""Embedding for the instructional-artifact classifiers.

The classifiers were fit on `sentence-transformers/multi-qa-mpnet-base-dot-v1`.
That model has two properties that break silently if you get them wrong, and a
near-identical sibling that has neither:

  * CLS pooling, not mean pooling. Most BERT embedding code you'll find uses
    mean pooling, and `multi-qa-mpnet-base-cos-v1` — one character different —
    genuinely does use it.
  * Unnormalized output. It's the dot-product variant; vector magnitude carries
    signal. Normalizing shifts every vector off the distribution the classifier
    was fit on.

Get either wrong and nothing raises. The classifier happily returns confident
probabilities computed from vectors that mean nothing.

So this module never hand-rolls pooling. It loads the model through
sentence-transformers, which reads the pooling and normalization config that
ships with the checkpoint, and it asserts the output dimension on first use.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

MODEL_ID = "sentence-transformers/multi-qa-mpnet-base-dot-v1"
EMBEDDING_DIM = 768


class EncoderUnavailable(Exception):
    """sentence-transformers isn't installed, or the checkpoint can't be loaded."""


@lru_cache(maxsize=1)
def _load():
    try:
        from sentence_transformers import SentenceTransformer  # noqa: WPS433
    except ImportError as exc:  # pragma: no cover — optional dependency
        raise EncoderUnavailable(
            "sentence-transformers is not installed. "
            'Run: pip install "sentence-transformers>=3.0"'
        ) from exc
    return SentenceTransformer(MODEL_ID)


def embed(texts: list[str]) -> np.ndarray:
    """Encode texts to (n, 768) float64 vectors.

    `normalize_embeddings` is left at its default of False on purpose — see the
    module docstring. Do not "fix" this.
    """
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float64)

    model = _load()
    vectors = model.encode(
        texts,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    vectors = np.asarray(vectors, dtype=np.float64)

    if vectors.shape[1] != EMBEDDING_DIM:
        raise EncoderUnavailable(
            f"{MODEL_ID} returned {vectors.shape[1]}-d vectors, expected "
            f"{EMBEDDING_DIM}. Wrong checkpoint — the classifiers will produce "
            "meaningless output."
        )
    return vectors


def is_available() -> bool:
    """Whether the encoder can be loaded, without raising."""
    try:
        _load()
        return True
    except Exception:
        return False

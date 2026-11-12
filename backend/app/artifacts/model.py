"""Pure-numpy inference for the four FSLSM artifact classifiers.

The models arrived as scikit-learn 1.6.1 pickles. Two problems with using them
that way: scikit-learn 1.6.1 has no wheel for Python 3.14 (this backend's
version) and fails to build from source, and `pickle.load` executes arbitrary
code by design — not something to do in a request path on a multi-tenant
service.

Both go away once you notice a LogisticRegression is three arrays. `extract.py`
lifts `coef_`, `intercept_` and `classes_` out once, offline, and this module
scores with them directly. The fit was verified multinomial (coefficients sum
to ~1e-14 across classes for every feature — the signature of an L2-regularised
softmax fit), so `softmax(X @ coef.T + intercept)` reproduces sklearn's
`predict_proba` exactly.

No sklearn dependency, no pickle, no version pin.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

# Where extract.py writes the .npz files. Override with ARTIFACT_MODEL_DIR.
DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "weights"


class ModelUnavailable(Exception):
    """The weight files aren't where we expected them."""


@dataclass(frozen=True)
class AxisModel:
    """One axis's multinomial logistic regression."""

    coef: np.ndarray       # (n_classes, 768)
    intercept: np.ndarray  # (n_classes,)
    classes: tuple[str, ...]

    @property
    def n_features(self) -> int:
        return int(self.coef.shape[1])

    def predict_proba(self, x: np.ndarray) -> np.ndarray:
        """Class probabilities for one or many 768-d embeddings.

        Accepts (n_features,) or (n_samples, n_features); always returns
        (n_samples, n_classes).
        """
        x = np.atleast_2d(np.asarray(x, dtype=np.float64))
        if x.shape[1] != self.n_features:
            raise ValueError(
                f"expected {self.n_features}-d embeddings, got {x.shape[1]}. "
                "The classifiers were fit on multi-qa-mpnet-base-dot-v1 vectors."
            )
        logits = x @ self.coef.T + self.intercept
        # Subtract the row max before exponentiating — standard guard against
        # overflow on large logits, and it leaves the softmax unchanged.
        logits -= logits.max(axis=1, keepdims=True)
        exp = np.exp(logits)
        return exp / exp.sum(axis=1, keepdims=True)


def load_axis_model(stem: str, model_dir: Path | None = None) -> AxisModel:
    path = (model_dir or DEFAULT_MODEL_DIR) / f"{stem}.npz"
    if not path.exists():
        raise ModelUnavailable(
            f"{path} not found. Run `python -m app.artifacts.extract` against "
            "the .pkl files Mubashir supplied to generate the weight files."
        )
    with np.load(path, allow_pickle=False) as data:
        return AxisModel(
            coef=data["coef"],
            intercept=data["intercept"],
            classes=tuple(str(c) for c in data["classes"]),
        )


@lru_cache(maxsize=8)
def _cached(stem: str, model_dir: str | None) -> AxisModel:
    return load_axis_model(stem, Path(model_dir) if model_dir else None)


def get_axis_model(stem: str, model_dir: Path | None = None) -> AxisModel:
    """Load an axis model, cached — the weights are a few hundred KB each and
    never change at runtime."""
    return _cached(stem, str(model_dir) if model_dir else None)

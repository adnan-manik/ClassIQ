"""One-off: lift the classifier weights out of Mubashir's .pkl files.

    python -m app.artifacts.extract <dir-with-pkl-files>

SECURITY — this module is the only place in ClassIQ that touches a pickle, it
is never imported by the running service, and it never calls a plain
`pickle.load`. The unpickler below whitelists numpy and joblib (needed to read
the array payloads) and substitutes an inert stub for every other class, so no
sklearn code — and nothing an attacker could have embedded — is executed. The
output is `.npz`, which the service loads with `allow_pickle=False`.

Run it once when the models change; commit or ship the resulting weights.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from joblib.numpy_pickle import NumpyUnpickler

from app.artifacts.labels import AXES
from app.artifacts.model import DEFAULT_MODEL_DIR


class _Stub:
    """Stands in for any class the pickle wants to build. Captures state, runs
    nothing."""

    def __init__(self, *args, **kwargs) -> None:
        self._state: dict = {}

    def __setstate__(self, state) -> None:
        self._state = state


class _RestrictedUnpickler(NumpyUnpickler):
    """joblib's array-aware unpickler, with every non-numpy import neutralised."""

    def find_class(self, module: str, name: str):
        if module.startswith(("numpy", "joblib")):
            return super().find_class(module, name)
        return _Stub


def extract_one(pkl_path: Path, out_dir: Path) -> dict:
    with open(pkl_path, "rb") as fh:
        obj = _RestrictedUnpickler(str(pkl_path), fh, ensure_native_byte_order=True).load()

    clf_state = obj["clf"]._state
    le_state = obj["label_encoder"]._state
    coef = np.asarray(clf_state["coef_"], dtype=np.float64)
    intercept = np.asarray(clf_state["intercept_"], dtype=np.float64)
    classes = np.asarray([str(c) for c in le_state["classes_"]])

    # Sanity: an L2-regularised multinomial fit is centred — coefficients sum to
    # ~0 across classes for every feature. One-vs-rest has no such constraint,
    # and would need sigmoid-then-normalise instead of softmax. If this ever
    # fails, `AxisModel.predict_proba` is scoring the wrong model family.
    drift = float(np.abs(coef.sum(axis=0)).max())
    if drift > 1e-6:
        raise ValueError(
            f"{pkl_path.name}: coefficients are not centred (max |sum| = {drift:.2e}). "
            "This looks like a one-vs-rest fit, not multinomial — softmax scoring "
            "would be wrong. Check with Mubashir before using it."
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{pkl_path.stem.replace('_bert_logreg', '')}.npz"
    np.savez(out, coef=coef, intercept=intercept, classes=classes)
    return {
        "file": out.name,
        "shape": coef.shape,
        "classes": list(classes),
        "sklearn_version": clf_state.get("_sklearn_version"),
        "n_features": clf_state.get("n_features_in_"),
        "centred_drift": drift,
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    src = Path(argv[1])
    out_dir = Path(argv[2]) if len(argv) > 2 else DEFAULT_MODEL_DIR

    found = 0
    for axis in AXES:
        pkl = src / f"{axis.model_stem}_bert_logreg.pkl"
        if not pkl.exists():
            print(f"  MISSING  {pkl.name}")
            continue
        info = extract_one(pkl, out_dir)
        found += 1
        print(f"  ok       {info['file']:26} coef{info['shape']}  "
              f"{len(info['classes'])} classes  (sklearn {info['sklearn_version']})")
        for label in info["classes"]:
            from app.artifacts.labels import role_for
            role = role_for(axis, label)
            mark = "  <- foreign" if role.value == "foreign" else ""
            print(f"             {role.value:8} {label!r}{mark}")

    print(f"\n{found}/{len(AXES)} models extracted to {out_dir}")
    return 0 if found == len(AXES) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

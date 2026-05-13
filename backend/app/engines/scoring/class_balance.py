"""Class Balance factor — diversity of dominant FSLSM axes.

A class with all-visual learners is harder to teach than a mixed class
because no single approach reaches everyone. We reward an even spread
across the 4 dominant-axis buckets using entropy.
"""

import math

from app.models.student import FslsmAxis, StudentProfile


def score(profiles: list[StudentProfile]) -> int:
    if len(profiles) <= 1:
        return 50

    counts = {a: 0 for a in FslsmAxis}
    classified = 0
    for p in profiles:
        if p.dominant_axis:
            counts[p.dominant_axis] += 1
            classified += 1

    if classified == 0:
        return 50

    # Shannon entropy normalized by log(4) — max entropy when uniform across axes.
    h = 0.0
    for c in counts.values():
        if c == 0:
            continue
        p = c / classified
        h -= p * math.log(p)
    max_h = math.log(4)
    normalized = h / max_h if max_h > 0 else 0.0

    return max(0, min(100, round(normalized * 100)))

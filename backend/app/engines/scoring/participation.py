"""Participation Mix factor — distribution of low/medium/high participation.

Ideal class: medium-leaning, some high, few low. Pure-high classes get noisy,
pure-low classes go silent. Mid-rich classes give the teacher signal without
chaos.
"""

from app.models.student import ParticipationLevel, StudentAuxProfile


def score(aux: list[StudentAuxProfile]) -> int:
    if not aux:
        return 50

    counts = {p: 0 for p in ParticipationLevel}
    classified = 0
    for a in aux:
        if a.participation_level:
            counts[a.participation_level] += 1
            classified += 1

    if classified == 0:
        return 50

    high = counts[ParticipationLevel.high] / classified
    medium = counts[ParticipationLevel.medium] / classified
    low = counts[ParticipationLevel.low] / classified

    # Ideal mix ~ {low: 0.15, medium: 0.55, high: 0.30}.
    # Distance from ideal scored linearly.
    ideal = {"low": 0.15, "medium": 0.55, "high": 0.30}
    dist = (
        abs(low - ideal["low"])
        + abs(medium - ideal["medium"])
        + abs(high - ideal["high"])
    )
    # Max L1 distance between two distributions on 3 buckets is 2.0
    normalized = 1.0 - (dist / 2.0)
    return max(0, min(100, round(normalized * 100)))

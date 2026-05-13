"""Social Cohesion factor — peer-relationship structure within the section."""

from dataclasses import dataclass
from uuid import UUID

from app.engines.graph import build_section_graph, graph_metrics
from app.models.peer_relationship import PeerRelationship


@dataclass(frozen=True)
class SocialResult:
    score: int                # 0..100
    label: str                # "supportive" | "neutral" | "hindering"


def score(
    student_ids: list[UUID],
    relationships: list[PeerRelationship],
) -> SocialResult:
    """Score 0..100 + a categorical label.

    Rewards: edge density, average clustering, share of positive edges.
    Penalizes: conflict density, isolated nodes.
    """
    g = build_section_graph(student_ids, relationships)
    m = graph_metrics(g)

    if m.n_nodes <= 1:
        return SocialResult(score=50, label="neutral")

    # Component scores in [0, 1]
    density_norm = min(1.0, m.density * 6.0)            # density of 0.17+ → 1.0
    clustering_norm = m.avg_clustering                  # already 0..1
    positive_norm = m.positive_edge_share               # 0..1
    conflict_pen = m.conflict_density                   # subtract
    isolation_pen = m.isolated_node_count / m.n_nodes   # subtract

    raw = (
        0.40 * density_norm
        + 0.25 * clustering_norm
        + 0.20 * positive_norm
        - 0.35 * conflict_pen
        - 0.20 * isolation_pen
    )
    score_val = max(0, min(100, round((raw + 0.55) * 100)))

    if score_val >= 70:
        label = "supportive"
    elif score_val >= 40:
        label = "neutral"
    else:
        label = "hindering"

    return SocialResult(score=score_val, label=label)

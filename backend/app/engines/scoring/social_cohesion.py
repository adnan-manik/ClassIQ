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

    # No usable peer signal (singleton class, no relationships ingested, or
    # only neutral ties which carry no positive/negative signal) → neutral.
    # We must NOT penalize a section just because peer data is absent.
    if m.n_nodes <= 1 or m.n_edges == 0:
        return SocialResult(score=50, label="neutral")
    if m.positive_edge_share == 0.0 and m.conflict_density == 0.0:
        return SocialResult(score=50, label="neutral")

    # Component scores in [0, 1].
    # `connectivity` = share of students with at least one meaningful tie.
    connectivity = 1.0 - (m.isolated_node_count / m.n_nodes)
    positive = m.positive_edge_share        # share of edges that are friend/study_partner
    conflict = m.conflict_density           # share of edges that are conflicts
    clustering = m.avg_clustering           # clustering of the POSITIVE subgraph (0..1)
    isolation = m.isolated_node_count / m.n_nodes

    # Start from a neutral baseline of 0.5. Positive ties that actually reach
    # students (positive_share × connectivity) and tight positive clusters
    # raise the score; conflict edges and isolated students lower it. Conflict
    # edges earn NO cohesion credit (they're excluded from `positive` and from
    # the clustering projection), so a conflict-heavy class scores low.
    raw01 = (
        0.50
        + 0.35 * (positive * connectivity)
        + 0.15 * clustering
        - 0.45 * conflict
        - 0.20 * isolation
    )
    score_val = max(0, min(100, round(raw01 * 100)))

    if score_val >= 70:
        label = "supportive"
    elif score_val >= 40:
        label = "neutral"
    else:
        label = "hindering"

    return SocialResult(score=score_val, label=label)

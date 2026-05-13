"""NetworkX adapter — builds a weighted directed graph from peer_relationships
and exposes the metrics the scoring engine cares about.

The graph is constructed fresh per simulation run; no NetworkX state is
persisted. Classroom-sized graphs (≤200 nodes) fit comfortably in memory.
"""

from dataclasses import dataclass
from uuid import UUID

import networkx as nx

from app.models.peer_relationship import PeerRelationship, RelationshipType


# Type weights map relationship semantics to an edge weight. Tunable.
EDGE_TYPE_WEIGHT: dict[RelationshipType, float] = {
    RelationshipType.friend: 1.0,
    RelationshipType.study_partner: 1.2,
    RelationshipType.neutral: 0.0,
    RelationshipType.conflict: -1.0,
}


@dataclass(frozen=True)
class GraphMetrics:
    n_nodes: int
    n_edges: int
    density: float                  # 0..1 — fraction of possible directed edges
    avg_clustering: float           # 0..1 — average local clustering coefficient
    conflict_density: float         # 0..1 — share of edges that are conflicts
    positive_edge_share: float      # 0..1 — share of edges with positive weight
    isolated_node_count: int        # students with no in/out edges in the subgraph


def build_section_graph(
    student_ids: list[UUID],
    relationships: list[PeerRelationship],
) -> nx.DiGraph:
    """Build a DiGraph for one section — only edges where BOTH endpoints
    are enrolled. Weight = strength × type_factor."""
    g: nx.DiGraph = nx.DiGraph()
    g.add_nodes_from(student_ids)
    member = set(student_ids)
    for r in relationships:
        if r.from_student_id not in member or r.to_student_id not in member:
            continue
        type_w = EDGE_TYPE_WEIGHT.get(r.type, 0.0)
        weight = r.strength * type_w
        g.add_edge(
            r.from_student_id,
            r.to_student_id,
            type=r.type.value,
            strength=r.strength,
            weight=weight,
        )
    return g


def graph_metrics(g: nx.DiGraph) -> GraphMetrics:
    n = g.number_of_nodes()
    m = g.number_of_edges()

    if n <= 1:
        return GraphMetrics(
            n_nodes=n,
            n_edges=m,
            density=0.0,
            avg_clustering=0.0,
            conflict_density=0.0,
            positive_edge_share=0.0,
            isolated_node_count=n,
        )

    density = nx.density(g)
    # NetworkX clustering treats the graph as undirected for the avg metric.
    avg_clustering = nx.average_clustering(g.to_undirected()) if m > 0 else 0.0

    conflict = sum(1 for _, _, d in g.edges(data=True) if d.get("type") == "conflict")
    positive = sum(1 for _, _, d in g.edges(data=True) if d.get("weight", 0) > 0)
    conflict_density = conflict / m if m else 0.0
    positive_share = positive / m if m else 0.0

    isolated = sum(1 for node in g.nodes if g.degree(node) == 0)

    return GraphMetrics(
        n_nodes=n,
        n_edges=m,
        density=density,
        avg_clustering=avg_clustering,
        conflict_density=conflict_density,
        positive_edge_share=positive_share,
        isolated_node_count=isolated,
    )

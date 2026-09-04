"""NetworkX social-graph metrics + the social-cohesion factor."""

from uuid import uuid4

from app.engines.graph import build_section_graph, graph_metrics
from app.engines.scoring import social_cohesion
from app.models.peer_relationship import PeerRelationship, RelationshipType


def rel(a, b, t, s=3):
    return PeerRelationship(id=uuid4(), from_student_id=a, to_student_id=b, type=t, strength=s)


def test_edges_outside_roster_are_ignored():
    a, b, outsider = uuid4(), uuid4(), uuid4()
    g = build_section_graph([a, b], [rel(a, outsider, RelationshipType.friend), rel(a, b, RelationshipType.friend)])
    assert g.number_of_nodes() == 2
    assert g.number_of_edges() == 1
    assert g[a][b]["weight"] == 3 * 1.0


def test_metrics_on_friendly_triangle():
    a, b, c = uuid4(), uuid4(), uuid4()
    g = build_section_graph(
        [a, b, c],
        [rel(a, b, RelationshipType.friend), rel(b, c, RelationshipType.study_partner), rel(c, a, RelationshipType.friend)],
    )
    m = graph_metrics(g)
    assert m.n_nodes == 3 and m.n_edges == 3
    assert m.positive_edge_share == 1.0
    assert m.conflict_density == 0.0
    assert m.isolated_node_count == 0
    assert m.avg_clustering == 1.0


def test_neutral_edges_carry_no_signal():
    a, b = uuid4(), uuid4()
    g = build_section_graph([a, b], [rel(a, b, RelationshipType.neutral)])
    m = graph_metrics(g)
    assert m.positive_edge_share == 0.0
    assert m.isolated_node_count == 2  # neutral ties don't connect anyone


def test_social_cohesion_neutral_without_data_and_hindering_with_conflict():
    ids = [uuid4() for _ in range(4)]
    assert social_cohesion.score(ids, []).label == "neutral"
    assert social_cohesion.score(ids, []).score == 50

    conflicts = [rel(ids[i], ids[(i + 1) % 4], RelationshipType.conflict, 5) for i in range(4)]
    bad = social_cohesion.score(ids, conflicts)
    friends = [rel(ids[i], ids[(i + 1) % 4], RelationshipType.friend, 5) for i in range(4)]
    good = social_cohesion.score(ids, friends)
    assert bad.score < good.score
    assert bad.label == "hindering"
    assert good.label in ("supportive", "neutral")

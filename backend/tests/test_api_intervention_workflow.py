"""Phase 8: the API calls behind the Intervention Lab workflow (preview -> run with -> run without)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
BLOCKED = {"id": "blocked_channel"}
PLAN = [{"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 80}}, {"id": "restore_channel"}]


def preview(body):
    return client.post("/api/interventions/preview", json=body)


def simulate(body):
    return client.post("/api/simulate", json=body)


def test_preview_reports_design_before_and_after_without_simulating():
    body = preview({"scenario": BLOCKED, "interventions": PLAN}).json()
    assert set(body) == {"region_ids", "scenario", "interventions", "drainage_design", "drainage_before", "drainage_after"}
    col = lambda grid: [row[2] for row in grid]
    assert col(body["drainage_design"]) == [35.0, 30.0, 20.0, 15.0, 10.0]
    assert col(body["drainage_before"]) == [0.0] * 5                       # scenario blocked the channel
    assert col(body["drainage_after"]) == [35.0, 30.0, 20.0, 15.0, 80.0]    # pump first, then restore (never lowers)
    assert body["scenario"]["id"] == "blocked_channel" and body["interventions"]["count"] == 2
    assert body["interventions"]["items"][0]["changes"] == [
        {"region": "R5C3", "field": "drainage_capacity", "unit": "mm/h", "before": 0.0, "after": 80.0}]
    assert [c["region"] for c in body["interventions"]["items"][1]["changes"]] == ["R1C3", "R2C3", "R3C3", "R4C3"]


def test_preview_matches_what_simulate_then_applies():
    req = {"scenario": BLOCKED, "interventions": PLAN}
    p, s = preview(req).json(), simulate(req).json()
    assert p["interventions"] == s["interventions"] and p["scenario"] == s["scenario"]
    assert p["drainage_after"] == s["city"]["drainage_capacity"]


def test_preview_with_empty_plan_and_baseline():
    body = preview({}).json()
    assert body["interventions"]["count"] == 0 and body["scenario"]["is_baseline"]
    assert body["drainage_design"] == body["drainage_before"] == body["drainage_after"]


def test_preview_ignores_nothing_it_should_validate():
    for bad, field in [({"interventions": [{"id": "activate_pump"}]}, "interventions.0.targets"),
                       ({"interventions": [{"id": "activate_pump", "targets": ["R9C9"]}]}, "interventions.0.targets"),
                       ({"scenario": {"id": "nope"}}, "scenario.id"),
                       ({"interventions": [{"id": "unblock_drain", "targets": ["R5C3"], "params": {"restore_percent": 500}}]},
                        "interventions.0.params.restore_percent")]:
        res = preview(bad)
        assert res.status_code == 422 and any(d["field"] == field for d in res.json()["error"]["details"])


def test_preview_is_deterministic_and_has_no_side_effects():
    req = {"scenario": BLOCKED, "interventions": PLAN}
    before = simulate({}).json()
    assert preview(req).json() == preview(req).json()
    assert simulate({}).json() == before


def test_full_workflow_with_then_without_interventions():
    scenario_only = simulate({"scenario": BLOCKED}).json()
    with_plan = simulate({"scenario": BLOCKED, "interventions": PLAN}).json()
    without_again = simulate({"scenario": BLOCKED}).json()
    # three clearly distinguishable states
    assert (scenario_only["scenario"]["is_baseline"], scenario_only["interventions"]["count"]) == (False, 0)
    assert (with_plan["scenario"]["id"], with_plan["interventions"]["count"]) == ("blocked_channel", 2)
    # running without interventions reproduces the scenario-only result exactly
    assert without_again == scenario_only
    # and the modeled result with the plan is better on the engine's own numbers
    assert with_plan["summary"]["max_water_level"] < scenario_only["summary"]["max_water_level"]
    assert with_plan["summary"]["earliest_critical_time"] is None or (
        with_plan["summary"]["earliest_critical_time"] >= scenario_only["summary"]["earliest_critical_time"])
    # early-warning inputs are still present in an intervention run
    assert len(with_plan["timeline"]["timestamps"]) == 61 and all("time_to_critical" in r for r in with_plan["regions"])


def test_interventions_on_the_baseline_are_a_fourth_state():
    body = simulate({"interventions": [{"id": "increase_drainage"}]}).json()
    assert body["scenario"]["is_baseline"] is True and body["interventions"]["count"] == 1
    assert body["interventions"]["changed_region_count"] == 25


@pytest.mark.parametrize("path", ["/api/interventions/preview"])
def test_preview_cors(path):
    res = client.post(path, json={}, headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 200 and res.headers["access-control-allow-origin"] == "http://localhost:5173"

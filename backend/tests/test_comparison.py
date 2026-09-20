"""Phase 9: comparison engine (pure read of two results) and POST /api/compare."""
import copy

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.comparison import LABEL, WATER_TOLERANCE_M, compare_results, compare_time, safe_percent
from app.interventions import apply_interventions
from app.main import app
from app.scenarios import apply_scenario
from app.simulation import CityGrid, SimulationConfig, create_synthetic_city, run_simulation

client = TestClient(app)
BLOCKED = {"id": "blocked_channel"}
PLAN = [{"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 120}}, {"id": "restore_channel"}]
REQ = {"scenario": BLOCKED, "interventions": PLAN}


def compare(body):
    return client.post("/api/compare", json=body)


def simulate(body):
    return client.post("/api/simulate", json=body).json()


@pytest.fixture(scope="module")
def body():
    res = compare(REQ)
    assert res.status_code == 200, res.text
    return res.json()


def metric(body, key):
    return next(m for m in body["metrics"] if m["key"] == key)


# ---- safe maths ------------------------------------------------------------------
def test_safe_percent_never_divides_by_zero():
    assert safe_percent(0, 0) == 0.0
    assert safe_percent(0, 5) is None
    assert safe_percent(0.0, 1e-9) is None
    assert safe_percent(200, 150) == -25.0
    assert safe_percent(4, 6) == 50.0
    assert safe_percent(10, 0) == -100.0


@pytest.mark.parametrize("a, b, status, direction, change", [
    (None, None, "never", "unchanged", None),
    (30.0, None, "prevented", "improved", None),
    (None, 30.0, "introduced", "worsened", None),
    (30.0, 42.0, "delayed", "improved", 12.0),
    (30.0, 25.5, "earlier", "worsened", -4.5),
    (30.0, 30.0, "same", "unchanged", 0.0),
    (0.0, 10.0, "delayed", "improved", 10.0),
])
def test_compare_time_handles_never_critical(a, b, status, direction, change):
    assert compare_time(a, b) == {"without": a, "with": b, "change_minutes": change, "status": status, "direction": direction}


# ---- engine-level ----------------------------------------------------------------
def runs(plan, scenario="blocked_channel", params=None):
    base = create_synthetic_city()
    sc_city, sc_params, _ = apply_scenario(base, scenario, params)
    plan_city, _ = apply_interventions(sc_city, base, plan, channel_cells=sc_params.get("channel_cells"))
    return sc_city, run_simulation(sc_city), run_simulation(plan_city)


def test_identical_runs_compare_as_fully_unchanged():
    city, a, _ = runs([])
    out = compare_results(city, a, run_simulation(city))
    assert all(m["direction"] == "unchanged" and m["absolute_change"] == 0 and m["percent_change"] == 0.0 for m in out["metrics"])
    assert out["region_summary"]["unchanged_count"] == 25 and out["region_summary"]["improved"] == []
    assert out["earliest_critical"]["status"] == "same"
    assert all(r["status"] == "unchanged" and r["reason"] == "" for r in out["regions"])


def test_comparison_does_not_modify_either_result():
    city, a, b = runs(PLAN)
    snap = [copy.deepcopy(x.to_dict()) for x in (a, b)]
    compare_results(city, a, b)
    assert [x.to_dict() for x in (a, b)] == snap


def test_swapping_the_runs_mirrors_every_direction():
    city, a, b = runs(PLAN)
    fwd, rev = compare_results(city, a, b), compare_results(city, b, a)
    flip = {"improved": "worsened", "worsened": "improved", "unchanged": "unchanged"}
    for m, n in zip(fwd["metrics"], rev["metrics"]):
        assert n["absolute_change"] == pytest.approx(-m["absolute_change"], abs=2e-5) and n["direction"] == flip[m["direction"]]
    assert rev["region_summary"]["worsened"] == fwd["region_summary"]["improved"]
    assert rev["earliest_critical"]["status"] == "earlier"
    prevented = [t["id"] for t in fwd["time_to_critical"] if t["status"] == "prevented"]
    assert [t["id"] for t in rev["time_to_critical"] if t["status"] == "introduced"] == prevented


def test_zero_baseline_values_give_null_percent_not_an_error():
    city, calm, _ = runs([], scenario="normal_rainfall", params={"rainfall_multiplier": 0})
    wet = run_simulation(create_synthetic_city())
    out = compare_results(city, calm, wet)
    m = {x["key"]: x for x in out["metrics"]}
    assert m["critical_regions"]["without"] == 0 and m["critical_regions"]["percent_change"] is None
    assert "value without interventions is 0" in m["critical_regions"]["percent_note"]
    assert m["critical_regions"]["absolute_change"] == 2 and m["critical_regions"]["direction"] == "worsened"
    assert out["earliest_critical"]["status"] == "introduced"
    both_dry = next(r for r in out["regions"] if r["id"] == "R1C1")
    assert both_dry["without"]["max_water_level"] == both_dry["with"]["max_water_level"] == 0
    assert both_dry["max_water_percent_change"] == 0.0 and both_dry["status"] == "unchanged"
    newly_wet = next(r for r in out["regions"] if r["id"] == "R4C2")
    assert newly_wet["without"]["max_water_level"] == 0 < newly_wet["with"]["max_water_level"]
    assert newly_wet["max_water_percent_change"] is None and newly_wet["status"] == "worsened"


def test_mismatched_runs_are_rejected():
    city = create_synthetic_city()
    a = run_simulation(city, SimulationConfig(duration_minutes=30))
    with pytest.raises(ValueError):
        compare_results(city, a, run_simulation(city, SimulationConfig(duration_minutes=60)))
    small = CityGrid(rows=2, cols=2, elevation=1, rainfall=10, drainage_capacity=0, initial_water=0, population=1)
    with pytest.raises(ValueError):
        compare_results(city, a, run_simulation(small, SimulationConfig(duration_minutes=30)))


def test_depth_tolerance_ignores_numerical_noise():
    city, a, _ = runs([])
    b = copy.deepcopy(a)
    b.maximum_water_level = a.maximum_water_level + WATER_TOLERANCE_M / 10
    assert all(r["status"] == "unchanged" for r in compare_results(city, a, b)["regions"])


# ---- API: both runs are the real pipeline ----------------------------------------
def test_both_runs_equal_the_separate_simulate_calls(body):
    without, with_plan = simulate({"scenario": BLOCKED}), simulate(REQ)
    assert body["runs"]["without"] == without["summary"]
    assert body["runs"]["with"] == with_plan["summary"]
    assert body["interventions"] == with_plan["interventions"] and body["scenario"] == with_plan["scenario"]
    assert body["timeline"]["without"]["max_water"] == without["timeline"]["max_water"]
    assert body["timeline"]["with"]["affected_population"] == with_plan["timeline"]["affected_population"]
    for cmp_region, a, b in zip(body["regions"], without["regions"], with_plan["regions"]):
        assert cmp_region["without"]["max_water_level"] == a["max_water_level"]
        assert cmp_region["with"]["time_to_critical"] == b["time_to_critical"]
        assert cmp_region["without"]["peak_risk"] == a["peak_risk"] and cmp_region["with"]["final_risk"] == b["final_risk"]


def test_only_the_plan_differs_between_the_runs():
    req = {"rainfall": 95, "scenario": {"id": "heavy_rainfall"}, "interventions": [{"id": "increase_drainage"}],
           "config": {"duration_minutes": 40, "timestep_minutes": 0.5, "warning_threshold": 0.1, "critical_threshold": 0.2}}
    body = compare(req).json()
    solo = simulate({k: v for k, v in req.items() if k != "interventions"})
    assert body["runs"]["without"] == solo["summary"]
    assert body["config"] == solo["config"] and body["timeline"]["timestamps"] == solo["timeline"]["timestamps"]
    assert len(body["timeline"]["timestamps"]) == 81


def test_structure_and_label(body):
    assert set(body) == {"label", "water_tolerance_m", "meta", "config", "scenario", "interventions", "runs", "metrics",
                         "earliest_critical", "time_to_critical", "region_summary", "regions", "timeline"}
    assert body["label"] == LABEL and body["label"].startswith("MODELED IMPACT")
    assert [m["key"] for m in body["metrics"]] == [
        "critical_regions", "warning_regions", "affected_population", "critical_population", "warning_population",
        "max_water_level", "final_max_water_level", "final_mean_water_level", "total_drained"]
    assert len(body["regions"]) == 25 and body["regions"][0]["id"] == "R1C1"
    for m in body["metrics"]:
        assert set(m) == {"key", "label", "unit", "lower_is_better", "without", "with", "absolute_change",
                          "percent_change", "percent_note", "direction", "note"}


def test_metric_arithmetic(body):
    for m in body["metrics"]:
        assert m["absolute_change"] == pytest.approx(m["with"] - m["without"], abs=2e-5)
        if m["without"]:
            assert m["percent_change"] == pytest.approx(m["absolute_change"] / m["without"] * 100, abs=0.02)
    assert isinstance(metric(body, "critical_regions")["with"], int)
    assert isinstance(metric(body, "max_water_level")["with"], float)


def test_modeled_impact_of_the_example_plan(body):
    assert metric(body, "critical_regions")["absolute_change"] == -1 and metric(body, "critical_regions")["percent_change"] == -50.0
    assert metric(body, "affected_population")["direction"] == "improved"
    assert metric(body, "max_water_level")["direction"] == "improved"
    drained = metric(body, "total_drained")
    assert drained["lower_is_better"] is False and drained["absolute_change"] > 0 and drained["direction"] == "improved"
    ec = body["earliest_critical"]
    assert (ec["without"], ec["status"], ec["direction"], ec["region_without"]) == (31.0, "delayed", "improved", "R5C3")
    assert ec["change_minutes"] == ec["with"] - ec["without"] > 0


def test_movement_between_critical_and_warning_is_not_called_worse(body):
    warn = metric(body, "warning_population")
    assert warn["absolute_change"] > 0                       # raw number went up: R4C3 dropped from critical to warning
    assert warn["direction"] == "improved"                   # ...but people only left the warning band towards safe
    assert "moved down from critical to warning" in warn["note"] and "3200 people" in warn["note"]
    assert metric(body, "critical_population")["note"] == ""


def test_time_to_critical_for_relevant_regions_only(body):
    ttc = {t["id"]: t for t in body["time_to_critical"]}
    assert set(ttc) == {"R4C3", "R5C3"}
    assert ttc["R4C3"]["status"] == "prevented" and ttc["R4C3"]["with"] is None and ttc["R4C3"]["change_minutes"] is None
    assert ttc["R5C3"]["status"] == "delayed" and ttc["R5C3"]["change_minutes"] > 0


def test_region_level_details(body):
    regions = {r["id"]: r for r in body["regions"]}
    r4 = regions["R4C3"]
    assert (r4["without"]["peak_risk"], r4["with"]["peak_risk"], r4["peak_risk_change"]) == ("CRITICAL", "WARNING", -1)
    assert (r4["status"], r4["reason"]) == ("improved", "lower peak risk level")
    assert (regions["R5C3"]["status"], regions["R5C3"]["reason"]) == ("improved", "critical delayed")
    assert regions["R5C3"]["max_water_change"] < 0 and regions["R5C3"]["max_water_percent_change"] < 0
    assert regions["R1C1"]["status"] == "unchanged"
    for r in body["regions"]:
        assert r["max_water_change"] == pytest.approx(r["with"]["max_water_level"] - r["without"]["max_water_level"], abs=2e-5)


def test_region_summary_is_consistent(body):
    s = body["region_summary"]
    assert s["improved_count"] + s["unchanged_count"] + s["worsened_count"] == s["total"] == 25
    assert s["improved"] == [r["id"] for r in body["regions"] if r["status"] == "improved"] and s["improved_count"] == len(s["improved"])
    assert s["worsened"] == [] and s["worsened_population"] == 0
    assert s["improved_population"] == sum(r["population"] for r in body["regions"] if r["status"] == "improved")
    assert s["no_longer_critical"] == ["R4C3"] and s["newly_critical"] == [] and "R3C3" in s["no_longer_at_risk"]


def test_a_plan_that_changes_nothing_compares_as_unchanged():
    body = compare({"interventions": [{"id": "unblock_drain", "targets": ["R1C1"]}]}).json()
    assert body["interventions"]["items"][0]["changes"] == []
    assert all(m["direction"] == "unchanged" for m in body["metrics"]) and body["region_summary"]["unchanged_count"] == 25


def test_works_on_the_baseline_and_a_custom_city():
    base = compare({"interventions": [{"id": "increase_drainage", "params": {"increase_percent": 100}}]}).json()
    assert base["scenario"]["is_baseline"] and base["runs"]["without"] == simulate({})["summary"]
    assert base["region_summary"]["worsened"] == []
    city = {"rows": 1, "cols": 2, "elevation": [[10.1, 10.0]], "drainage_capacity": 5, "population": [[10, 20]], "rainfall": 120}
    custom = compare({"city": city, "interventions": [{"id": "activate_pump", "targets": ["R1C2"]}], "config": {"duration_minutes": 30}}).json()
    assert custom["meta"]["rows"] == 1 and len(custom["regions"]) == 2 and metric(custom, "max_water_level")["direction"] == "improved"


# ---- immutability, determinism, validation ---------------------------------------
def test_baseline_and_simulate_are_untouched_by_comparisons():
    before = simulate({}), simulate({"scenario": BLOCKED})
    for _ in range(2):
        compare(REQ)
    assert (simulate({}), simulate({"scenario": BLOCKED})) == before
    assert before[0]["summary"]["affected_population"] == 10700 and before[0]["summary"]["earliest_critical_time"] == 33.0


def test_deterministic():
    assert compare(REQ).json() == compare(REQ).json()


@pytest.mark.parametrize("req, field", [
    ({}, "interventions"),
    ({"scenario": BLOCKED}, "interventions"),
    ({"interventions": []}, "interventions"),
    ({"interventions": [{"id": "activate_pump"}]}, "interventions.0.targets"),
    ({"interventions": [{"id": "activate_pump", "targets": ["R9C9"]}]}, "interventions.0.targets"),
    ({"scenario": {"id": "nope"}, "interventions": PLAN}, "scenario.id"),
    ({"interventions": PLAN, "config": {"timestep_minutes": 0}}, "config.timestep_minutes"),
    ({"interventions": PLAN, "config": {"duration_minutes": 10, "timestep_minutes": 3}}, "config"),
])
def test_invalid_comparisons_are_clean_422s(req, field):
    res = compare(req)
    assert res.status_code == 422, res.text
    assert any(d["field"] == field for d in res.json()["error"]["details"]), res.json()


def test_cors_and_other_endpoints_still_work():
    res = client.post("/api/compare", json=REQ, headers={"Origin": "http://localhost:5173"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert client.get("/api/health").json()["version"] == "0.9.0"
    assert client.post("/api/interventions/preview", json=REQ).status_code == 200

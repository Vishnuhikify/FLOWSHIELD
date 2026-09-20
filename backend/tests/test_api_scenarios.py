"""Phase 6: scenarios through the HTTP API."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
SCENARIO_IDS = ["normal_rainfall", "heavy_rainfall", "extreme_rainfall", "drainage_failure", "blocked_channel"]


def post(body):
    return client.post("/api/simulate", json=body)


def strip(body):
    return {k: v for k, v in body.items() if k != "scenario"}  # "interventions" stays: it must also match


# ---- catalogue -------------------------------------------------------------------
def test_catalogue_endpoint():
    res = client.get("/api/scenarios")
    assert res.status_code == 200
    body = res.json()
    assert body["baseline_id"] == "baseline"
    assert [s["id"] for s in body["scenarios"]] == ["baseline", *SCENARIO_IDS]
    heavy = next(s for s in body["scenarios"] if s["id"] == "heavy_rainfall")
    assert heavy["name"] == "Heavy rainfall" and heavy["assumptions"]
    assert heavy["params"] == [{
        "name": "rainfall_multiplier", "label": "Rainfall multiplier", "kind": "number", "default": 1.3,
        "minimum": 0.0, "maximum": 5.0, "step": 0.05, "unit": "x", "description": heavy["params"][0]["description"]}]
    blocked = next(s for s in body["scenarios"] if s["id"] == "blocked_channel")
    assert {p["name"]: p["kind"] for p in blocked["params"]}["channel_cells"] == "cells"


# ---- baseline preservation -------------------------------------------------------
def test_no_scenario_is_the_baseline_and_matches_previous_phases():
    body = post({}).json()
    assert body["scenario"]["id"] == "baseline" and body["scenario"]["is_baseline"] is True
    assert body["scenario"]["params"] == {} and body["scenario"]["changes"]["affected_region_count"] == 0
    s = body["summary"]
    assert (s["critical_regions"], s["affected_population"], s["earliest_critical_time"], s["max_water_level"]) == (
        ["R4C3", "R5C3"], 10700, 33.0, 0.38421)


def test_explicit_baseline_equals_omitted_scenario():
    assert post({"scenario": {"id": "baseline"}}).json() == post({}).json()


def test_baseline_is_unchanged_after_running_scenarios():
    before = post({}).json()
    for sid in SCENARIO_IDS:
        assert post({"scenario": {"id": sid}}).status_code == 200
    assert post({}).json() == before


def test_neutral_parameters_reproduce_the_baseline_numbers():
    base = strip(post({}).json())
    assert strip(post({"scenario": {"id": "heavy_rainfall", "params": {"rainfall_multiplier": 1}}}).json()) == base
    assert strip(post({"scenario": {"id": "drainage_failure", "params": {"drainage_remaining": 100}}}).json()) == base
    assert strip(post({"scenario": {"id": "blocked_channel", "params": {"channel_remaining": 100}}}).json()) == base


# ---- every scenario --------------------------------------------------------------
@pytest.mark.parametrize("sid", SCENARIO_IDS)
def test_every_scenario_runs_and_is_labelled(sid):
    res = post({"scenario": {"id": sid}})
    assert res.status_code == 200
    body = res.json()
    sc = body["scenario"]
    assert sc["id"] == sid and sc["is_baseline"] is False and sc["name"] and sc["assumptions"]
    assert "Modeled result" in sc["label"] and "Not a real-world forecast" in sc["label"]
    assert sc["changes"]["affected_region_count"] > 0
    # the full Phase 2-5 response is still there
    assert set(body) == {"meta", "scenario", "interventions", "config", "city", "summary", "regions", "grids", "timeline"}
    assert len(body["timeline"]["timestamps"]) == 61 and len(body["regions"]) == 25


def test_response_city_shows_the_modified_inputs():
    base = post({}).json()["city"]
    heavy = post({"scenario": {"id": "heavy_rainfall", "params": {"rainfall_multiplier": 2}}}).json()
    assert heavy["city"]["rainfall"][0][0] == base["rainfall"][0][0] * 2
    assert heavy["scenario"]["params"] == {"rainfall_multiplier": 2.0}
    assert heavy["scenario"]["changes"]["mean_rainfall_after"] == 2 * heavy["scenario"]["changes"]["mean_rainfall_before"]
    blocked = post({"scenario": {"id": "blocked_channel"}}).json()
    assert [row[2] for row in blocked["city"]["drainage_capacity"]] == [0.0] * 5
    assert blocked["scenario"]["changes"]["affected_regions"] == ["R1C3", "R2C3", "R3C3", "R4C3", "R5C3"]
    assert blocked["scenario"]["params"]["channel_cells"] == [[r, 2] for r in range(5)]


def test_scenario_outcomes_are_ordered():
    peak = lambda sid: post({"scenario": {"id": sid}}).json()["summary"]["max_water_level"]
    assert peak("normal_rainfall") < peak("baseline") < peak("heavy_rainfall") < peak("extreme_rainfall")
    base = post({}).json()["summary"]
    for sid in ("drainage_failure", "blocked_channel"):
        s = post({"scenario": {"id": sid}}).json()["summary"]
        assert s["earliest_critical_time"] < base["earliest_critical_time"]
        assert s["affected_population"] >= base["affected_population"]


def test_scenario_applies_on_top_of_rainfall_override_and_custom_city():
    body = post({"rainfall": 40, "scenario": {"id": "extreme_rainfall"}}).json()
    assert body["city"]["rainfall"] == [[80.0] * 5] * 5
    city = {"rows": 2, "cols": 3, "elevation": [[10.4, 10.2, 10.0], [10.3, 10.1, 9.9]],
            "drainage_capacity": 10, "population": 100, "rainfall": 60}
    blocked = post({"city": city, "scenario": {"id": "blocked_channel"}, "config": {"duration_minutes": 10}}).json()
    assert blocked["scenario"]["changes"]["affected_regions"] == ["R1C3", "R2C3"]
    assert blocked["meta"]["city_source"] == "custom"


@pytest.mark.parametrize("sid", SCENARIO_IDS)
def test_scenarios_are_deterministic(sid):
    body = {"scenario": {"id": sid}}
    assert post(body).json() == post(body).json()


# ---- validation ------------------------------------------------------------------
@pytest.mark.parametrize("scenario, field", [
    ({"id": "tsunami"}, "scenario.id"),
    ({"id": "heavy_rainfall", "params": {"rainfall_multiplier": 99}}, "scenario.params.rainfall_multiplier"),
    ({"id": "heavy_rainfall", "params": {"rain": 2}}, "scenario.params.rain"),
    ({"id": "drainage_failure", "params": {"drainage_remaining": -5}}, "scenario.params.drainage_remaining"),
    ({"id": "blocked_channel", "params": {"channel_cells": [[9, 9]]}}, "scenario.params.channel_cells"),
    ({"id": "heavy_rainfall", "params": [1, 2]}, "scenario.params"),
    ({"id": "heavy_rainfall", "extra": 1}, "scenario.extra"),
    ({"id": 7}, "scenario.id"),
])
def test_invalid_scenarios_are_clean_422s(scenario, field):
    res = post({"scenario": scenario})
    assert res.status_code == 422, res.text
    err = res.json()["error"]
    assert err["type"] == "validation_error"
    assert any(d["field"] == field for d in err["details"]), err

"""Phase 7: interventions through the HTTP API."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
IDS = ["unblock_drain", "increase_drainage", "activate_pump", "restore_channel"]
BLOCKED = {"scenario": {"id": "blocked_channel"}}


def post(body):
    return client.post("/api/simulate", json=body)


def test_catalogue_endpoint():
    body = client.get("/api/interventions").json()
    assert [i["id"] for i in body["interventions"]] == IDS
    assert body["max_interventions"] == 10 and body["max_drain_capacity"] == 1000
    pump = next(i for i in body["interventions"] if i["id"] == "activate_pump")
    assert (pump["target_mode"], pump["max_targets"]) == ("required", 5)
    assert pump["params"][0]["name"] == "pump_capacity" and pump["params"][0]["unit"] == "mm/h" and pump["assumptions"]
    modes = {i["id"]: i["target_mode"] for i in body["interventions"]}
    assert modes == {"unblock_drain": "required", "increase_drainage": "optional_all", "activate_pump": "required", "restore_channel": "channel"}


# ---- baseline preservation -------------------------------------------------------
def test_no_interventions_block_and_unchanged_baseline():
    body = post({}).json()
    assert body["interventions"] == {"count": 0, "changed_region_count": 0, "items": [], "label": "No interventions applied."}
    s = body["summary"]
    assert (s["critical_regions"], s["affected_population"], s["earliest_critical_time"], s["max_water_level"]) == (
        ["R4C3", "R5C3"], 10700, 33.0, 0.38421)
    assert post({"interventions": []}).json() == body


def test_baseline_is_unchanged_after_intervention_runs():
    before = post({}).json()
    for iid in IDS:
        assert post({**BLOCKED, "interventions": [{"id": iid, "targets": ["R5C3"]}]}).status_code == 200
    assert post({}).json() == before
    assert post(BLOCKED).json() == post(BLOCKED).json()


# ---- every intervention ----------------------------------------------------------
@pytest.mark.parametrize("iid", IDS)
def test_every_intervention_runs_and_is_labelled(iid):
    body = post({**BLOCKED, "interventions": [{"id": iid, "targets": ["R5C3"]}]}).json()
    iv = body["interventions"]
    assert iv["count"] == 1 and iv["items"][0]["id"] == iid and iv["items"][0]["targets"] == ["R5C3"]
    assert "Modeled intervention result" in iv["label"] and "Not a real-world forecast" in iv["label"]
    change = iv["items"][0]["changes"][0]
    assert change["region"] == "R5C3" and change["field"] == "drainage_capacity" and change["after"] > change["before"] == 0
    assert body["city"]["drainage_capacity"][4][2] == change["after"]          # echoed city = inputs actually simulated
    assert body["scenario"]["id"] == "blocked_channel"                          # scenario labelling still there
    assert set(body) == {"meta", "scenario", "interventions", "config", "city", "summary", "regions", "grids", "timeline"}
    assert len(body["timeline"]["timestamps"]) == 61


def test_pipeline_order_scenario_then_interventions():
    blocked = post(BLOCKED).json()
    fixed = post({**BLOCKED, "interventions": [{"id": "restore_channel"}]}).json()
    base = post({}).json()
    assert fixed["interventions"]["items"][0]["targets"] == ["R1C3", "R2C3", "R3C3", "R4C3", "R5C3"]
    assert fixed["interventions"]["changed_region_count"] == 5
    for key in ("summary", "timeline", "grids", "regions", "city"):
        assert fixed[key] == base[key]                                          # fully restored = baseline outcome
    assert blocked["summary"]["max_water_level"] > fixed["summary"]["max_water_level"]


def test_interventions_improve_the_modeled_outcome():
    base = post({}).json()["summary"]
    pumped = post({"interventions": [{"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 80}}]}).json()
    assert pumped["summary"]["max_water_level"] < base["max_water_level"]
    assert pumped["summary"]["affected_population"] <= base["affected_population"]
    r5c3 = next(r for r in pumped["regions"] if r["id"] == "R5C3")
    assert r5c3["time_to_critical"] is None or r5c3["time_to_critical"] > 33
    assert pumped["interventions"]["items"][0]["params"] == {"pump_capacity": 80.0}


def test_multiple_interventions_and_custom_city():
    city = {"rows": 2, "cols": 2, "elevation": [[10.2, 10.1], [10.1, 10.0]], "drainage_capacity": 10,
            "population": 50, "rainfall": 90, "region_ids": [["north-west", "north-east"], ["south-west", "south-east"]]}
    body = post({"city": city, "scenario": {"id": "drainage_failure", "params": {"drainage_remaining": 0}},
                 "interventions": [{"id": "unblock_drain", "targets": ["south-east"]},
                                   {"id": "activate_pump", "targets": ["south-east"], "params": {"pump_capacity": 30}}],
                 "config": {"duration_minutes": 20}}).json()
    assert body["city"]["drainage_capacity"] == [[0.0, 0.0], [0.0, 40.0]]
    assert [(c["before"], c["after"]) for i in body["interventions"]["items"] for c in i["changes"]] == [(0.0, 10.0), (10.0, 40.0)]
    assert body["interventions"]["count"] == 2 and body["interventions"]["changed_region_count"] == 1


def test_no_change_intervention_is_reported_not_rejected():
    item = post({"interventions": [{"id": "unblock_drain", "targets": ["R1C1"]}]}).json()["interventions"]["items"][0]
    assert item["changes"] == [] and "No input changed" in item["note"]


@pytest.mark.parametrize("iid", IDS)
def test_deterministic(iid):
    body = {**BLOCKED, "interventions": [{"id": iid, "targets": ["R4C3", "R5C3"]}]}
    assert post(body).json() == post(body).json()


# ---- validation ------------------------------------------------------------------
@pytest.mark.parametrize("interventions, field", [
    ([{"id": "dam"}], "interventions.0.id"),
    ([{"targets": ["R5C3"]}], "interventions.0.id"),
    ([{"id": "activate_pump"}], "interventions.0.targets"),
    ([{"id": "activate_pump", "targets": ["R6C1"]}], "interventions.0.targets"),
    ([{"id": "activate_pump", "targets": "R5C3"}], "interventions.0.targets"),
    ([{"id": "increase_drainage"}, {"id": "unblock_drain", "targets": ["nope"]}], "interventions.1.targets"),
    ([{"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 9999}}], "interventions.0.params.pump_capacity"),
    ([{"id": "activate_pump", "targets": ["R5C3"], "params": {"speed": 1}}], "interventions.0.params.speed"),
    ([{"id": "activate_pump", "targets": ["R5C3"], "when": 10}], "interventions.0.when"),
    ([{"id": "increase_drainage"}] * 11, "interventions"),
    ({"id": "activate_pump"}, "interventions"),
])
def test_invalid_interventions_are_clean_422s(interventions, field):
    res = post({"interventions": interventions})
    assert res.status_code == 422, res.text
    err = res.json()["error"]
    assert err["type"] == "validation_error" and any(d["field"] == field for d in err["details"]), err


def test_health_scenarios_and_cors_still_work():
    assert client.get("/api/health").json()["status"] == "ok"
    assert len(client.get("/api/scenarios").json()["scenarios"]) == 6
    res = client.get("/api/interventions", headers={"Origin": "http://localhost:5173"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"

"""Phase 2 tests: POST /api/simulate through the real FastAPI app."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulation import SimulationConfig, create_synthetic_city, run_simulation

client = TestClient(app)

SMALL_CITY = {
    "rows": 2, "cols": 3,
    "elevation": [[10.4, 10.2, 10.0], [10.3, 10.1, 9.9]],
    "drainage_capacity": 10,
    "population": [[100, 200, 300], [400, 500, 600]],
    "rainfall": 60,
}


def post(body):
    return client.post("/api/simulate", json=body)


def assert_error(res, field_contains):
    assert res.status_code == 422, res.text
    err = res.json()["error"]
    assert err["type"] == "validation_error" and err["message"]
    assert any(field_contains in d["field"] for d in err["details"]), err


# ---- success paths ---------------------------------------------------------------
def test_empty_body_runs_synthetic_city_and_matches_engine():
    res = post({})
    assert res.status_code == 200
    body = res.json()
    direct = run_simulation(create_synthetic_city(), SimulationConfig())
    assert body["meta"]["city_source"] == "synthetic"
    assert body["summary"]["critical_regions"] == direct.critical_regions == ["R4C3", "R5C3"]
    assert body["summary"]["warning_regions"] == direct.warning_regions
    assert body["summary"]["affected_population"] == direct.affected_population == 10700
    assert body["summary"]["earliest_critical_region"] == "R5C3"
    assert body["summary"]["earliest_critical_time"] == 33.0
    assert np.allclose(body["timeline"]["water_levels"], direct.water_levels, atol=1e-5)


def test_response_structure_is_consistent():
    body = post({"city": SMALL_CITY, "config": {"duration_minutes": 10, "timestep_minutes": 0.5}}).json()
    assert set(body) == {"meta", "scenario", "interventions", "config", "city", "summary", "regions", "grids", "timeline"}
    n = body["meta"]["num_steps"] + 1
    assert n == 21
    tl = body["timeline"]
    assert all(len(v) == n for v in tl.values())           # every series aligned with timestamps
    assert tl["timestamps"][0] == 0 and tl["timestamps"][-1] == 10
    assert np.array(tl["water_levels"]).shape == (n, 2, 3)
    assert tl["risk_levels"][0][0][0] == "SAFE"
    assert tl["safe_region_count"][0] + tl["warning_region_count"][0] + tl["critical_region_count"][0] == 6
    assert len(body["regions"]) == 6
    first = body["regions"][0]
    assert (first["id"], first["row"], first["col"], first["population"]) == ("R1C1", 0, 0, 100)
    assert body["grids"]["final_water_level"] == tl["water_levels"][-1]
    assert body["city"]["rainfall"] == [[60.0] * 3] * 2      # scalar broadcast is echoed as a grid
    assert body["meta"]["units"]["rainfall"] == "mm/h"


def test_custom_city_time_to_critical_and_nulls():
    city = {"rows": 1, "cols": 2, "elevation": 10, "drainage_capacity": 0, "population": [[50, 70]],
            "rainfall": [[60, 0]]}
    cfg = {"duration_minutes": 20, "warning_threshold": 0.005, "critical_threshold": 0.0095, "flow_rate": 0}
    body = post({"city": city, "config": cfg}).json()
    r1, r2 = body["regions"]
    assert r1["time_to_critical"] == 10.0 and r1["first_critical_time"] == 10.0
    assert r2["time_to_critical"] is None and r2["peak_risk"] == "SAFE"
    assert body["summary"]["critical_population"] == 50
    assert body["config"]["critical_threshold"] == 0.0095


def test_no_critical_gives_null_summary_fields():
    body = post({"rainfall": 0, "config": {"duration_minutes": 5}}).json()
    assert body["summary"]["critical_regions"] == []
    assert body["summary"]["earliest_critical_region"] is None
    assert body["summary"]["earliest_critical_time"] is None


def test_rainfall_override_uniform_and_grid():
    low = post({"rainfall": 10}).json()
    high = post({"rainfall": 150}).json()
    assert low["city"]["rainfall"][0][0] == 10
    assert high["summary"]["max_water_level"] > low["summary"]["max_water_level"]
    grid = [[0.0] * 3, [0.0, 0.0, 120.0]]
    body = post({"city": SMALL_CITY, "rainfall": grid, "config": {"duration_minutes": 5}}).json()
    assert body["city"]["rainfall"] == grid


def test_thresholds_change_classification():
    strict = post({"config": {"warning_threshold": 0.02, "critical_threshold": 0.05}}).json()
    default = post({}).json()
    assert strict["summary"]["critical_region_count"] > default["summary"]["critical_region_count"]


def test_mass_balance_reported():
    s = post({}).json()["summary"]
    assert s["total_final_water"] == pytest.approx(
        s["total_initial_water"] + s["total_rainfall"] - s["total_drained"], abs=1e-4)


def test_barrier_and_region_ids_accepted():
    city = {**SMALL_CITY, "region_ids": [["a", "b", "c"], ["d", "e", "f"]],
            "barrier": [[False, True, False], [False, False, False]]}
    body = post({"city": city, "config": {"duration_minutes": 5}}).json()
    assert body["regions"][1]["id"] == "b" and body["city"]["barrier"][0][1] is True


def test_deterministic():
    assert post({}).json() == post({}).json()


# ---- validation ------------------------------------------------------------------
@pytest.mark.parametrize("patch, field", [
    ({"rows": 0}, "city.rows"),
    ({"rows": 101}, "city.rows"),
    ({"elevation": [[1, 2], [3, 4]]}, "city"),            # wrong shape
    ({"rainfall": -5}, "city"),
    ({"population": 1.5}, "city"),
    ({"drainage_capacity": "lots"}, "city.drainage_capacity"),
    ({"region_ids": [["x", "x", "x"], ["x", "x", "x"]]}, "city"),
    ({"elevaton": 3}, "city.elevaton"),                   # typo is rejected, not ignored
])
def test_invalid_city(patch, field):
    assert_error(post({"city": {**SMALL_CITY, **patch}}), field)


@pytest.mark.parametrize("patch", [
    {"population": 1e30}, {"elevation": [[1e308, -1e308, 0], [0, 0, 0]]}, {"initial_water": 1e308}, {"rainfall": 1e300},
])
def test_absurd_magnitudes_are_422_not_500_or_garbage(patch):
    assert_error(post({"city": {**SMALL_CITY, **patch}}), "city")


def test_rainfall_override_beyond_range_is_rejected():
    assert_error(post({"rainfall": 1e300}), "rainfall")


def test_missing_required_city_field():
    city = {k: v for k, v in SMALL_CITY.items() if k != "elevation"}
    assert_error(post({"city": city}), "city.elevation")


@pytest.mark.parametrize("cfg, field", [
    ({"timestep_minutes": 0}, "config.timestep_minutes"),
    ({"duration_minutes": -1}, "config.duration_minutes"),
    ({"duration_minutes": 10, "timestep_minutes": 3}, "config"),
    ({"duration_minutes": 5, "timestep_minutes": 10}, "config"),
    ({"warning_threshold": 0.5, "critical_threshold": 0.2}, "config"),
    ({"flow_rate": 0.9}, "config"),
    ({"duration_minutes": 100000}, "config"),             # too many steps
])
def test_invalid_config(cfg, field):
    res = post({"config": cfg})
    assert_error(res, field)


def test_invalid_rainfall_override():
    assert_error(post({"rainfall": -1}), "rainfall")
    assert_error(post({"rainfall": [[1, 2], [3, 4]]}), "rainfall")   # 2x2 on a 5x5 city


def test_payload_size_guard():
    city = {"rows": 100, "cols": 100, "elevation": 1, "drainage_capacity": 0, "population": 0}
    assert_error(post({"city": city, "config": {"duration_minutes": 600}}), "config")


def test_malformed_json_is_a_clean_error():
    res = client.post("/api/simulate", content="{not json", headers={"Content-Type": "application/json"})
    assert res.status_code == 422 and res.json()["error"]["type"] == "validation_error"


# ---- regression: health + CORS ---------------------------------------------------
def test_health_still_works():
    res = client.get("/api/health")
    assert res.status_code == 200 and res.json()["status"] == "ok"


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173"])
def test_cors_preflight_for_simulate(origin):
    res = client.options("/api/simulate", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"})
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == origin


def test_cors_header_on_post_and_on_errors():
    h = {"Origin": "http://localhost:5173"}
    assert client.post("/api/simulate", json={}, headers=h).headers["access-control-allow-origin"] == h["Origin"]
    bad = client.post("/api/simulate", json={"rainfall": -1}, headers=h)
    assert bad.status_code == 422 and bad.headers["access-control-allow-origin"] == h["Origin"]


def test_cors_rejects_unknown_origin():
    res = client.post("/api/simulate", json={}, headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in res.headers

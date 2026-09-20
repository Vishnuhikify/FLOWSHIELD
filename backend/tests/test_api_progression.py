"""Phase 4: the timestep data the dashboard animates must be internally consistent."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
RANK = {"SAFE": 0, "WARNING": 1, "CRITICAL": 2}


@pytest.fixture(scope="module", params=[1.0, 0.5])
def body(request):
    res = client.post("/api/simulate", json={"config": {"duration_minutes": 60, "timestep_minutes": request.param}})
    assert res.status_code == 200
    return res.json()


def test_timestamps_are_evenly_spaced_from_zero(body):
    ts = body["timeline"]["timestamps"]
    dt = body["config"]["timestep_minutes"]
    assert ts[0] == 0 and ts[-1] == 60 and len(ts) == body["meta"]["num_steps"] + 1
    assert np.allclose(np.diff(ts), dt)


def test_every_timestep_has_a_full_grid_and_counts_cover_all_regions(body):
    tl, n = body["timeline"], body["meta"]["rows"] * body["meta"]["cols"]
    for i in range(len(tl["timestamps"])):
        assert np.array(tl["water_levels"][i]).shape == (5, 5)
        assert tl["safe_region_count"][i] + tl["warning_region_count"][i] + tl["critical_region_count"][i] == n


def test_per_step_counts_and_population_match_the_risk_grids(body):
    tl, pop = body["timeline"], np.array(body["city"]["population"])
    for i, grid in enumerate(tl["risk_levels"]):
        g = np.array(grid)
        assert tl["critical_region_count"][i] == (g == "CRITICAL").sum()
        assert tl["warning_region_count"][i] == (g == "WARNING").sum()
        assert tl["critical_population"][i] == pop[g == "CRITICAL"].sum()
        assert tl["warning_population"][i] == pop[g == "WARNING"].sum()
        assert tl["affected_population"][i] == tl["critical_population"][i] + tl["warning_population"][i]
        assert tl["max_water"][i] == pytest.approx(np.max(tl["water_levels"][i]))


def test_risk_grid_follows_depth_and_thresholds_at_every_step(body):
    warn, crit = body["config"]["warning_threshold"], body["config"]["critical_threshold"]
    water = np.array(body["timeline"]["water_levels"])
    risk = np.array(body["timeline"]["risk_levels"])
    clear = np.abs(water - warn) > 1e-4                      # skip cells sitting on a rounding edge
    clear &= np.abs(water - crit) > 1e-4
    expected = np.where(water >= crit, "CRITICAL", np.where(water >= warn, "WARNING", "SAFE"))
    assert np.array_equal(risk[clear], expected[clear])


def test_forecast_fields_agree_with_the_timeline(body):
    tl = body["timeline"]
    for r in body["regions"]:
        series = [tl["risk_levels"][i][r["row"]][r["col"]] for i in range(len(tl["timestamps"]))]
        assert r["peak_risk"] == max(series, key=RANK.get)
        assert r["final_risk"] == series[-1]
        first = next((tl["timestamps"][i] for i, s in enumerate(series) if s == "CRITICAL"), None)
        assert r["time_to_critical"] == first
    s = body["summary"]
    first_city = next((t for t, c in zip(tl["timestamps"], tl["critical_region_count"]) if c > 0), None)
    assert s["earliest_critical_time"] == first_city == 33.0


def test_initial_frame_is_the_city_initial_water():
    body = client.post("/api/simulate", json={}).json()
    assert np.allclose(body["timeline"]["water_levels"][0], body["city"]["initial_water"])


def test_current_state_differs_from_end_of_run_forecast():
    body = client.post("/api/simulate", json={}).json()
    tl, s = body["timeline"], body["summary"]
    assert tl["critical_region_count"][0] == 0 and s["critical_region_count"] == 2
    assert tl["affected_population"][10] < s["affected_population"]

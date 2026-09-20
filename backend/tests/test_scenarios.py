"""Phase 6: scenario transforms (pure input changes) and their effect through the unchanged engine."""
import numpy as np
import pytest

from app.scenarios import BASELINE_ID, SCENARIOS, ScenarioError, apply_scenario, default_channel_cells, list_scenarios
from app.simulation import CityGrid, SimulationConfig, create_synthetic_city, run_simulation

ALL = ["baseline", "normal_rainfall", "heavy_rainfall", "extreme_rainfall", "drainage_failure", "blocked_channel"]
CHANNEL = ["R1C3", "R2C3", "R3C3", "R4C3", "R5C3"]


@pytest.fixture()
def city():
    return create_synthetic_city()


def run(city, sid, params=None):
    new_city, _, _ = apply_scenario(city, sid, params)
    return run_simulation(new_city, SimulationConfig())


# ---- catalogue -------------------------------------------------------------------
def test_catalogue_has_the_five_scenarios_plus_baseline():
    assert [s.id for s in list_scenarios()] == ALL
    for s in list_scenarios():
        assert s.name and s.description and s.assumptions
        for p in s.params:
            if p.kind == "number":
                assert p.minimum <= p.default <= p.maximum


# ---- baseline preservation -------------------------------------------------------
def test_baseline_changes_nothing(city):
    new_city, params, changes = apply_scenario(city)
    assert new_city is city and params == {}
    assert changes["affected_region_count"] == 0
    assert changes["mean_rainfall_before"] == changes["mean_rainfall_after"]


@pytest.mark.parametrize("sid", ALL)
def test_scenarios_never_mutate_the_input_city(city, sid):
    before = {f: np.array(getattr(city, f)) for f in ("rainfall", "drainage_capacity", "elevation", "initial_water", "population")}
    apply_scenario(city, sid)
    for f, arr in before.items():
        assert np.array_equal(getattr(city, f), arr)
    base = run_simulation(city)
    assert base.critical_regions == ["R4C3", "R5C3"] and base.affected_population == 10700


@pytest.mark.parametrize("sid", ALL)
def test_scenarios_only_touch_rainfall_and_drainage(city, sid):
    new_city, _, _ = apply_scenario(city, sid)
    for f in ("elevation", "initial_water", "population", "barrier", "region_ids"):
        assert np.array_equal(getattr(new_city, f), getattr(city, f))
    assert isinstance(new_city, CityGrid)


# ---- each scenario ---------------------------------------------------------------
@pytest.mark.parametrize("sid, k", [("normal_rainfall", 0.3), ("heavy_rainfall", 1.3), ("extreme_rainfall", 2.0)])
def test_rainfall_scenarios_scale_the_pattern(city, sid, k):
    new_city, params, changes = apply_scenario(city, sid)
    assert params == {"rainfall_multiplier": k}
    assert np.allclose(new_city.rainfall, city.rainfall * k)
    assert np.array_equal(new_city.drainage_capacity, city.drainage_capacity)
    assert changes["mean_rainfall_after"] == pytest.approx(changes["mean_rainfall_before"] * k, abs=1e-3)


def test_rainfall_multiplier_is_configurable(city):
    new_city, params, _ = apply_scenario(city, "heavy_rainfall", {"rainfall_multiplier": 1.75})
    assert params["rainfall_multiplier"] == 1.75 and np.allclose(new_city.rainfall, city.rainfall * 1.75)


def test_drainage_failure(city):
    new_city, params, changes = apply_scenario(city, "drainage_failure")
    assert params == {"drainage_remaining": 20.0, "rainfall_multiplier": 1.0}
    assert np.allclose(new_city.drainage_capacity, city.drainage_capacity * 0.2)
    assert np.array_equal(new_city.rainfall, city.rainfall)
    assert changes["affected_region_count"] == 25
    total, _, _ = apply_scenario(city, "drainage_failure", {"drainage_remaining": 0})
    assert not total.drainage_capacity.any()
    same, _, ch = apply_scenario(city, "drainage_failure", {"drainage_remaining": 100})
    assert np.array_equal(same.drainage_capacity, city.drainage_capacity) and ch["affected_region_count"] == 0


def test_blocked_channel_default_is_the_valley(city):
    assert default_channel_cells(city) == [(r, 2) for r in range(5)]
    new_city, params, changes = apply_scenario(city, "blocked_channel")
    assert params["channel_cells"] == [[r, 2] for r in range(5)] and params["channel_remaining"] == 0.0
    assert changes["affected_regions"] == CHANNEL
    assert not new_city.drainage_capacity[:, 2].any()
    others = np.ones((5, 5), bool); others[:, 2] = False
    assert np.array_equal(new_city.drainage_capacity[others], city.drainage_capacity[others])


def test_blocked_channel_custom_cells_and_partial_block(city):
    new_city, params, changes = apply_scenario(city, "blocked_channel",
                                               {"channel_cells": [[4, 2], [3, 2], [4, 2]], "channel_remaining": 50})
    assert params["channel_cells"] == [[3, 2], [4, 2]]            # de-duplicated, sorted
    assert changes["affected_regions"] == ["R4C3", "R5C3"]
    assert new_city.drainage_capacity[4, 2] == city.drainage_capacity[4, 2] * 0.5
    assert new_city.drainage_capacity[0, 2] == city.drainage_capacity[0, 2]


def test_default_channel_works_on_any_grid():
    flat = CityGrid(rows=3, cols=4, elevation=5, rainfall=10, drainage_capacity=10, initial_water=0, population=1)
    assert default_channel_cells(flat) == [(0, 0), (1, 0), (2, 0)]          # ties -> first column, deterministic
    new_city, _, _ = apply_scenario(flat, "blocked_channel")
    assert not new_city.drainage_capacity[:, 0].any()


# ---- through the engine ----------------------------------------------------------
def test_rainfall_scenarios_are_ordered_by_severity(city):
    peaks = [run(city, sid).max_water_overall for sid in ("normal_rainfall", "baseline", "heavy_rainfall", "extreme_rainfall")]
    assert peaks == sorted(peaks) and len(set(peaks)) == 4
    assert run(city, "normal_rainfall").critical_regions == []
    assert len(run(city, "extreme_rainfall").critical_regions) > len(run(city, "baseline").critical_regions)


def test_drainage_scenarios_are_worse_than_baseline(city):
    base = run(city, "baseline")
    for sid in ("drainage_failure", "blocked_channel"):
        res = run(city, sid)
        assert np.all(res.maximum_water_level >= base.maximum_water_level - 1e-12)
        assert res.max_water_overall > base.max_water_overall
        assert res.earliest_critical_time < base.earliest_critical_time
        assert res.total_drained < base.total_drained


def test_blocked_channel_is_local_but_failure_is_citywide(city):
    blocked, failed = run(city, "blocked_channel"), run(city, "drainage_failure")
    assert failed.total_drained < blocked.total_drained


@pytest.mark.parametrize("sid", ALL)
def test_engine_invariants_hold_in_every_scenario(city, sid):
    res = run(city, sid)
    assert res.water_levels.min() >= 0 and np.all(np.isfinite(res.water_levels))
    expected = res.total_initial_water + res.total_rainfall - res.total_drained
    assert res.final_water_level.sum() == pytest.approx(expected, abs=1e-9)


@pytest.mark.parametrize("sid", ALL)
def test_scenarios_are_deterministic(city, sid):
    a, pa, ca = apply_scenario(city, sid)
    b, pb, cb = apply_scenario(create_synthetic_city(), sid)
    assert pa == pb and ca == cb and np.array_equal(a.rainfall, b.rainfall)
    assert np.array_equal(run_simulation(a).water_levels, run_simulation(b).water_levels)


# ---- validation ------------------------------------------------------------------
@pytest.mark.parametrize("sid, params, field", [
    ("tsunami", {}, "scenario.id"),
    ("heavy_rainfall", {"rainfall_multiplier": -1}, "scenario.params.rainfall_multiplier"),
    ("heavy_rainfall", {"rainfall_multiplier": 5.01}, "scenario.params.rainfall_multiplier"),
    ("heavy_rainfall", {"rainfall_multiplier": "lots"}, "scenario.params.rainfall_multiplier"),
    ("heavy_rainfall", {"rainfall_multiplier": True}, "scenario.params.rainfall_multiplier"),
    ("heavy_rainfall", {"rainfall_multiplier": float("nan")}, "scenario.params.rainfall_multiplier"),
    ("heavy_rainfall", {"drainage_remaining": 10}, "scenario.params.drainage_remaining"),
    ("baseline", {"rainfall_multiplier": 2}, "scenario.params.rainfall_multiplier"),
    ("drainage_failure", {"drainage_remaining": 101}, "scenario.params.drainage_remaining"),
    ("blocked_channel", {"channel_cells": [[5, 0]]}, "scenario.params.channel_cells"),
    ("blocked_channel", {"channel_cells": [[0, -1]]}, "scenario.params.channel_cells"),
    ("blocked_channel", {"channel_cells": [[0]]}, "scenario.params.channel_cells"),
    ("blocked_channel", {"channel_cells": [[0.5, 1]]}, "scenario.params.channel_cells"),
    ("blocked_channel", {"channel_cells": "R1C1"}, "scenario.params.channel_cells"),
])
def test_invalid_scenario_input(city, sid, params, field):
    with pytest.raises(ScenarioError) as err:
        apply_scenario(city, sid, params)
    assert err.value.field == field and err.value.message


def test_baseline_id_constant():
    assert BASELINE_ID == "baseline" and BASELINE_ID in SCENARIOS

"""Phase 1 tests for the simulation engine. All deterministic - no randomness, no I/O."""
import numpy as np
import pytest

from app.simulation import (CityGrid, RiskLevel, SimulationConfig, create_synthetic_city,
                            get_neighbors, run_simulation, step, with_rainfall)
from app.simulation.drainage import compute_drainage
from app.simulation.flow import compute_flow
from app.simulation.risk import classify_risk, first_critical_steps, population_metrics

MM_H = 1 / 1000 / 60  # mm/h -> m/min


def flat_city(rows=3, cols=3, **kw):
    base = dict(rows=rows, cols=cols, elevation=10.0, rainfall=0.0, drainage_capacity=0.0,
                initial_water=0.0, population=100)
    base.update(kw)
    return CityGrid(**base)


# 1. Grid creation -----------------------------------------------------------------
def test_grid_creation_and_scalar_broadcast():
    city = flat_city(2, 4, rainfall=50)
    assert city.shape == (2, 4)
    assert city.rainfall.shape == (2, 4) and np.all(city.rainfall == 50)
    assert city.region_ids[0, 0] == "R1C1" and city.region_ids[1, 3] == "R2C4"
    assert city.total_population == 800


def test_synthetic_city_is_5x5_varied_and_deterministic():
    a, b = create_synthetic_city(), create_synthetic_city()
    assert a.shape == (5, 5)
    for f in ("elevation", "rainfall", "drainage_capacity", "population"):
        assert len(np.unique(getattr(a, f))) > 3
        assert np.array_equal(getattr(a, f), getattr(b, f))


def test_neighbors_handle_boundaries():
    city = flat_city(3, 3)
    assert set(get_neighbors(city, 0, 0)) == {"down", "right"}
    assert set(get_neighbors(city, 0, 1)) == {"down", "left", "right"}
    assert len(get_neighbors(city, 1, 1)) == 4
    assert get_neighbors(flat_city(1, 1), 0, 0) == {}
    with pytest.raises(IndexError):
        get_neighbors(city, 3, 0)


@pytest.mark.parametrize("kw", [
    dict(rows=0), dict(cols=-1), dict(rows=2.5), dict(elevation=[[1, 2], [3, 4]]),
    dict(rainfall=-1), dict(drainage_capacity=-5), dict(initial_water=-0.1),
    dict(population=-3), dict(population=1.5), dict(elevation=float("nan")),
    dict(rainfall=float("inf")), dict(region_ids=[["a"] * 3] * 3),
    # audit: absurd magnitudes used to overflow silently (int64 population) or crash the engine
    dict(population=1e30), dict(elevation=1e308), dict(elevation=-1e6), dict(rainfall=1e300),
    dict(drainage_capacity=1e8), dict(initial_water=1e308),
    dict(elevation=[[1, 2, 3], [4, 5], [6, 7, 8]]),                       # ragged grid
])
def test_invalid_city_rejected(kw):
    with pytest.raises(ValueError):
        flat_city(**kw)


@pytest.mark.parametrize("kw", [
    dict(timestep_minutes=0), dict(timestep_minutes=-1), dict(duration_minutes=0),
    dict(duration_minutes=-10), dict(duration_minutes=10, timestep_minutes=20),
    dict(duration_minutes=10, timestep_minutes=3), dict(warning_threshold=0),
    dict(warning_threshold=0.3, critical_threshold=0.3), dict(flow_rate=-0.1),
    dict(flow_rate=0.5), dict(timestep_minutes=5, flow_rate=0.1),
    dict(duration_minutes=float("nan")), dict(timestep_minutes="1"),
])
def test_invalid_config_rejected(kw):
    with pytest.raises(ValueError):
        SimulationConfig(**kw)


def test_shape_errors_are_readable():
    with pytest.raises(ValueError, match="one number or a 3x3 grid"):
        flat_city(elevation=[[1, 2, 3], [4, 5], [6, 7, 8]])


def test_values_at_the_limits_are_accepted():
    city = flat_city(population=10**9, rainfall=1e7, elevation=-1e5)
    assert city.total_population == 9 * 10**9 and city.population.dtype == np.int64


# 2. Rainfall ----------------------------------------------------------------------
def test_uniform_rainfall_accumulates_exactly():
    city = flat_city(rainfall=60)  # 60 mm/h = 1 mm/min; flat city -> no flow
    res = run_simulation(city, SimulationConfig(duration_minutes=30))
    assert np.allclose(res.final_water_level, 0.030)
    assert res.total_rainfall == pytest.approx(0.030 * 9)


def test_per_cell_rainfall_and_override():
    rain = np.zeros((3, 3)); rain[0, 0] = 120
    city = with_rainfall(flat_city(), rain)
    res = run_simulation(city, SimulationConfig(duration_minutes=10, flow_rate=0))
    assert res.final_water_level[0, 0] == pytest.approx(0.020)
    assert res.final_water_level.sum() == pytest.approx(0.020)


def test_zero_rainfall_dry_city_stays_dry():
    res = run_simulation(flat_city(drainage_capacity=50))
    assert np.all(res.water_levels == 0)
    assert res.critical_regions == [] and res.affected_population == 0


# 3. Drainage ----------------------------------------------------------------------
def test_drainage_removes_capacity():
    drained = compute_drainage(np.full((2, 2), 0.5), np.full((2, 2), 60.0), timestep=1)
    assert np.allclose(drained, 0.001)


def test_drainage_never_exceeds_current_water():
    water = np.array([[0.0, 0.0004], [0.001, 1.0]])
    drained = compute_drainage(water, np.full((2, 2), 60.0), timestep=1)
    assert np.all(drained <= water)
    assert drained[0, 0] == 0 and drained[0, 1] == pytest.approx(0.0004)


def test_zero_drainage_keeps_all_water():
    res = run_simulation(flat_city(initial_water=0.2), SimulationConfig(duration_minutes=10))
    assert np.allclose(res.final_water_level, 0.2) and res.total_drained == 0


# 4. Water movement ----------------------------------------------------------------
def test_water_moves_downhill_only():
    elev = np.array([[10.0, 9.0, 8.0]])
    water = np.array([[0.1, 0.0, 0.0]])
    inc, out = compute_flow(water, elev, flow_rate=0.1, timestep=1)
    assert out[0, 0] > 0 and inc[0, 1] == pytest.approx(out[0, 0])
    assert inc[0, 0] == 0          # nothing flows uphill
    assert out[0, 1] == 0          # dry cell has nothing to give


def test_flat_water_surface_does_not_move():
    inc, out = compute_flow(np.full((3, 3), 0.2), np.full((3, 3), 5.0), 0.1, 1)
    assert not inc.any() and not out.any()


def test_pond_levels_out_symmetrically():
    water = np.zeros((3, 3)); water[1, 1] = 0.9
    res = run_simulation(flat_city(initial_water=water), SimulationConfig(duration_minutes=240))
    final = res.final_water_level
    assert np.allclose(final, 0.1, atol=1e-3)               # spreads to a level surface
    assert np.allclose(final, final.T) and np.allclose(final, final[::-1, ::-1])


def test_barrier_cell_is_isolated():
    water = np.zeros((3, 3)); water[1, 1] = 0.5
    barrier = np.zeros((3, 3), bool); barrier[1, 1] = True
    res = run_simulation(flat_city(initial_water=water, barrier=barrier))
    assert res.final_water_level[1, 1] == pytest.approx(0.5)
    assert res.final_water_level.sum() == pytest.approx(0.5)


def test_single_cell_grid_runs():
    res = run_simulation(flat_city(1, 1, rainfall=60, drainage_capacity=30),
                         SimulationConfig(duration_minutes=10))
    assert res.final_water_level[0, 0] == pytest.approx(0.005)


# 5. Conservation ------------------------------------------------------------------
def test_flow_alone_conserves_water():
    city = create_synthetic_city()
    water = np.full(city.shape, 0.05)
    inc, out = compute_flow(water, city.elevation, 0.25, 1)
    assert inc.sum() == pytest.approx(out.sum(), abs=1e-12)


def test_full_simulation_mass_balance():
    res = run_simulation(create_synthetic_city())
    expected = res.total_initial_water + res.total_rainfall - res.total_drained
    assert res.final_water_level.sum() == pytest.approx(expected, abs=1e-9)


# 6. Negative-water prevention -----------------------------------------------------
def test_outflow_capped_by_available_water():
    elev = np.array([[50.0, 0.0], [0.0, 0.0]])   # huge drop, tiny puddle
    water = np.array([[0.001, 0.0], [0.0, 0.0]])
    inc, out = compute_flow(water, elev, 0.25, 1)
    assert out[0, 0] == pytest.approx(0.001)
    assert np.all(water + inc - out >= 0)


def test_water_never_negative_under_stress():
    city = with_rainfall(create_synthetic_city(), 0)
    city = CityGrid(**{**city.__dict__, "drainage_capacity": 5000})
    res = run_simulation(city, SimulationConfig(flow_rate=0.25))
    assert res.water_levels.min() >= 0
    assert np.allclose(res.final_water_level, 0)


def test_very_high_rainfall_stays_finite():
    res = run_simulation(with_rainfall(create_synthetic_city(), 1e6))
    assert np.all(np.isfinite(res.water_levels)) and res.water_levels.min() >= 0
    assert len(res.critical_regions) == 25


# 7. Risk classification -----------------------------------------------------------
def test_risk_classification_thresholds_inclusive():
    water = np.array([[0.0, 0.149, 0.15], [0.299, 0.30, 2.0]])
    risk = classify_risk(water, 0.15, 0.30)
    S, W, C = RiskLevel.SAFE, RiskLevel.WARNING, RiskLevel.CRITICAL
    assert risk.tolist() == [[S, S, W], [W, C, C]]


def test_thresholds_are_configurable():
    city = flat_city(initial_water=0.2)
    assert len(run_simulation(city, SimulationConfig(duration_minutes=1)).warning_regions) == 9
    strict = SimulationConfig(duration_minutes=1, warning_threshold=0.05, critical_threshold=0.1)
    assert len(run_simulation(city, strict).critical_regions) == 9


# 8. Critical time -----------------------------------------------------------------
def test_first_critical_steps_helper():
    C = int(RiskLevel.CRITICAL)
    risk = np.array([[[0, 0]], [[1, 0]], [[C, 0]], [[1, 0]], [[C, 0]]])
    assert first_critical_steps(risk).tolist() == [[2, -1]]


def test_time_to_critical_known_answer():
    # 60 mm/h = 1 mm/min, no flow, no drainage. Threshold sits between 9 mm and 10 mm -> minute 10.
    res = run_simulation(flat_city(1, 2, rainfall=[[60, 0]]), SimulationConfig(
        duration_minutes=20, warning_threshold=0.005, critical_threshold=0.0095, flow_rate=0))
    assert res.time_to_critical == {"R1C1": 10.0, "R1C2": None}
    assert res.first_critical_step == {"R1C1": 10, "R1C2": None}
    assert (res.earliest_critical_region, res.earliest_critical_time) == ("R1C1", 10.0)


def test_time_to_critical_respects_timestep():
    res = run_simulation(flat_city(1, 1, rainfall=60), SimulationConfig(
        duration_minutes=20, timestep_minutes=0.5, warning_threshold=0.005, critical_threshold=0.00975))
    assert res.time_to_critical["R1C1"] == 10.0 and res.first_critical_step["R1C1"] == 20


def test_never_critical_returns_none():
    res = run_simulation(flat_city())
    assert all(v is None for v in res.time_to_critical.values())
    assert res.earliest_critical_region is None and res.earliest_critical_time is None


def test_critical_at_start_is_time_zero():
    res = run_simulation(flat_city(1, 1, initial_water=1.0), SimulationConfig(duration_minutes=5))
    assert res.time_to_critical["R1C1"] == 0.0


# 9. Population --------------------------------------------------------------------
def test_population_metrics():
    peak = np.array([[0, 1], [2, 2]])
    pop = np.array([[10, 20], [30, 40]])
    assert population_metrics(peak, pop) == {
        "total_population": 100, "critical_population": 70,
        "warning_population": 20, "affected_population": 90}


def test_region_counted_once_under_worst_level():
    res = run_simulation(create_synthetic_city())
    assert not set(res.critical_regions) & set(res.warning_regions)
    assert res.affected_population == res.warning_population + res.critical_population
    assert res.affected_population <= res.total_population


# 10. Full simulation --------------------------------------------------------------
def test_full_simulation_structure():
    res = run_simulation(create_synthetic_city(), SimulationConfig())
    assert res.timestamps[0] == 0 and res.timestamps[-1] == 60 and len(res.timestamps) == 61
    assert res.water_levels.shape == res.risk_levels.shape == (61, 5, 5)
    assert np.array_equal(res.final_water_level, res.water_levels[-1])
    assert np.array_equal(res.maximum_water_level, res.water_levels.max(axis=0))
    assert len(res.time_to_critical) == 25
    assert len(res.population_timeline["critical"]) == 61
    # the demo city must actually be interesting
    assert res.critical_regions and res.warning_regions
    assert res.max_water_region == "R5C3"
    assert "Affected population" in res.summary()


def test_simulation_is_deterministic_and_does_not_mutate_city():
    city = create_synthetic_city()
    a, b = run_simulation(city), run_simulation(city)
    assert np.array_equal(a.water_levels, b.water_levels)
    assert a.time_to_critical == b.time_to_critical
    assert np.array_equal(city.initial_water, create_synthetic_city().initial_water)
    with pytest.raises(ValueError):
        city.elevation[0, 0] = 0


def test_step_exposes_water_balance_terms():
    city = create_synthetic_city()
    w0 = np.asarray(city.initial_water)
    w1, t = step(w0, city, SimulationConfig())
    assert np.allclose(w1, w0 + t["rainfall"] + t["incoming"] - t["outgoing"] - t["drained"])


def test_larger_grid_runs_and_conserves():
    rows, cols = 40, 60
    r, c = np.mgrid[0:rows, 0:cols]
    city = CityGrid(rows=rows, cols=cols, elevation=10 + 0.05 * np.sin(r / 3) + 0.04 * np.cos(c / 4),
                    rainfall=80, drainage_capacity=20, initial_water=0, population=50)
    res = run_simulation(city, SimulationConfig(duration_minutes=120))
    assert res.water_levels.shape == (121, rows, cols)
    assert res.final_water_level.sum() == pytest.approx(res.total_rainfall - res.total_drained, abs=1e-8)


def test_to_dict_is_json_serialisable():
    import json
    d = run_simulation(create_synthetic_city(), SimulationConfig(duration_minutes=5)).to_dict()
    json.dumps(d)
    assert d["risk_levels"][0][0][0] == "SAFE"


def test_wrong_argument_types_rejected():
    with pytest.raises(TypeError):
        run_simulation({"rows": 5})
    with pytest.raises(TypeError):
        run_simulation(create_synthetic_city(), {"duration_minutes": 60})

"""Phase 7: intervention transforms (pure input changes) and their effect through the unchanged engine."""
import numpy as np
import pytest

from app.interventions import (INTERVENTIONS, MAX_DRAIN_CAPACITY, MAX_INTERVENTIONS, InterventionError,
                               apply_interventions, list_interventions)
from app.scenarios import apply_scenario
from app.simulation import CityGrid, SimulationConfig, create_synthetic_city, run_simulation

IDS = ["unblock_drain", "increase_drainage", "activate_pump", "restore_channel"]
CHANNEL = ["R1C3", "R2C3", "R3C3", "R4C3", "R5C3"]


@pytest.fixture()
def base():
    return create_synthetic_city()


@pytest.fixture()
def blocked(base):
    city, params, _ = apply_scenario(base, "blocked_channel")
    return city, params["channel_cells"]


def snapshot(city):
    return {f: np.array(getattr(city, f)) for f in ("rainfall", "drainage_capacity", "elevation", "initial_water", "population")}


def unchanged(city, snap):
    return all(np.array_equal(getattr(city, f), arr) for f, arr in snap.items())


# ---- catalogue -------------------------------------------------------------------
def test_catalogue():
    assert [i.id for i in list_interventions()] == IDS
    for i in list_interventions():
        assert i.name and i.description and i.assumptions and i.target_mode in ("required", "optional_all", "channel")
        for p in i.params:
            assert p.minimum <= p.default <= p.maximum


def test_no_interventions_returns_the_same_city(base):
    city, details = apply_interventions(base, base, [])
    assert city is base and details == []
    assert apply_interventions(base, base, None)[0] is base


# ---- each intervention changes exactly the intended inputs ------------------------
def test_unblock_drain_restores_design_capacity_of_the_target_only(base, blocked):
    city, _ = blocked
    new, [d] = apply_interventions(city, base, [{"id": "unblock_drain", "targets": ["R5C3"]}])
    assert new.drainage_capacity[4, 2] == base.drainage_capacity[4, 2] == 10
    assert not new.drainage_capacity[:4, 2].any()                       # rest of the channel still blocked
    assert d["changes"] == [{"region": "R5C3", "field": "drainage_capacity", "unit": "mm/h", "before": 0.0, "after": 10.0}]
    assert (d["targets"], d["changed_region_count"], d["params"], d["note"]) == (["R5C3"], 1, {"restore_percent": 100.0}, "")
    assert d["capacity_added_mm_per_hour"] == 10.0


def test_unblock_drain_partial_restore_and_multiple_targets(base, blocked):
    city, _ = blocked
    new, [d] = apply_interventions(city, base, [{"id": "unblock_drain", "targets": ["R4C3", "R5C3", "R5C3"],
                                                "params": {"restore_percent": 50}}])
    assert (new.drainage_capacity[3, 2], new.drainage_capacity[4, 2]) == (7.5, 5.0)
    assert d["targets"] == ["R4C3", "R5C3"] and d["target_count"] == 2


def test_unblock_a_working_drain_changes_nothing_and_says_so(base):
    new, [d] = apply_interventions(base, base, [{"id": "unblock_drain", "targets": ["R1C1"]}])
    assert np.array_equal(new.drainage_capacity, base.drainage_capacity)
    assert d["changes"] == [] and d["changed_region_count"] == 0 and "No input changed" in d["note"]


def test_restore_never_lowers_a_working_drain(base):
    new, _ = apply_interventions(base, base, [{"id": "unblock_drain", "targets": ["R1C1"], "params": {"restore_percent": 10}}])
    assert new.drainage_capacity[0, 0] == base.drainage_capacity[0, 0]


def test_increase_drainage_on_targets(base):
    new, [d] = apply_interventions(base, base, [{"id": "increase_drainage", "targets": ["R5C3", "R4C3"]}])
    assert (new.drainage_capacity[4, 2], new.drainage_capacity[3, 2]) == (15.0, 22.5)      # +50% of design
    others = np.ones((5, 5), bool); others[3:, 2] = False
    assert np.array_equal(new.drainage_capacity[others], base.drainage_capacity[others])
    assert [c["region"] for c in d["changes"]] == ["R4C3", "R5C3"]


def test_increase_drainage_citywide_when_no_targets(base):
    new, [d] = apply_interventions(base, base, [{"id": "increase_drainage", "params": {"increase_percent": 100}}])
    assert np.allclose(new.drainage_capacity, base.drainage_capacity * 2)
    assert d["target_count"] == 25 and d["changed_region_count"] == 25


def test_increase_drainage_helps_a_blocked_drain_because_it_uses_design_capacity(base, blocked):
    city, _ = blocked
    new, _ = apply_interventions(city, base, [{"id": "increase_drainage", "targets": ["R5C3"]}])
    assert new.drainage_capacity[4, 2] == 5.0     # 0 + 50% of design 10


def test_activate_pump_adds_capacity_in_the_target_region(base):
    new, [d] = apply_interventions(base, base, [{"id": "activate_pump", "targets": ["R5C3"]}])
    assert new.drainage_capacity[4, 2] == 70.0 and d["params"] == {"pump_capacity": 60.0}
    assert d["changes"] == [{"region": "R5C3", "field": "drainage_capacity", "unit": "mm/h", "before": 10.0, "after": 70.0}]
    assert (new.drainage_capacity != base.drainage_capacity).sum() == 1
    custom, _ = apply_interventions(base, base, [{"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 25}}])
    assert custom.drainage_capacity[4, 2] == 35.0


def test_restore_channel_uses_the_channel_the_scenario_blocked(base, blocked):
    city, cells = blocked
    new, [d] = apply_interventions(city, base, [{"id": "restore_channel"}], channel_cells=cells)
    assert np.array_equal(new.drainage_capacity, base.drainage_capacity)
    assert d["targets"] == CHANNEL and [c["region"] for c in d["changes"]] == CHANNEL


def test_restore_channel_follows_a_custom_blocked_channel(base):
    city, params, _ = apply_scenario(base, "blocked_channel", {"channel_cells": [[4, 1], [4, 2]]})
    new, [d] = apply_interventions(city, base, [{"id": "restore_channel"}], channel_cells=params["channel_cells"])
    assert d["targets"] == ["R5C2", "R5C3"] and np.array_equal(new.drainage_capacity, base.drainage_capacity)


def test_restore_channel_defaults_and_explicit_targets(base, blocked):
    city, _ = blocked
    _, [d] = apply_interventions(city, base, [{"id": "restore_channel"}])          # no scenario info -> default channel
    assert d["targets"] == CHANNEL
    new, [d] = apply_interventions(city, base, [{"id": "restore_channel", "targets": ["R5C3"], "params": {"restore_percent": 80}}])
    assert d["targets"] == ["R5C3"] and new.drainage_capacity[4, 2] == 8.0 and not new.drainage_capacity[:4, 2].any()


@pytest.mark.parametrize("iid", IDS)
def test_interventions_only_touch_drain_capacity(base, blocked, iid):
    city, _ = blocked
    new, _ = apply_interventions(city, base, [{"id": iid, "targets": ["R5C3"]}])
    for f in ("rainfall", "elevation", "initial_water", "population", "barrier", "region_ids"):
        assert np.array_equal(getattr(new, f), getattr(city, f))
    assert isinstance(new, CityGrid)


def test_interventions_apply_in_order_and_report_running_values(base, blocked):
    city, _ = blocked
    new, details = apply_interventions(city, base, [
        {"id": "unblock_drain", "targets": ["R5C3"]},
        {"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 40}},
    ])
    assert new.drainage_capacity[4, 2] == 50.0
    assert [(c["before"], c["after"]) for d in details for c in d["changes"]] == [(0.0, 10.0), (10.0, 50.0)]


# ---- baseline immutability -------------------------------------------------------
@pytest.mark.parametrize("iid", IDS)
def test_neither_input_city_is_mutated(base, blocked, iid):
    city, _ = blocked
    snaps = snapshot(base), snapshot(city)
    apply_interventions(city, base, [{"id": iid, "targets": ["R4C3", "R5C3"]}])
    assert unchanged(base, snaps[0]) and unchanged(city, snaps[1])
    res = run_simulation(base)
    assert res.critical_regions == ["R4C3", "R5C3"] and res.affected_population == 10700


# ---- through the engine ----------------------------------------------------------
def test_interventions_reduce_flooding(base):
    before = run_simulation(base)
    for req in ({"id": "activate_pump", "targets": ["R5C3"]},
                {"id": "increase_drainage"},
                {"id": "increase_drainage", "targets": ["R5C3", "R4C3"], "params": {"increase_percent": 200}}):
        city, _ = apply_interventions(base, base, [req])
        after = run_simulation(city)
        assert np.all(after.maximum_water_level <= before.maximum_water_level + 1e-12)
        assert after.max_water_overall < before.max_water_overall
        assert after.total_drained > before.total_drained


def test_restoring_the_channel_recovers_the_baseline_result(base, blocked):
    city, cells = blocked
    restored, _ = apply_interventions(city, base, [{"id": "restore_channel"}], channel_cells=cells)
    assert np.array_equal(run_simulation(restored).water_levels, run_simulation(base).water_levels)
    assert run_simulation(city).max_water_overall > run_simulation(base).max_water_overall


def test_pump_delays_or_prevents_critical(base):
    city, _ = apply_interventions(base, base, [{"id": "activate_pump", "targets": ["R5C3"]}])
    res = run_simulation(city)
    assert res.time_to_critical["R5C3"] is None or res.time_to_critical["R5C3"] > 33


@pytest.mark.parametrize("iid", IDS)
def test_engine_invariants_hold(base, blocked, iid):
    city, _ = blocked
    new, _ = apply_interventions(city, base, [{"id": iid, "targets": ["R5C3"]}])
    res = run_simulation(new, SimulationConfig())
    assert res.water_levels.min() >= 0
    assert res.final_water_level.sum() == pytest.approx(res.total_initial_water + res.total_rainfall - res.total_drained, abs=1e-9)


@pytest.mark.parametrize("iid", IDS)
def test_deterministic(blocked, base, iid):
    city, _ = blocked
    req = [{"id": iid, "targets": ["R3C3", "R5C3"]}]
    a, da = apply_interventions(city, base, req)
    b, db = apply_interventions(city, base, req)
    assert da == db and np.array_equal(a.drainage_capacity, b.drainage_capacity)
    assert np.array_equal(run_simulation(a).water_levels, run_simulation(b).water_levels)


# ---- validation ------------------------------------------------------------------
@pytest.mark.parametrize("req, field", [
    ({"id": "dam"}, "interventions.0.id"),
    ({}, "interventions.0.id"),
    ({"id": "unblock_drain"}, "interventions.0.targets"),
    ({"id": "unblock_drain", "targets": []}, "interventions.0.targets"),
    ({"id": "activate_pump", "targets": None}, "interventions.0.targets"),
    ({"id": "activate_pump", "targets": ["R9C9"]}, "interventions.0.targets"),
    ({"id": "activate_pump", "targets": ["r5c3"]}, "interventions.0.targets"),
    ({"id": "activate_pump", "targets": [42]}, "interventions.0.targets"),
    ({"id": "restore_channel", "targets": ["nowhere"]}, "interventions.0.targets"),
    ({"id": "activate_pump", "targets": ["R1C1", "R1C2", "R1C3", "R1C4", "R1C5", "R2C1"]}, "interventions.0.targets"),
    ({"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": -1}}, "interventions.0.params.pump_capacity"),
    ({"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 501}}, "interventions.0.params.pump_capacity"),
    ({"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": "big"}}, "interventions.0.params.pump_capacity"),
    ({"id": "activate_pump", "targets": ["R5C3"], "params": {"restore_percent": 50}}, "interventions.0.params.restore_percent"),
    ({"id": "unblock_drain", "targets": ["R5C3"], "params": {"restore_percent": 120}}, "interventions.0.params.restore_percent"),
    ({"id": "increase_drainage", "params": {"increase_percent": 301}}, "interventions.0.params.increase_percent"),
    ({"id": "increase_drainage", "params": {"increase_percent": float("nan")}}, "interventions.0.params.increase_percent"),
])
def test_invalid_interventions(base, req, field):
    with pytest.raises(InterventionError) as err:
        apply_interventions(base, base, [req])
    assert err.value.field == field and err.value.message


def test_error_points_at_the_right_list_index(base):
    with pytest.raises(InterventionError) as err:
        apply_interventions(base, base, [{"id": "increase_drainage"}, {"id": "activate_pump", "targets": ["X"]}])
    assert err.value.field == "interventions.1.targets"


def test_limits(base):
    with pytest.raises(InterventionError) as err:
        apply_interventions(base, base, [{"id": "increase_drainage"}] * (MAX_INTERVENTIONS + 1))
    assert err.value.field == "interventions"
    pumps = [{"id": "activate_pump", "targets": ["R5C3"], "params": {"pump_capacity": 500}}] * 2
    with pytest.raises(InterventionError) as err:
        apply_interventions(base, base, pumps)                       # 10 + 500 + 500 > 1000 mm/h
    assert err.value.field == "interventions.1.params" and str(int(MAX_DRAIN_CAPACITY)) in err.value.message


def test_ids_registry():
    assert list(INTERVENTIONS) == IDS

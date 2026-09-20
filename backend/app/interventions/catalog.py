"""Intervention definitions.

An intervention is a pure function that changes simulation INPUTS (drain capacity of chosen
regions) and returns a new CityGrid. The simulation maths is untouched: the modified city goes
through the same engine as every other run.

Pipeline:   city -> rainfall override -> scenario -> interventions -> run_simulation

Two cities are involved:
    current   : the city after the scenario - what the intervention modifies
    reference : the city before the scenario - the "design" drain capacities that
                unblock / restore bring a region back to

All default values and limits are prototype assumptions.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Callable, Optional

import numpy as np

from app.scenarios import ParamSpec, check_number, default_channel_cells
from app.simulation import CityGrid

MAX_INTERVENTIONS = 10
MAX_DRAIN_CAPACITY = 1000.0   # mm/h - upper limit for any region after interventions
MAX_LISTED_CHANGES = 200


class InterventionError(ValueError):
    def __init__(self, field_: str, message: str):
        super().__init__(message)
        self.field, self.message = field_, message


@dataclass(frozen=True)
class Intervention:
    id: str
    name: str
    summary: str
    description: str
    assumptions: tuple[str, ...]
    target_mode: str                 # "required" | "optional_all" | "channel"
    max_targets: Optional[int]
    params: tuple[ParamSpec, ...]
    # (current drainage, reference drainage, target mask, params) -> new drainage
    transform: Callable[[np.ndarray, np.ndarray, np.ndarray, dict], np.ndarray] = field(default=None, repr=False)


# ------------------------------------------------------------------ transforms
def _restore(current, design, mask, p):
    """Bring capacity back up to a share of the design capacity. Never lowers a working drain."""
    out = current.copy()
    out[mask] = np.maximum(current[mask], design[mask] * p["restore_percent"] / 100.0)
    return out


def _increase(current, design, mask, p):
    out = current.copy()
    out[mask] = current[mask] + design[mask] * p["increase_percent"] / 100.0
    return out


def _pump(current, design, mask, p):
    out = current.copy()
    out[mask] = current[mask] + p["pump_capacity"]
    return out


_RESTORE = ParamSpec("restore_percent", "Capacity restored", "Share of the region's design drain capacity that works again.",
                     100.0, minimum=0.0, maximum=100.0, step=5.0, unit="%")

INTERVENTIONS: dict[str, Intervention] = {i.id: i for i in (
    Intervention(
        "unblock_drain", "Unblock drain", "Clear a blocked or failed drain in chosen regions.",
        "Crews clear the drains of the target regions, restoring their capacity towards the design value.",
        ("Design capacity is the region's drain capacity before any scenario was applied.",
         "A drain that already works at or above the restored level is left unchanged.",
         "The work is complete from the start of the run; crew travel and working time are not modelled."),
        "required", None, (_RESTORE,), _restore),
    Intervention(
        "increase_drainage", "Increase drainage capacity", "Upgrade drains in chosen regions, or city-wide.",
        "Adds drain capacity to the target regions, as a percentage of each region's design capacity. With no targets it applies to every region.",
        ("Added capacity = design capacity x increase percentage, on top of the current capacity.",
         "Because it is based on design capacity, it also helps regions whose drains are currently blocked.",
         "The upgrade is in place from the start of the run."),
        "optional_all", None,
        (ParamSpec("increase_percent", "Capacity increase", "Extra capacity as a share of each region's design drain capacity.",
                   50.0, minimum=0.0, maximum=300.0, step=10.0, unit="%"),), _increase),
    Intervention(
        "activate_pump", "Activate emergency pump", "Pump water out of chosen regions.",
        "Deploys a mobile pump in each target region. The pump removes water from that region at a fixed rate and discharges it outside the modelled area.",
        ("A pump is modelled as extra drain capacity in its region, in mm/h over the region's area.",
         "Pumped water leaves the model; it is not moved to a neighbouring region.",
         "A pump cannot remove more water than the region holds.",
         "Pumps run for the whole simulation. At most 5 pumps per intervention."),
        "required", 5,
        (ParamSpec("pump_capacity", "Pump capacity", "Water removed from each target region.",
                   60.0, minimum=0.0, maximum=500.0, step=5.0, unit="mm/h"),), _pump),
    Intervention(
        "restore_channel", "Restore blocked channel", "Reopen the main drainage channel.",
        "Clears the main drainage channel, restoring the channel regions' drain capacity towards the design value. "
        "With no targets it uses the channel blocked by the scenario, or the default channel (lowest region of every row).",
        ("Design capacity is the region's drain capacity before any scenario was applied.",
         "Channel regions that already work at or above the restored level are left unchanged.",
         "The channel is restored from the start of the run."),
        "channel", None, (_RESTORE,), _restore),
)}


# ------------------------------------------------------------------ public API
def list_interventions() -> list[Intervention]:
    return list(INTERVENTIONS.values())


def _resolve_targets(spec: Intervention, targets, city: CityGrid, channel_cells, where: str) -> np.ndarray:
    index = {str(city.region_ids[r, c]): (r, c) for r in range(city.rows) for c in range(city.cols)}
    mask = np.zeros(city.shape, dtype=bool)

    if targets is None or len(targets) == 0:
        if spec.target_mode == "required":
            raise InterventionError(where, f"{spec.id} needs at least one target region id")
        if spec.target_mode == "optional_all":
            mask[:] = True
        else:
            for r, c in channel_cells:
                mask[r, c] = True
        return mask

    for rid in targets:
        if not isinstance(rid, str) or rid not in index:
            raise InterventionError(where, f"'{rid}' is not a region of this {city.rows}x{city.cols} city")
        mask[index[rid]] = True
    if spec.max_targets is not None and int(mask.sum()) > spec.max_targets:
        raise InterventionError(where, f"{spec.id} accepts at most {spec.max_targets} target regions, got {int(mask.sum())}")
    return mask


def _resolve_params(spec: Intervention, given: dict, where: str) -> dict:
    known = {p.name: p for p in spec.params}
    for name in given:
        if name not in known:
            raise InterventionError(f"{where}.{name}", f"'{name}' is not a parameter of {spec.id} (allowed: {', '.join(known)})")
    return {p.name: check_number(p, given.get(p.name, p.default), f"{where}.{p.name}", InterventionError) for p in spec.params}


def apply_interventions(city: CityGrid, reference: CityGrid, requests: Optional[list[dict]] = None,
                        channel_cells: Optional[list] = None):
    """Apply interventions in order. Returns (new_city, [details]). Neither input city is mutated.

    requests: [{"id": str, "targets": [region ids] | None, "params": {..} | None}, ...]
    channel_cells: the channel the scenario blocked, if any ([row, col] pairs).
    """
    requests = list(requests or [])
    if len(requests) > MAX_INTERVENTIONS:
        raise InterventionError("interventions", f"at most {MAX_INTERVENTIONS} interventions per run, got {len(requests)}")
    if reference.shape != city.shape:
        raise InterventionError("interventions", "reference city and current city have different shapes")
    channel = [tuple(rc) for rc in channel_cells] if channel_cells else default_channel_cells(reference)

    drainage = np.array(city.drainage_capacity, dtype=float)
    design = np.array(reference.drainage_capacity, dtype=float)
    details = []

    for i, req in enumerate(requests):
        where = f"interventions.{i}"
        spec = INTERVENTIONS.get(req.get("id"))
        if spec is None:
            raise InterventionError(f"{where}.id", f"unknown intervention '{req.get('id')}' (available: {', '.join(INTERVENTIONS)})")
        mask = _resolve_targets(spec, req.get("targets"), city, channel, f"{where}.targets")
        params = _resolve_params(spec, dict(req.get("params") or {}), f"{where}.params")

        updated = spec.transform(drainage, design, mask, params)
        if np.any(updated > MAX_DRAIN_CAPACITY + 1e-9):
            rid = str(city.region_ids[np.unravel_index(int(np.argmax(updated)), updated.shape)])
            raise InterventionError(f"{where}.params", f"drain capacity of {rid} would reach {updated.max():g} mm/h; "
                                                       f"the limit is {MAX_DRAIN_CAPACITY:g} mm/h")
        changed = ~np.isclose(updated, drainage)
        changes = [{"region": str(city.region_ids[r, c]), "field": "drainage_capacity", "unit": "mm/h",
                    "before": round(float(drainage[r, c]), 4), "after": round(float(updated[r, c]), 4)}
                   for r, c in zip(*np.nonzero(changed))]
        note = "" if changes else "No input changed: the target regions already meet or exceed this level."
        details.append({
            "id": spec.id, "name": spec.name, "params": params,
            "targets": [str(x) for x in city.region_ids[mask]] if int(mask.sum()) <= MAX_LISTED_CHANGES else [],
            "target_count": int(mask.sum()),
            "changed_region_count": len(changes),
            "changes": changes[:MAX_LISTED_CHANGES],
            "capacity_added_mm_per_hour": round(float((updated - drainage).sum()), 4),
            "note": note,
        })
        drainage = updated

    new_city = replace(city, drainage_capacity=drainage) if requests else city
    return new_city, details

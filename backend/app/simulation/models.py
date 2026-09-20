"""Data models for the FLOWSHIELD simulation engine.

Plain dataclasses + NumPy arrays. Nothing here depends on FastAPI, so the engine
can be called directly from Python:  result = run_simulation(city, config)

UNITS (used consistently across the whole engine)
    elevation, water depth, thresholds : metres (m)
    rainfall, drainage capacity        : millimetres per hour (mm/h)
    time                               : minutes
    population                         : people (whole numbers)

All validation happens at construction time, so an invalid city or config can
never reach the engine ("no silent invalid states").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional

import numpy as np

MM_PER_HOUR_TO_M_PER_MIN = 1.0 / 1000.0 / 60.0

# Explicit 4-neighbour diffusion is only stable when flow_rate * timestep <= 1/4
# (each cell can exchange with up to 4 neighbours in one step).
MAX_FLOW_FRACTION_PER_STEP = 0.25

# Sanity bounds on inputs. They are far beyond any real city; their job is to stop absurd values
# from overflowing floating point or int64 and producing a silently wrong result.
INPUT_LIMITS = {
    "elevation": 1e5,          # |m|
    "rainfall": 1e7,           # mm/h
    "drainage_capacity": 1e7,  # mm/h
    "initial_water": 1e4,      # m
    "population": 1e9,         # people per region
}


class RiskLevel(IntEnum):
    SAFE = 0
    WARNING = 1
    CRITICAL = 2


def _as_grid(name: str, value, shape: tuple[int, int], *, allow_negative: bool) -> np.ndarray:
    """Convert to a float grid of `shape`. A scalar is broadcast (e.g. uniform rainfall)."""
    try:
        arr = np.asarray(value, dtype=float)
    except (ValueError, TypeError):
        raise ValueError(f"{name} must be one number or a {shape[0]}x{shape[1]} grid of numbers") from None
    if arr.ndim == 0:
        arr = np.full(shape, float(arr))
    if arr.shape != shape:
        raise ValueError(f"{name} has shape {arr.shape}, expected {shape}")
    if not np.all(np.isfinite(arr)):
        raise ValueError(f"{name} contains NaN or infinite values")
    if not allow_negative and np.any(arr < 0):
        raise ValueError(f"{name} must not contain negative values")
    limit = INPUT_LIMITS.get(name)
    if limit is not None and np.any(np.abs(arr) > limit):
        raise ValueError(f"{name} contains values beyond the supported range of {limit:g}")
    arr = arr.copy()
    arr.setflags(write=False)  # a city is immutable input; the engine never mutates it
    return arr


@dataclass(frozen=True)
class CityGrid:
    """A city as a rows x cols grid of connected regions.

    Every per-cell field accepts either a full 2D array/list or a single number
    (broadcast to every cell).

    barrier: optional boolean grid. A barrier cell exchanges no surface water with
    its neighbours (an isolated cell). Rainfall and drainage still apply to it.
    """

    rows: int
    cols: int
    elevation: np.ndarray          # m
    rainfall: np.ndarray           # mm/h
    drainage_capacity: np.ndarray  # mm/h
    initial_water: np.ndarray      # m
    population: np.ndarray         # people
    region_ids: Optional[np.ndarray] = None
    barrier: Optional[np.ndarray] = None

    def __post_init__(self) -> None:
        for name in ("rows", "cols"):
            v = getattr(self, name)
            if isinstance(v, bool) or not isinstance(v, (int, np.integer)) or v < 1:
                raise ValueError(f"{name} must be an integer >= 1, got {v!r}")
        shape = (int(self.rows), int(self.cols))
        set_ = lambda k, v: object.__setattr__(self, k, v)  # frozen dataclass

        set_("elevation", _as_grid("elevation", self.elevation, shape, allow_negative=True))
        set_("rainfall", _as_grid("rainfall", self.rainfall, shape, allow_negative=False))
        set_("drainage_capacity",
             _as_grid("drainage_capacity", self.drainage_capacity, shape, allow_negative=False))
        set_("initial_water", _as_grid("initial_water", self.initial_water, shape, allow_negative=False))

        pop = _as_grid("population", self.population, shape, allow_negative=False)
        if not np.all(pop == np.round(pop)):
            raise ValueError("population must contain whole numbers")
        pop = pop.astype(np.int64)
        pop.setflags(write=False)
        set_("population", pop)

        if self.region_ids is None:
            ids = np.array([[f"R{r + 1}C{c + 1}" for c in range(shape[1])] for r in range(shape[0])])
        else:
            ids = np.asarray(self.region_ids, dtype=str)
            if ids.shape != shape:
                raise ValueError(f"region_ids has shape {ids.shape}, expected {shape}")
            if len(set(ids.ravel().tolist())) != ids.size:
                raise ValueError("region_ids must be unique")
        ids.setflags(write=False)
        set_("region_ids", ids)

        if self.barrier is None:
            bar = np.zeros(shape, dtype=bool)
        else:
            bar = np.asarray(self.barrier)
            if bar.shape != shape:
                raise ValueError(f"barrier has shape {bar.shape}, expected {shape}")
            bar = bar.astype(bool)
        bar.setflags(write=False)
        set_("barrier", bar)

    @property
    def shape(self) -> tuple[int, int]:
        return (self.rows, self.cols)

    @property
    def total_population(self) -> int:
        return int(self.population.sum())


@dataclass(frozen=True)
class SimulationConfig:
    """Everything tunable lives here - no thresholds or rates are hardcoded elsewhere.

    The default thresholds are PROTOTYPE ASSUMPTIONS, not real-world flood standards.
    """

    duration_minutes: float = 60.0
    timestep_minutes: float = 1.0
    warning_threshold: float = 0.15   # m of standing water -> WARNING
    critical_threshold: float = 0.30  # m of standing water -> CRITICAL
    flow_rate: float = 0.10           # fraction of head difference moved per minute, per edge

    def __post_init__(self) -> None:
        for name in ("duration_minutes", "timestep_minutes", "warning_threshold",
                     "critical_threshold", "flow_rate"):
            v = getattr(self, name)
            if isinstance(v, bool) or not isinstance(v, (int, float, np.number)) or not np.isfinite(v):
                raise ValueError(f"{name} must be a finite number, got {v!r}")
        if self.timestep_minutes <= 0:
            raise ValueError("timestep_minutes must be > 0")
        if self.duration_minutes <= 0:
            raise ValueError("duration_minutes must be > 0")
        if self.timestep_minutes > self.duration_minutes:
            raise ValueError("timestep_minutes must not exceed duration_minutes")
        steps = self.duration_minutes / self.timestep_minutes
        if abs(steps - round(steps)) > 1e-9:
            raise ValueError("duration_minutes must be a whole multiple of timestep_minutes")
        if self.warning_threshold <= 0:
            raise ValueError("warning_threshold must be > 0")
        if self.critical_threshold <= self.warning_threshold:
            raise ValueError("critical_threshold must be greater than warning_threshold")
        if self.flow_rate < 0:
            raise ValueError("flow_rate must be >= 0")
        if self.flow_rate * self.timestep_minutes > MAX_FLOW_FRACTION_PER_STEP + 1e-12:
            raise ValueError(
                f"flow_rate * timestep_minutes must be <= {MAX_FLOW_FRACTION_PER_STEP} "
                "for a stable simulation; use a smaller timestep or flow_rate"
            )

    @property
    def num_steps(self) -> int:
        return int(round(self.duration_minutes / self.timestep_minutes))


@dataclass
class SimulationResult:
    """Output of run_simulation. Index 0 of every time series is the initial state (t = 0).

    DEFINITIONS (peak-based, used consistently)
        critical region     : reached CRITICAL at any timestep
        warning region      : reached WARNING at some timestep but never CRITICAL
        critical_population : people living in critical regions
        warning_population  : people living in warning regions
        affected_population : critical_population + warning_population
    Each region is counted once, under the worst level it reached.
    """

    region_ids: np.ndarray                 # (rows, cols) str
    timestamps: list[float]                # minutes, length T+1
    water_levels: np.ndarray               # (T+1, rows, cols) m
    risk_levels: np.ndarray                # (T+1, rows, cols) RiskLevel ints
    peak_risk: np.ndarray                  # (rows, cols) worst RiskLevel reached
    critical_regions: list[str]
    warning_regions: list[str]
    first_critical_step: dict[str, Optional[int]]
    first_critical_time: dict[str, Optional[float]]  # simulation clock, minutes
    time_to_critical: dict[str, Optional[float]]     # minutes after simulation start
    total_population: int
    affected_population: int
    warning_population: int
    critical_population: int
    population_timeline: dict[str, list[int]]  # per-timestep 'warning' / 'critical' counts
    maximum_water_level: np.ndarray        # (rows, cols) peak depth per region, m
    max_water_overall: float
    max_water_region: str
    final_water_level: np.ndarray          # (rows, cols) m
    earliest_critical_region: Optional[str]
    earliest_critical_time: Optional[float]
    # mass-balance bookkeeping (metres of depth summed over all cells)
    total_initial_water: float
    total_rainfall: float
    total_drained: float
    config: SimulationConfig = field(repr=False, default=None)

    def summary(self) -> str:
        ect = "none" if self.earliest_critical_time is None else f"{self.earliest_critical_time:g} minutes"
        return "\n".join([
            f"Simulation duration:      {self.timestamps[-1]:g} minutes ({len(self.timestamps) - 1} steps)",
            f"Maximum water:            {self.max_water_overall:.3f} m (region {self.max_water_region})",
            f"Critical regions:         {len(self.critical_regions)}",
            f"Warning regions:          {len(self.warning_regions)}",
            f"Total population:         {self.total_population}",
            f"Critical population:      {self.critical_population}",
            f"Warning population:       {self.warning_population}",
            f"Affected population:      {self.affected_population}",
            f"Earliest critical region: {self.earliest_critical_region or 'none'}",
            f"Earliest critical time:   {ect}",
        ])

    def to_dict(self) -> dict:
        """JSON-friendly version (for the API in a later phase)."""
        return {
            "region_ids": self.region_ids.tolist(),
            "timestamps": self.timestamps,
            "water_levels": self.water_levels.tolist(),
            "risk_levels": [[[RiskLevel(v).name for v in row] for row in grid]
                            for grid in self.risk_levels.tolist()],
            "peak_risk": [[RiskLevel(v).name for v in row] for row in self.peak_risk.tolist()],
            "critical_regions": self.critical_regions,
            "warning_regions": self.warning_regions,
            "first_critical_step": self.first_critical_step,
            "first_critical_time": self.first_critical_time,
            "time_to_critical": self.time_to_critical,
            "total_population": self.total_population,
            "affected_population": self.affected_population,
            "warning_population": self.warning_population,
            "critical_population": self.critical_population,
            "population_timeline": self.population_timeline,
            "maximum_water_level": self.maximum_water_level.tolist(),
            "max_water_overall": self.max_water_overall,
            "max_water_region": self.max_water_region,
            "final_water_level": self.final_water_level.tolist(),
            "earliest_critical_region": self.earliest_critical_region,
            "earliest_critical_time": self.earliest_critical_time,
            "total_initial_water": self.total_initial_water,
            "total_rainfall": self.total_rainfall,
            "total_drained": self.total_drained,
        }

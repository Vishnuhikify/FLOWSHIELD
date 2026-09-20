# FLOWSHIELD simulation engine

> This is a simplified flood simulation model created for a hackathon prototype.
> It is **NOT** a calibrated operational flood forecasting system.

Pure Python + NumPy. No FastAPI, no I/O, no randomness.

```python
from app.simulation import create_synthetic_city, SimulationConfig, run_simulation
result = run_simulation(create_synthetic_city(), SimulationConfig(duration_minutes=60))
print(result.summary())
```

Demo from `backend/`: `python -m app.simulation.demo`

## Modules

| File | Responsibility |
|---|---|
| `models.py` | `CityGrid`, `SimulationConfig`, `SimulationResult`, `RiskLevel`, all validation, units |
| `grid.py` | neighbour lookup, rainfall override, synthetic 5x5 city |
| `flow.py` | water movement between neighbours |
| `drainage.py` | drainage, capped by available water |
| `risk.py` | risk classes, first-critical step, population metrics |
| `engine.py` | one timestep (`step`) and the full run (`run_simulation`) |

## Units

Elevation, water depth, thresholds: **m**. Rainfall, drainage capacity: **mm/h**. Time: **minutes**.

## Water balance

    W(t+1) = W(t) + Rainfall + Incoming - Drainage - Outgoing

Order inside a timestep: rainfall -> flow -> drainage.

## Flow

`head = elevation + water`. For each pair of up/down/left/right neighbours, water moves
from higher head to lower head:

    edge_flow = flow_rate * timestep * (head_high - head_low)

- If a cell's total outflow would exceed its water, its outflows are scaled down proportionally.
- `flow_rate * timestep <= 0.25` is enforced, which keeps the explicit scheme stable.
- All edges are computed from one snapshot and applied together (order-independent).
- Grid edges are closed walls. `barrier` cells exchange no water with neighbours.

## Drainage

`drained = min(capacity, current water)`. Drained water leaves the model.

## Risk

`depth >= critical_threshold` -> CRITICAL, `depth >= warning_threshold` -> WARNING, else SAFE.
Defaults 0.15 m / 0.30 m are prototype assumptions, configurable in `SimulationConfig`.

## Time-to-critical

First timestep index at which a region is CRITICAL, converted to minutes. `None` if it never
happens. `first_critical_time` is the simulation clock; `time_to_critical` is minutes since
the start (identical while simulations start at t = 0).

## Population (peak-based)

- critical region: reached CRITICAL at any timestep
- warning region: reached WARNING but never CRITICAL
- **affected population = warning population + critical population**, each region counted once
- `population_timeline` gives the instantaneous counts per timestep for charts

## Assumptions

1. One cell = one region with a single flat elevation and a single water depth.
2. Water depth is a column of water over the whole cell; all cells have equal area.
3. Flow is proportional to head difference (linear, diffusion-like). No momentum, velocity, friction or slope-length terms.
4. Only 4-neighbour connectivity.
5. Closed boundary: no water leaves across the grid edge; drainage is the only sink.
6. Rainfall and drainage capacity are constant in time during a run.
7. No infiltration, evaporation or soil saturation; drains never back up.
8. Risk depends on depth only (not velocity or duration).
9. Population is static; nobody evacuates.

## Input limits

`CityGrid` rejects values beyond `INPUT_LIMITS` in `models.py` (|elevation| 1e5 m, rainfall and drainage
1e7 mm/h, initial water 1e4 m, population 1e9 per region). They are far outside any real city and exist
only so absurd inputs fail loudly instead of overflowing.

## Known limitations

- Not calibrated against any real event; `flow_rate` and thresholds are not physical constants.
- Results depend somewhat on timestep and grid resolution.
- A closed boundary overstates ponding in cells at the map edge.
- No time-varying storms yet (rainfall is a constant rate per cell).
- Drainage networks (pipes moving water between cells) are not modelled; drainage is per-cell removal.
- At exactly `flow_rate * timestep = 0.25` (the stability limit) small depth ripples decay slowly; the default 0.1 is well inside it.
- Full history is kept in memory: `(steps + 1) x rows x cols` floats.

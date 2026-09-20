# FLOWSHIELD — Predict the flood. Test the response.

FLOWSHIELD is an interactive, explainable **flood-simulation and decision-support prototype** built for Hack-a-Matics 2026 under the VECTOR theme.

It models how rainfall can accumulate and move across a connected synthetic city grid, classifies regions as **Safe / Warning / Critical**, shows flood progression over time, and lets users test scenarios and interventions before comparing their modeled effects.

> **Prototype disclaimer:** FLOWSHIELD is a simplified hackathon model. It is **not** a calibrated operational flood-forecasting system, real-time emergency service, or public-safety instruction tool.

## What the project does

The main workflow is:

**SIMULATE → MONITOR → WARN → TEST RESPONSE → COMPARE MODELED IMPACT**

Current capabilities include:

- deterministic 2D flood simulation over connected regions
- rainfall, elevation, drainage capacity, initial water, population, and region connectivity
- Safe / Warning / Critical risk classification
- timestep progression with play, pause, restart, slider, speed controls, and jump-to-warning/critical
- current-state vs end-of-run forecast views
- early-warning summaries and region-specific time-to-critical information
- Scenario Lab for normal/heavy/extreme rainfall, drainage failure, and blocked drainage channels
- Intervention Lab for drain unblocking, drainage upgrades, emergency pumping, and channel restoration
- with-vs-without intervention comparison and **MODELED IMPACT** summaries
- affected-population and region-level improved / unchanged / worsened analysis
- Bengaluru map visualization using Leaflet + OpenStreetMap
- city → region → illustrative simulated-neighborhood exploration
- historical replay using a documented Bengaluru rainfall event
- deterministic guided Demo Mode

## Mathematical model

For each region and timestep, the simplified water balance is:

```text
W(t+1) = W(t) + R + I - D - O
```

where:

- `W` = water depth in the region
- `R` = rainfall added during the timestep
- `I` = water flowing in from neighboring regions
- `D` = drainage removed during the timestep
- `O` = water flowing out to neighboring regions

The engine uses **effective head = elevation + water depth**. Water is transferred between up/down/left/right neighbors from higher head toward lower head using a bounded, deterministic flow rule. Drainage then removes water up to the region's drainage capacity and available water.

### Risk classification

Default prototype thresholds are:

- **Safe:** depth `< 0.15 m`
- **Warning:** depth `>= 0.15 m` and `< 0.30 m`
- **Critical:** depth `>= 0.30 m`

These thresholds are configurable and are **prototype assumptions**, not universal official flood-safety thresholds.

More engine details and assumptions are documented in [`backend/app/simulation/README.md`](backend/app/simulation/README.md).

## Core simulation assumptions and limitations

The model intentionally simplifies real flood behavior:

- each grid cell is one region with one elevation and one water depth
- all cells are treated as equal area
- only four-neighbor connectivity is modeled
- grid boundaries are closed; drainage is the only modeled sink
- rainfall and drainage capacity are constant during a single run
- no infiltration, evaporation, soil saturation, hydraulic pipe-network behavior, momentum, friction, or velocity field is modeled
- risk is based on modeled water depth, not water velocity or exposure duration
- population is static during a run
- the engine is not calibrated against a real flood event

The result should therefore be interpreted as a **comparative modeled outcome under stated assumptions**, not a real-world flood prediction.

## Architecture

```text
React / Vite frontend
        │
        │ HTTP JSON
        ▼
FastAPI backend
        │
        ├── scenario transforms
        ├── intervention transforms
        ├── comparison engine
        └── deterministic flood simulation engine
```

### Repository structure

```text
backend/app/simulation/     core flood engine
backend/app/scenarios/      scenario definitions
backend/app/interventions/  intervention definitions
backend/app/comparison/     with/without comparison logic
backend/app/api/            FastAPI routes, schemas, mapping
backend/tests/              backend automated tests
frontend/src/components/    dashboard UI components
frontend/src/pages/         main dashboard
frontend/src/services/      API client
frontend/src/utils/         playback, scenarios, comparison, map, replay helpers
frontend/src/data/          locally stored historical-event metadata
tools/                      browser end-to-end checks
data/                       project data placeholder
```

## Technology stack

### Backend

- Python
- FastAPI
- Pydantic
- NumPy
- Pandas
- pytest

### Frontend

- React
- Vite
- Tailwind CSS
- Recharts
- Leaflet + React-Leaflet
- OpenStreetMap tiles
- Vitest

## Scenario Lab

The scenario system changes simulation inputs and then reuses the same flood engine.

| Scenario | Modeled change |
|---|---|
| Baseline | No scenario transform |
| Normal rainfall | Lower rainfall multiplier |
| Heavy rainfall | Increased rainfall multiplier |
| Extreme rainfall | Higher rainfall multiplier |
| Drainage failure | Reduced drainage capacity across the city |
| Blocked drainage channel | Reduced capacity in modeled channel regions |

`GET /api/scenarios` returns the currently configured scenario catalog, including parameter ranges and assumptions.

## Intervention Lab

Interventions modify drainage-related inputs before the same simulation engine runs.

| Intervention | Modeled action |
|---|---|
| Unblock Drain | Restores a target drain toward design capacity |
| Increase Drainage Capacity | Adds drainage capacity to selected/all regions |
| Emergency Pump | Adds temporary modeled removal capacity in target regions |
| Restore Blocked Channel | Restores modeled blocked-channel drainage |

`POST /api/interventions/preview` previews exact before/after drainage values without running the simulation.

## Modeled Impact comparison

`POST /api/compare` runs the same scenario twice:

1. without the intervention plan
2. with the intervention plan

The comparison reports modeled differences such as:

- critical and warning regions
- affected population
- critical / warning population
- peak and final water depth
- earliest critical time
- region time-to-critical
- region status: improved / unchanged / worsened

The comparison engine reads the two simulation outputs; it does not introduce separate flood physics.

## Early Warning and progression

The dashboard separates the **current timestep** from the **end-of-run forecast** and provides:

- first warning time
- first critical time
- region-specific time-to-critical
- highest-risk / watch regions
- current and forecast population exposure
- jump-to-warning / jump-to-critical controls
- play / pause / restart / previous / next
- timeline slider and playback speed controls

All values are produced from the existing simulation timeline.

## Bengaluru map and neighborhood view

The map layer uses **Leaflet + OpenStreetMap** as a geographic backdrop.

Important limitations:

- the 5×5 flood grid is synthetic
- the fixed Bengaluru placement is illustrative
- the map is **not** a Bengaluru flood-risk map
- no user location is used
- no geocoding or routing API is used
- neighborhood roads, buildings, drainage, low areas, and water geometry are illustrative
- neighborhood visualization uses the **same existing simulation state**; it does not run a second flood model

The interface explicitly labels these views as illustrative.

## Historical Flood Replay

The project includes a replay entry for:

**Bengaluru Flood — September 5, 2022**

Observed reference input stored by the project:

- **131.6 mm rainfall over 24 hours**
- reported affected areas include Mahadevapura, Bellandur, Varthur, K R Puram, and Sarjapur-area locations

The 131.6 mm / 24 h value is documented by the India Meteorological Department's Bengaluru-City September extreme-weather record and contemporary reporting. The app derives a constant modeled rate:

```text
131.6 mm / 24 h = 5.48 mm/h (rounded)
```

It then runs that rate through the same simplified engine for the full 24-hour window.

> **Historical replay disclaimer:** This is a **modeled rainfall replay**, not a reconstruction of actual historical flood depths, local rainfall distribution, inundation extent, or damage.

Sources used by the event metadata:

- India Meteorological Department, Bengaluru-City September extreme-weather record: https://city.imd.gov.in/citywx/extreme_data_view.php?id=43295
- The Indian Express, September 5, 2022 coverage: https://indianexpress.com/article/cities/bangalore/after-heavy-overnight-rain-in-bengaluru-several-areas-waterlogged-traffic-hit-8131782/
- The Indian Express, September 6, 2022 coverage: https://indianexpress.com/article/cities/bangalore/schools-shut-bengalurus-puram-heavy-rainfall-streets-flooded-8135098/

No hourly rainfall profile is invented from the 24-hour total.

## Demo Mode

Demo Mode provides a deterministic guided presentation using the real application controls and backend:

1. Baseline
2. Heavy rainfall scenario
3. Flood progression
4. Early warning / first critical region
5. Intervention plan
6. Run with interventions
7. MODELED IMPACT comparison

The demo script contains no hard-coded result metrics; displayed values come from real API responses.

## API

Base prefix: `/api`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | backend health check |
| POST | `/api/simulate` | run one flood simulation |
| GET | `/api/scenarios` | list scenario catalog |
| GET | `/api/interventions` | list intervention catalog |
| POST | `/api/interventions/preview` | preview modeled intervention input changes |
| POST | `/api/compare` | compare the same scenario without vs with interventions |

Interactive FastAPI documentation is available at:

```text
http://127.0.0.1:8000/docs
```

### Minimal simulation request

```json
{}
```

This runs the built-in deterministic synthetic city with default controls.

### Example custom request

```json
{
  "city": {
    "rows": 2,
    "cols": 3,
    "elevation": [[10.4, 10.2, 10.0], [10.3, 10.1, 9.9]],
    "drainage_capacity": 10,
    "population": [[100, 200, 300], [400, 500, 600]]
  },
  "rainfall": 80,
  "config": {
    "duration_minutes": 60,
    "timestep_minutes": 1,
    "warning_threshold": 0.15,
    "critical_threshold": 0.30
  }
}
```

Units:

- elevation / water / thresholds: meters
- rainfall / drainage: mm/h
- time: minutes

## Running locally

### 1. Backend

From the project root:

```bash
cd backend
python -m venv .venv
```

Activate the environment:

**Windows PowerShell / Command Prompt**

```bat
.venv\Scripts\activate
```

**macOS / Linux**

```bash
source .venv/bin/activate
```

Install and run:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend health endpoint:

```text
http://127.0.0.1:8000/api/health
```

### 2. Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open:

```text
http://localhost:5173
```

Map tiles require internet access. The synthetic overlay can still exist without live tile imagery.

## Testing

### Backend

```bash
cd backend
pytest
```

### Frontend

```bash
cd frontend
npm test
npm run build
```

### Browser end-to-end checks

Optional browser checks are provided in `tools/` and require Playwright + Chromium. Start the frontend first.

```bash
pip install playwright psutil
playwright install chromium
python tools/e2e_map.py
python tools/e2e_demo.py
python tools/e2e_historical_zoom.py
```

`tools/e2e_audit.py` includes backend-offline/recovery behavior and may take control of port 8000 while it runs.

## AI assistance disclosure

AI coding assistants were used during development for code generation, debugging support, test generation, documentation assistance, and implementation suggestions.

The team remained responsible for:

- selecting and defining the problem and solution direction
- choosing the mathematical modeling approach and assumptions
- integrating the simulation, API, frontend, scenarios, interventions, comparison, map, and replay features
- reviewing generated code and behavior
- manually testing the complete workflow
- validating that modeled claims and disclaimers match the implemented system

AI assistance does not change the project's central limitation: FLOWSHIELD is a simplified prototype model, not an operational forecasting product.

## Submission note

The project is intended as an explainable hackathon prototype for exploring **how modeled flood risk changes under different rainfall, drainage, and intervention assumptions**. Results should be used only for demonstration and comparative analysis within the prototype.

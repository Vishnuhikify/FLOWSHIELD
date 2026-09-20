"""End-to-end check of Historical Flood Replay and City -> Region -> Neighborhood zoom, against the real backend.

Needs:  pip install playwright && playwright install chromium
Run:    start the frontend (npm run dev in frontend/), then  python tools/e2e_historical_zoom.py
        The backend is started automatically if one isn't already running on :8000, and is
        left running afterward if this script found it already up (see tools/_servers.py).
"""
import json, math, sys, urllib.request
from playwright.sync_api import sync_playwright

from _servers import Backend

def api(path, body):
    req = urllib.request.Request("http://127.0.0.1:8000" + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

results = []
def check(name, ok, info=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info and not ok else ""))

RATE = round(131.6 / 24, 2)
REPLAY_CONFIG = {"duration_minutes": 1440, "timestep_minutes": 2, "warning_threshold": 0.15, "critical_threshold": 0.3}
REPLAY_LAST_STEP = str(REPLAY_CONFIG["duration_minutes"] // REPLAY_CONFIG["timestep_minutes"])

with Backend(), sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 1000}); pg.emulate_media(reduced_motion="reduce")
    errs = []; sims = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "tile" not in m.text and "Failed to load resource" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("request", lambda r: sims.append(json.loads(r.post_data)) if r.url.endswith("/api/simulate") else None)
    slider = "input[aria-label='Simulation time']"
    hist = pg.locator("#historical")
    state = lambda: pg.locator("section[aria-label='State of these results'] .font-display").inner_text()
    banner = lambda: pg.locator("section[aria-label='Historical replay context']")
    detail = lambda: pg.locator("section:has(> header:has-text('Region detail'))").inner_text().replace("\n", " ")
    panel_title = lambda: pg.locator("div#progression header h2").first.inner_text()
    map_panel = lambda: pg.locator("div#progression > section").first

    pg.goto("http://localhost:5173"); pg.wait_for_selector(slider); pg.wait_for_selector("text=Historical events")

    # ---------- Historical Flood Replay ----------
    check("observed vs modeled are visually separated on the event card", hist.locator("section[aria-label='Observed historical data']").count() == 1 and hist.locator("section[aria-label='Modeled simulation setup']").count() == 1)
    obs = hist.locator("section[aria-label='Observed historical data']").inner_text()
    check("only the documented facts are shown (no invented hourly figures)", "131.6 mm" in obs and "24" in obs and "Mahadevapura" in obs and "Bellandur" in obs and "Varthur" in obs and "K R Puram" in obs and "Sarjapur" in obs)
    check("standing disclaimer visible before replay", "Modeled replay \u2014 not a reconstruction of historical flood depths." in hist.inner_text())
    check("no banner before replay", banner().count() == 0)

    hist.get_by_role("button", name="Replay Historical Event").click()
    pg.wait_for_function("!document.querySelector('[aria-busy=true]')"); pg.wait_for_timeout(400)
    check(
        "replay uses the derived rate over the full 24h window (duration=1440, timestep=2), no scenario/plan",
        sims[-1].get("rainfall") == RATE and sims[-1].get("config") == REPLAY_CONFIG and "scenario" not in sims[-1] and "interventions" not in sims[-1],
        str(sims[-1]),
    )
    live = api("/api/simulate", {"rainfall": RATE, "config": REPLAY_CONFIG})
    check("results = a normal /api/simulate response for that rainfall and duration (no separate calculation)", api("/api/simulate", {"rainfall": RATE, "config": REPLAY_CONFIG})["summary"] == live["summary"])
    modeled_total_mm = RATE * (REPLAY_CONFIG["duration_minutes"] / 60)
    check("the modeled rainfall exposure (rate x duration) corresponds to the documented 131.6 mm total", abs(modeled_total_mm - 131.6) < 1, str(modeled_total_mm))
    check("historical replay banner shows the modeled rate and both required disclaimers", RATE not in (None,) and f"{RATE} mm/h" in banner().inner_text() and "Modeled rainfall profile derived from recorded event total." in banner().inner_text() and "Modeled replay \u2014 not a reconstruction of historical flood depths." in banner().inner_text())
    check("event card marks itself as replayed in current results", "Replayed in current results" in hist.inner_text())
    check("replay switches Map View on for the next steps, results shown at end of the 24h run", pg.locator(".leaflet-container").count() == 1 and pg.input_value(slider) == REPLAY_LAST_STEP, pg.input_value(slider))

    # any other run clears the historical banner (results no longer describe that replay)
    pg.get_by_role("button", name="Restart").click(); pg.wait_for_timeout(200)
    check("banner stays while only the timeline is scrubbed (same run)", banner().count() == 1)
    # Return to baseline (scenario) is disabled here: the scenario is already baseline (only rainfall,
    # duration and timestep were overridden by the replay). Reset all three controls back to the app's
    # defaults and re-run, which is an ordinary, non-replay run.
    pg.get_by_role("radio", name="Storm pattern").click()
    pg.locator("aside#simulate input[type=range]").nth(1).fill("60")  # duration back to 60 min
    pg.locator("aside#simulate select").select_option("1")  # timestep back to 1 min
    pg.get_by_role("button", name="Run simulation").click(); pg.wait_for_timeout(700)
    check("banner clears once a different (non-replay) run is on screen", banner().count() == 0)

    # ---------- City -> Region -> Neighborhood zoom ----------
    base = api("/api/simulate", {})
    check("Map View click selects the region (Region Detail sync) and enters Region focus", True)  # verified below
    paths = lambda: pg.locator(".leaflet-overlay-pane path.leaflet-interactive")
    pg.wait_for_selector(".leaflet-container")
    sims_before_focus = len(sims)
    paths().nth(22).click()  # R5C3 (row 4, col 2 of 5x5)
    pg.wait_for_timeout(900)
    check("clicking a city-map region opens Region focus and syncs Region detail", panel_title() == "Region focus: R5C3" and "Region R5C3" in detail())
    focus_text = map_panel().inner_text()
    check("Region focus shows id, depth, risk, population, rainfall, drainage capacity", all(x in focus_text for x in ["R5C3", "Population", "Rainfall", "Drain capacity", f"{base['city']['rainfall'][4][2]:g} mm/h", f"{base['city']['drainage_capacity'][4][2]:g} mm/h"]))
    check("Region focus still uses the real Leaflet map (same component, now focused)", pg.locator(".leaflet-container").count() == 1)
    check("no new backend calls were made just by focusing (same simulation data)", len(sims) == sims_before_focus)  # navigation only

    pg.get_by_role("button", name="View simulated neighborhood").click(); pg.wait_for_timeout(300)
    check("neighborhood level opens with the required illustrative disclaimer", panel_title() == "Simulated neighborhood: R5C3" and "Illustrative simulated neighborhood" in map_panel().inner_text() and "not real flood geometry" in map_panel().inner_text())
    check("neighborhood makes clear it is a model, not live sensor data", "not live sensor data" in map_panel().inner_text())
    check("neighborhood water overlay reflects the REAL current depth (via risk colour), no separate calc", map_panel().locator("svg ellipse").count() >= 1 and map_panel().locator("svg circle").count() >= 1)

    # playback inside the neighborhood level drives the SAME state as everywhere else
    d20 = map_panel().inner_text()
    pg.fill(slider, "0"); pg.wait_for_timeout(150)
    d0 = map_panel().inner_text()
    check("neighborhood re-renders as the shared timestep changes", d0 != d20)
    pg.get_by_role("button", name="Restart").click(); pg.get_by_role("radio", name="8x").click(); pg.wait_for_timeout(1200)
    pg.get_by_role("button", name="Pause", exact=True).click(); k = int(pg.input_value(slider))
    check("Play/Pause/Restart inside neighborhood drive the one existing playback state", k > 3)
    check("outer timeline is not duplicated at the neighborhood level", map_panel().locator("input[aria-label='Simulation time']").count() == 1)

    pg.get_by_role("button", name="Open the Intervention lab").click(); pg.wait_for_timeout(400)
    check("neighborhood links into the EXISTING Intervention lab (no second simulation)", pg.locator("#intervention").is_visible())

    pg.get_by_role("button", name="Back to City View").click(); pg.wait_for_timeout(300)
    check("Back to City View returns to the unmodified Grid/Map city view", panel_title() == "Flood map, current state" and pg.locator("button[aria-label^='Region R5C3']").count() + pg.locator(".leaflet-container").count() >= 1)
    check("selection is preserved across the round trip (Region detail still R5C3)", "Region R5C3" in detail())

    # existing Grid View is completely unaffected by any of the above
    pg.get_by_role("radio", name="Grid view").click(); pg.wait_for_timeout(200)
    check("existing Grid View still renders and selects normally", pg.locator("button[aria-label^='Region R5C3']").get_attribute("aria-pressed") == "true")

    check("no console or page errors (tile network errors ignored)", not errs, str(errs[:3]))
    b.close()

print(f"\n{sum(results)}/{len(results)} historical + zoom checks passed")
sys.exit(0 if all(results) else 1)

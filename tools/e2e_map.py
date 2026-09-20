"""End-to-end check of Map view in a real browser against the real backend.

Needs:  pip install playwright && playwright install chromium
Run:    start the frontend (npm run dev in frontend/), then  python tools/e2e_map.py
        The backend is started automatically if one isn't already running on :8000, and is
        left running afterward if this script found it already up (see tools/_servers.py).
"""
import json, re, sys, urllib.request
from playwright.sync_api import sync_playwright

from _servers import Backend

def api(path, body):
    req = urllib.request.Request("http://127.0.0.1:8000" + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

results = []
def check(name, ok, info=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info and not ok else ""))

with Backend(), sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.emulate_media(reduced_motion="reduce")
    errs = []; api_calls = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "tile" not in m.text and "Failed to load resource" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("request", lambda r: api_calls.append(r.url) if "/api/" in r.url else None)
    slider = "input[aria-label='Simulation time']"
    label = lambda rid: pg.locator(f".fs-map-label:has(.fs-map-id:text-is('{rid}')) .fs-map-value").inner_text()
    paths = lambda: pg.locator(".leaflet-overlay-pane path.leaflet-interactive")
    detail = lambda: pg.locator("section:has(> header:has-text('Region detail'))").inner_text().replace("\n", " ")

    pg.goto("http://localhost:5173"); pg.wait_for_selector(slider); pg.wait_for_selector("text=Run and compare")
    base = api("/api/simulate", {}); tl = base["timeline"]
    check("grid view is the default and Leaflet is not loaded yet", pg.locator("button[aria-label^='Region R5C3']").count() == 1 and pg.locator(".leaflet-container").count() == 0)

    pg.wait_for_timeout(1200)   # let the lab's debounced start-up preview finish
    calls_before = len(api_calls)
    pg.get_by_role("radio", name="Map view").click(); pg.wait_for_selector(".leaflet-container"); pg.wait_for_timeout(800)
    check("map view draws one overlay per region", paths().count() == 25, str(paths().count()))
    check("switching views makes no backend call (same state, new visualization)", len(api_calls) == calls_before, str(api_calls[calls_before:]))
    check("visible OpenStreetMap attribution", "OpenStreetMap contributors" in pg.locator(".leaflet-control-attribution").inner_text() and pg.locator(".leaflet-control-attribution").is_visible())
    note = pg.locator(".leaflet-container").locator("xpath=following-sibling::div[1]//*[@role='note']").inner_text()
    check("required disclaimer is shown next to the map", note == "Illustrative simulation \u2014 not real flood risk." and "Bengaluru" in pg.locator(".leaflet-container").locator("xpath=..").inner_text(), note)
    box = pg.locator(".leaflet-container").bounding_box()
    check("map has a fixed height", 350 <= box["height"] <= 530, str(box))

    for k in (0, 33, 60):
        pg.fill(slider, str(k)); pg.wait_for_timeout(150)
        want = round(tl["water_levels"][k][4][2] * 100)
        check(f"step {k}: map label for R5C3 = API depth ({want} cm)", label("R5C3") == f"{want} cm", label("R5C3"))
    r5 = paths().nth(22)
    check("critical region uses the FLOWSHIELD critical colour", r5.get_attribute("stroke") == "#a8231c", str(r5.get_attribute("stroke")))

    # click a region on the map -> same selection state as the grid
    paths().nth(17).click(); pg.wait_for_timeout(250)   # R4C3 (row 3, col 2)
    check("clicking a map region selects it and updates Region detail", "Region R4C3" in detail() and paths().nth(17).get_attribute("stroke") == "#10273d", detail()[:60])
    pg.fill(slider, "20"); pg.wait_for_timeout(150); d20 = detail(); pg.fill(slider, "59"); pg.wait_for_timeout(150)
    check("region detail follows the timestep while in map view", f"{tl['water_levels'][20][3][2]:.2f} m" in d20 and f"{tl['water_levels'][59][3][2]:.2f} m" in detail())
    pg.get_by_role("radio", name="Grid view").click(); pg.wait_for_timeout(200)
    check("selection is shared: grid shows R4C3 selected", pg.locator("button[aria-label^='Region R4C3']").get_attribute("aria-pressed") == "true")
    pg.click("button[aria-label^='Region R5C2']"); pg.get_by_role("radio", name="Map view").click(); pg.wait_for_timeout(500)
    check("selection made in the grid shows on the map", paths().nth(21).get_attribute("stroke") == "#10273d")

    # playback in map view
    pg.get_by_role("button", name="Restart").click(); pg.get_by_role("radio", name="8x").click(); pg.wait_for_timeout(1200)
    pg.get_by_role("button", name="Pause", exact=True).click(); k = int(pg.input_value(slider))
    check("playback drives the map", k > 3 and label("R5C3") == f"{round(tl['water_levels'][k][4][2] * 100)} cm", f"{k} {label('R5C3')}")
    pg.get_by_role("radio", name="1x").click()

    # views, scenario, interventions in map view
    pg.get_by_role("radio", name="Risk", exact=True).click(); pg.fill(slider, "60"); pg.wait_for_timeout(200)
    check("risk view fill = critical colour", paths().nth(22).get_attribute("fill") == "#a8231c")
    pg.get_by_role("radio", name="Water depth").click()
    pg.get_by_role("radio", name=re.compile("^Extreme rainfall")).click(); pg.get_by_role("button", name="Run scenario").click(); pg.wait_for_timeout(1200)
    ext = api("/api/simulate", {"scenario": {"id": "extreme_rainfall"}})
    pg.fill(slider, "60"); pg.wait_for_timeout(200)
    check("scenario results show on the map", pg.locator(".leaflet-container").count() == 1 and label("R5C3") == f"{round(ext['timeline']['water_levels'][60][4][2] * 100)} cm", label("R5C3"))
    lab = pg.locator("#intervention")
    pg.get_by_role("radio", name=re.compile("^Activate emergency pump")).click(); lab.locator("button[aria-label^='R5C3,']").click(); pg.wait_for_timeout(500)
    lab.get_by_role("button", name="Add to plan").click(); lab.get_by_role("button", name="Run with interventions").click(); pg.wait_for_timeout(1200)
    check("intervention-changed region is marked on the map", paths().nth(22).get_attribute("stroke-dasharray") in ("6 4", "6,4") or paths().nth(22).get_attribute("stroke") == "#a8231c")
    check("intervention legend line shown in map view", pg.locator("text=Dashed green outline").count() == 1)

    # header / demo bar stay above the map; demo mode works in map view
    pg.evaluate("document.getElementById('progression').scrollIntoView()"); pg.wait_for_timeout(300)
    z = pg.evaluate("(() => { const h=document.querySelector('header'); const r=h.getBoundingClientRect(); const el=document.elementFromPoint(r.left+200, r.top+20); return h.contains(el); })()")
    check("sticky header stays above the map", z)
    pg.get_by_role("button", name="Run demo").click(); bar = pg.locator("aside[aria-label='Demo mode']")
    wait = "(() => { const b=[...document.querySelectorAll('aside[aria-label=\"Demo mode\"] button')].pop(); return b && b.textContent !== 'Working'; })()"
    for _ in range(6):
        pg.wait_for_function(wait); pg.wait_for_timeout(450); bar.get_by_role("button", name="Next step").click()
    pg.wait_for_selector("#modeled-impact >> text=/^Modeled result$/"); pg.wait_for_timeout(400)
    check("demo mode completes in map view, map still mounted", pg.locator(".leaflet-container").count() == 1 and "with 2 interventions" in pg.locator("section[aria-label='State of these results']").inner_text())
    bar.get_by_role("button", name="Exit demo").click()
    pg.evaluate("document.getElementById('progression').scrollIntoView()"); pg.wait_for_timeout(300); pg.screenshot(path="/tmp/map.png")
    check("no console or page errors (tile network errors ignored)", not errs, str(errs[:3]))
    b.close()

print(f"\n{sum(results)}/{len(results)} map checks passed")
sys.exit(0 if all(results) else 1)

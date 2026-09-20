"""End-to-end check of Demo mode in a real browser against the real backend.

Needs:  pip install playwright && playwright install chromium
Run:    start the frontend (npm run dev in frontend/), then  python tools/e2e_demo.py
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

SCENARIO = {"id": "heavy_rainfall", "params": {"rainfall_multiplier": 1.3}}
fmt = lambda n: f"{n:,}"

with Backend(), sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []; sims = []; cmps = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "403" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.on("request", lambda r: (sims if r.url.endswith("/api/simulate") else cmps if r.url.endswith("/api/compare") else []).append(json.loads(r.post_data or "null")))
    slider = "input[aria-label='Simulation time']"
    bar = pg.locator("aside[aria-label='Demo mode']")
    state = lambda: pg.locator("section[aria-label='State of these results'] .font-display").inner_text()
    impact = lambda: pg.locator("#modeled-impact").inner_text().replace("\n", " ")
    def nxt():
        bar.get_by_role("button", name="Next step").click()
        pg.wait_for_function("(() => { const b=[...document.querySelectorAll('aside[aria-label=\"Demo mode\"] button')].pop(); return b && b.textContent !== 'Working'; })()")
        pg.wait_for_timeout(350)
    def title(): return bar.locator("p.font-display").inner_text()

    pg.goto("http://localhost:5173"); pg.wait_for_selector(slider); pg.wait_for_selector("text=Run and compare")

    def run_demo(label, dirty=False):
        if dirty:  # leave the app in a messy manual state first: the demo must reset it
            pg.locator("aside#simulate input[type=range]").first.fill("200")
            pg.locator("aside#simulate input[type=number]").first.fill("0.05")
            pg.get_by_role("radio", name=re.compile("^Drainage failure")).click(); pg.get_by_role("button", name="Run scenario").click(); pg.wait_for_timeout(900)
        start = pg.get_by_role("button", name="Run demo") if bar.count() == 0 else bar.get_by_role("button", name="Restart demo")
        start.click(); pg.wait_for_selector("aside[aria-label='Demo mode']")
        pg.wait_for_function("(() => { const b=[...document.querySelectorAll('aside[aria-label=\"Demo mode\"] button')].pop(); return b && b.textContent === 'Next step'; })()"); pg.wait_for_timeout(350)
        check(f"{label} 1 baseline: default request, state Baseline, shown at end of run", sims[-1] == {"config": {"duration_minutes": 60, "timestep_minutes": 1, "warning_threshold": 0.15, "critical_threshold": 0.3}} and state() == "Baseline" and pg.input_value(slider) == "60", str(sims[-1])[:150] + state())
        nxt()
        check(f"{label} 2 heavy rain scenario is run for real", sims[-1].get("scenario") == SCENARIO and "interventions" not in sims[-1] and state() == "Scenario: Heavy rainfall", state())
        nxt(); pg.wait_for_timeout(700); s1 = int(pg.input_value(slider)); pg.wait_for_timeout(500); s2 = int(pg.input_value(slider))
        check(f"{label} 3 progression is playing from the start", 0 < s1 < s2 <= 60, f"{s1}->{s2}")
        nxt()
        heavy = api("/api/simulate", {"scenario": SCENARIO}); ect = heavy["summary"]["earliest_critical_time"]; first = heavy["summary"]["earliest_critical_region"]
        step_now = pg.locator("section[aria-label='Current state']").inner_text()
        check(f"{label} 4 jumped to first critical ({ect:g} min) and selected {first}", f"{ect:g} min" in step_now and pg.locator(f"text=/^Region {first}$/").count() >= 1 and pg.get_by_role("button", name="Pause", exact=True).count() == 0, step_now[:80])
        nxt(); pg.wait_for_timeout(900)
        lab = pg.locator("#intervention").inner_text()
        check(f"{label} 5 plan built from the real result, with backend change preview", f"Activate emergency pump on {first}" in lab and "Increase drainage capacity on every region" in lab and "drain capacity" in lab and "Intervention plan (2)" in lab)
        nxt()
        plan = sims[-1].get("interventions")
        check(f"{label} 6 run with interventions (same scenario and controls)", plan == [{"id": "activate_pump", "targets": [first], "params": {"pump_capacity": 60}}, {"id": "increase_drainage", "params": {"increase_percent": 50}}] and sims[-1]["scenario"] == SCENARIO and state() == "Scenario: Heavy rainfall with 2 interventions", str(plan))
        nxt(); pg.wait_for_selector("#modeled-impact >> text=/^Modeled result$/")
        c = api("/api/compare", {"scenario": SCENARIO, "interventions": plan}); m = {x["key"]: x for x in c["metrics"]}; t = impact()
        check(f"{label} 7 modeled impact = /api/compare", cmps[-1]["interventions"] == plan and fmt(m["affected_population"]["without"]) in t and fmt(m["affected_population"]["with"]) in t and f"{c['region_summary']['improved_count']} improved" in t and "MODELED IMPACT" in t)
        check(f"{label} demo ends cleanly (Next disabled, fact line from real data)", bar.get_by_role("button", name="End of demo").is_disabled() and f"{c['region_summary']['improved_count']} regions improved" in bar.inner_text())
        return t, pg.locator("section[aria-labelledby='forecast-heading']").inner_text()

    first_run = run_demo("run A:")
    second_run = run_demo("run B (after messy manual state):", dirty=True)
    check("demo is deterministic: both runs show identical results", first_run == second_run)
    check("demo left the controls at their defaults", pg.locator("aside#simulate input[type=number]").first.input_value() == "0.15")

    bar.get_by_role("button", name="Exit demo").click()
    check("exit removes the demo bar and keeps the results", bar.count() == 0 and state() == "Scenario: Heavy rainfall with 2 interventions")
    pg.get_by_role("button", name="Return to baseline").first.click(); pg.wait_for_timeout(1000)
    check("manual controls still work after the demo", state() == "Baseline" and sims[-1] == {"config": {"duration_minutes": 60, "timestep_minutes": 1, "warning_threshold": 0.15, "critical_threshold": 0.3}})
    check("no console or page errors", not errs, str(errs[:3]))
    b.close()

print(f"\n{sum(results)}/{len(results)} demo checks passed")
sys.exit(0 if all(results) else 1)

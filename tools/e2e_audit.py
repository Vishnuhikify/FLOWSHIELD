"""End-to-end audit of the whole FLOWSHIELD workflow in a real browser against the real backend.

This check deliberately takes the backend down and back up again (to test the app's offline banner), so
it uses the MANAGED lifecycle from tools/_servers.py: it takes full control of port 8000 for its run,
stopping whatever answers there - even a backend you started by hand - and leaves a healthy one running
when it finishes. The other tools/e2e_*.py checks use the gentler AUTO lifecycle instead.

Needs:  pip install playwright && playwright install chromium
Run:    start the frontend (npm run dev in frontend/), then  python tools/e2e_audit.py
"""
import json, math, re, time, urllib.request
from playwright.sync_api import sync_playwright

from _servers import Backend

bk = Backend()

def api(path, body):
    req=urllib.request.Request("http://127.0.0.1:8000"+path,data=json.dumps(body).encode(),headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req))
results=[]
def check(name, ok, info=""):
    results.append(ok); print(("PASS " if ok else "FAIL ")+name+(f"  [{info}]" if info and not ok else ""))

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":1000})
    errs=[]; sims=[]
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" and "403" not in m.text and "422" not in m.text and "500" not in m.text and "502" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR "+str(e)))
    pg.on("request", lambda r: sims.append(json.loads(r.post_data)) if r.url.endswith("/api/simulate") else None)
    slider="input[aria-label='Simulation time']"
    fc=lambda: pg.locator("section[aria-labelledby='forecast-heading']").inner_text().replace("\n"," ")
    now=lambda: pg.locator("section[aria-label='Current state']").inner_text().replace("\n"," ").replace("critical"," critical").replace("warning"," warning")
    ew=lambda: pg.locator("section[aria-label='Early warning status']").inner_text().replace("\n"," ")
    st=lambda: pg.locator("section[aria-label='State of these results'] .font-display").inner_text()
    lab=pg.locator("section:has(> header:has-text('Intervention lab'))")
    def pause():
        if pg.get_by_role("button", name="Pause", exact=True).count(): pg.get_by_role("button", name="Pause", exact=True).click()
    def wait_run(): pg.wait_for_function("!document.querySelector('[aria-busy=true]')"); pg.wait_for_timeout(250); pause()
    fmt=lambda n: f"{n:,}"

    # ---------- A. backend down at load, then recover with storm intensity != 100 (bug B4)
    bk.force_down()
    pg.goto("http://localhost:5173"); pg.wait_for_selector("[role=alert]")
    pg.wait_for_selector("text=Simulation server unreachable"); alerts=" | ".join(pg.locator("[role=alert]").all_inner_texts()).replace("\n"," ")
    check("offline: clear error banner + header offline", "Can't reach the simulation server" in alerts and "offline" in pg.locator("header [role=status]").inner_text(), alerts[:300]+" || "+pg.locator("header [role=status]").inner_text())
    check("offline: labs degrade with retry buttons", pg.get_by_role("button", name="Load scenarios again").count()==1 and pg.get_by_role("button", name="Load interventions again").count()==1)
    check("offline: no results rendered, no crash", pg.locator(slider).count()==0 and not errs, str(errs))
    bk.force_up()
    pg.locator("aside input[type=range]").first.fill("150")
    pg.get_by_role("button", name="Run simulation").click(); pg.wait_for_selector(slider); wait_run()
    sent=sims[-1]; direct=api("/api/simulate",{})
    check("recovery: intensity 150% is actually sent (pattern fetched first)", isinstance(sent.get("rainfall"),list) and sent["rainfall"][0][0]==direct["city"]["rainfall"][0][0]*1.5, str(sent)[:120])
    check("header back online", "online" in pg.locator("header [role=status]").inner_text())
    pg.get_by_role("button", name="Load scenarios again").click() if pg.get_by_role("button", name="Load scenarios again").count() else None
    pg.get_by_role("button", name="Load interventions again").click() if pg.get_by_role("button", name="Load interventions again").count() else None
    pg.wait_for_selector("text=Run and compare")

    # ---------- B. baseline
    pg.locator("aside input[type=range]").first.fill("100")
    check("controls-changed notice appears", pg.locator("text=simulation controls changed since these results").count()==1)
    pg.get_by_role("button", name="Run simulation").click(); wait_run()
    check("controls-changed notice clears after run", pg.locator("text=simulation controls changed since these results").count()==0)
    base=api("/api/simulate",{}); s=base["summary"]
    check("baseline request is the plain default", sims[-1]=={"config":{"duration_minutes":60,"timestep_minutes":1,"warning_threshold":0.15,"critical_threshold":0.3}}, str(sims[-1]))
    check("baseline forecast cards = API", fmt(s["affected_population"]) in fc() and f"{s['earliest_critical_time']:g} min" in fc() and f"{s['max_water_level']:.2f} m" in fc(), fc())
    baseline_fc=fc()

    # ---------- C. progression / current vs forecast
    tl=base["timeline"]
    for k in (0,7,33,60):
        pg.fill(slider,str(k)); pg.wait_for_timeout(80)
        t=now(); ok = f"{tl['timestamps'][k]:g} min" in t and f"Step {k} of 60" in t and f"{tl['critical_region_count'][k]} critical" in t and f"{tl['warning_region_count'][k]} warning" in t and fmt(tl['critical_population'][k]) in t
        check(f"now-strip at step {k} = API timeline", ok, t)
        if k==7: check("forecast cards do not move with the timeline", fc()==baseline_fc)
    cell=pg.locator("button[aria-label^='Region R5C3']").get_attribute("aria-label")
    check("grid cell depth at end = API", f"{round(tl['water_levels'][60][4][2]*100)} cm" in cell and "critical" in cell, cell)
    pg.get_by_role("button", name="Restart").click(); pg.get_by_role("radio", name="8x").click(); pg.wait_for_timeout(900)
    a=int(pg.input_value(slider)); pg.get_by_role("button", name="Pause", exact=True).click(); pg.wait_for_timeout(300)
    check("restart plays from 0, pause holds", 5<a<40 and a <= int(pg.input_value(slider)) <= a+4, str(a))
    pg.get_by_role("button", name="Play", exact=True).click(); pg.wait_for_timeout(4200)
    check("playback stops exactly at the last step", pg.input_value(slider)=="60" and pg.get_by_role("button", name="Play", exact=True).count()==1)
    pg.get_by_role("radio", name="1x").click()

    # ---------- D. early warning
    pg.get_by_role("button", name="First warning,").click(); check("jump first warning", f"Step {next(i for i,(w,c) in enumerate(zip(tl['warning_region_count'],tl['critical_region_count'])) if w+c>0)} of" in now())
    pg.fill(slider,"25"); pg.wait_for_timeout(100)
    check("banner: now vs forecast sentences", "Now:" in ew() and "Under this simulation, R5C3 turns critical in 8 min" in ew(), ew())
    check("banner first critical = API", f"{s['earliest_critical_time']:g} min" in ew())
    nvf=pg.locator("section:has(> header:has-text('Early warning')) table").first.inner_text().replace("\n"," ")
    check("now-vs-forecast table = API", fmt(tl["affected_population"][25]) in nvf and fmt(s["affected_population"]) in nvf, nvf)

    # ---------- E. every scenario
    cat=api  # noqa
    names={"normal_rainfall":"Normal rainfall","heavy_rainfall":"Heavy rainfall","extreme_rainfall":"Extreme rainfall","drainage_failure":"Drainage failure","blocked_channel":"Blocked drainage channel"}
    for sid,name in names.items():
        pg.get_by_role("radio", name=re.compile("^"+name)).click(); pg.get_by_role("button", name="Run scenario").click(); wait_run()
        d=api("/api/simulate",{"scenario":{"id":sid}})["summary"]; t=fc()
        ect="None" if d["earliest_critical_time"] is None else f"{d['earliest_critical_time']:g} min"
        check(f"scenario {sid}: UI = API + labelled", fmt(d["affected_population"]) in t and ect in t and f"{d['max_water_level']:.2f} m" in t and st()==f"Scenario: {name}", t[:200])
    check("early warning + playback alive on scenario results", "Early warning" in ew() and pg.locator(slider).count()==1)

    # ---------- F. every intervention (on blocked channel)
    for iname,needs in [("Unblock drain",True),("Increase drainage capacity",False),("Activate emergency pump",True),("Restore blocked channel",False)]:
        pg.get_by_role("radio", name=re.compile("^"+iname)).click()
        if needs and lab.locator("button[aria-pressed=true][aria-label^='R5C3,']").count()==0: lab.locator("button[aria-label^='R5C3,']").click()
        pg.wait_for_timeout(450); lab.get_by_role("button", name="Add to plan").click(); pg.wait_for_timeout(200)
    check("plan has 4 items with backend change previews", lab.locator("ol > li").count()==4 and "drain capacity" in lab.locator("ol").inner_text())
    lab.get_by_role("button", name="Run with interventions").click(); wait_run()
    plan_sent=sims[-1]["interventions"]
    d=api("/api/simulate",{"scenario":{"id":"blocked_channel"},"interventions":plan_sent})
    check("interventions: UI = API + labelled", f"{d['summary']['max_water_level']:.2f} m" in fc() and fmt(d["summary"]["affected_population"]) in fc() and st()=="Scenario: Blocked drainage channel with 4 interventions", st()+" | "+fc()[:150])
    check("map markers = changed regions", pg.locator("button[aria-label*='drain changed by an intervention']").count()==d["interventions"]["changed_region_count"])

    # ---------- G. comparison
    lab.get_by_role("button", name="Compare both runs").click(); pg.wait_for_selector("text=Modeled result"); pg.wait_for_timeout(400)
    c=api("/api/compare",{"scenario":{"id":"blocked_channel","params":{"channel_remaining":0,"rainfall_multiplier":1}},"interventions":plan_sent})
    imp=pg.locator("#modeled-impact").inner_text().replace("\n"," ")
    m={x["key"]:x for x in c["metrics"]}; rs=c["region_summary"]
    check("comparison: UI = /api/compare", fmt(m["affected_population"]["without"]) in imp and fmt(m["affected_population"]["with"]) in imp and f"{rs['improved_count']} improved" in imp and f"{rs['worsened_count']} worsened" in imp and "MODELED IMPACT" in imp, imp[:300])
    check("comparison 'without' side = the scenario-only run", c["runs"]["without"]==api("/api/simulate",{"scenario":{"id":"blocked_channel"}})["summary"])
    lab.get_by_role("button", name="Run without interventions").click(); wait_run()
    check("run without keeps plan + comparison, state = scenario only", st()=="Scenario: Blocked drainage channel" and lab.locator("ol > li").count()==4 and pg.locator("#modeled-impact >> text=/^Modeled result$/").count()==1, f"{st()} | plan {lab.locator('ol > li').count()} | impact {pg.locator('text=Modeled result').count()}")

    # ---------- H. baseline preserved
    pg.get_by_role("button", name="Return to baseline").first.click(); wait_run()
    check("baseline identical after all scenarios/interventions", fc()==baseline_fc and st()=="Baseline" and api("/api/simulate",{})==base, fc()[:160])
    check("comparison flagged stale after baseline reset", pg.locator("text=changed since this comparison was made").count()==1)

    # ---------- I. backend validation error surfaces cleanly
    def corrupt(route):
        body=json.loads(route.request.post_data); body["config"]["flow_rate"]=9; route.continue_(post_data=json.dumps(body))
    pg.route("**/api/simulate", corrupt); pg.get_by_role("button", name="Run simulation").click(); pg.wait_for_selector("text=Simulation not run")
    al=pg.locator("[role=alert]:has-text('Simulation not run')").inner_text()
    check("API validation error shown with field, old results kept", "config" in al and "flow_rate" in al and pg.locator(slider).count()==1, al)
    pg.unroute("**/api/simulate")

    # ---------- J. latest request wins
    pg.get_by_role("radio", name=re.compile("^Extreme rainfall")).click(); pg.get_by_role("button", name="Run scenario").click()
    pg.get_by_role("radio", name=re.compile("^Normal rainfall")).click(); pg.get_by_role("button", name="Run scenario").dispatch_event("click"); wait_run(); pg.wait_for_timeout(500)
    check("rapid re-run: results match the last request", st()==("Scenario: "+names[sims[-1]["scenario"]["id"]]) and pg.locator("[role=alert]:has-text('Simulation not run')").count()==0, st())

    # ---------- K. large grid through the UI (real backend, 40x40)
    N=40; city={"rows":N,"cols":N,"drainage_capacity":15,"population":120,"rainfall":90,"elevation":[[round(10+0.6*math.sin(r/5)+0.5*math.cos(c/6)+0.004*(r+c),3) for c in range(N)] for r in range(N)]}
    def big(route):
        body=json.loads(route.request.post_data); body["city"]=city; body.pop("rainfall",None); route.continue_(post_data=json.dumps(body))
    for pat in ("**/api/simulate","**/api/compare","**/api/interventions/preview"): pg.route(pat, big)
    pg.get_by_role("button", name="Return to baseline").first.click() if pg.get_by_role("button", name="Return to baseline").first.is_enabled() else None
    pg.get_by_role("radio", name=re.compile("^Baseline")).click(); t0=time.time(); pg.get_by_role("button", name="Run scenario").click(); pg.wait_for_selector("canvas"); t1=time.time()-t0
    pg.get_by_role("radio", name="8x").click(); pg.wait_for_timeout(1500); pause(); stepped=int(pg.input_value(slider))
    check(f"40x40: canvas renders ({t1:.1f}s) and plays at 8x", stepped>8, str(stepped))
    check("40x40: lab falls back from picker, lists capped", "Select a region on the flood map" in lab.inner_text() and "most urgent of" in pg.locator("section:has(> header:has-text('Early warning'))").inner_text())
    pg.get_by_role("radio", name=re.compile("^Increase drainage capacity")).click(); pg.wait_for_timeout(500)
    lab.get_by_role("button", name="Add to plan").click(); lab.get_by_role("button", name="Compare both runs").click(); pg.wait_for_function("document.querySelector('#modeled-impact')?.innerText.includes('without and with 1 intervention') && !document.querySelector('#modeled-impact [aria-busy=true]')", timeout=20000); pg.wait_for_timeout(300)
    imp=pg.locator("#modeled-impact"); info=f"map {imp.locator('button[aria-label*=\": \"]').count()} rows {imp.locator('tbody tr').count()} | "+imp.inner_text().replace("\n"," ")[:400]
    check("40x40: comparison renders, change map skipped, table paged", imp.locator("button[aria-label*=': ']").count()==0 and imp.locator("tbody tr").count()==15, info)
    check("no console/page errors in the whole session", not errs, str(errs[:3]))
    b.close()
bk.force_up()  # leave a healthy backend running for the next check, matching the other scripts
print(f"\n{sum(results)}/{len(results)} audit checks passed")

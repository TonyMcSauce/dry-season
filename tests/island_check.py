"""Browser check of the Live Island against Apple's sizes, and the stretching bug.

Run from the repo root:  python3 tests/island_check.py
Needs Python Playwright with Chromium.
"""
import os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', ROOT],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    now = int(time.time() * 1000); H = 3600e3
    st = {"profile": {"kg": 80, "sex": "m", "beta": 0.015, "limit": 0.05, "island": True},
          "session": {"start": now - 2.5 * H, "end": now, "still": True, "fed": False, "driveAt": None, "water": None,
                      "drinks": [{"name": "Corona Extra", "abv": 4.5, "ml": 355, "qty": 4, "share": 1}]},
          "history": [], "favs": ["hsil", "corona"]}
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for vw, vh, ear, exp_w in ((393, 852, 52.33, 371), (430, 932, 62.33, 408)):
                for mode in ('fused:59', ''):
                    ctx = b.new_context(viewport={'width': vw, 'height': vh}, service_workers='block')
                    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
                    url = f'http://localhost:{port}/' + ('?island=' + mode if mode else '')
                    pg.goto(url)
                    pg.evaluate("s=>{localStorage.setItem('dryseason.v1',JSON.stringify(s));localStorage.setItem('dryseason.app',JSON.stringify({seenVersion:self.DRY_VERSION}))}", st)
                    pg.goto(url); pg.wait_for_timeout(1000)
                    if not mode:
                        pg.evaluate('window.scrollTo(0, 800)')
                    pg.wait_for_timeout(1200)
                    box = lambda: pg.locator('.island').bounding_box()
                    widths = []
                    for _ in range(6):
                        widths.append(round(box()['width'], 1)); pg.wait_for_timeout(1000)
                    want = round(126 + 2 * ear, 1)
                    assert set(widths) == {want}, f'{vw} {mode or "floating"}: compact width drifted {widths}, want {want}'
                    assert abs(box()['height'] - 36.67) < 0.5
                    for view in ('expanded', 'quick'):
                        pg.evaluate(f"DryIsland.current.expand('{view}')"); pg.wait_for_timeout(1300)
                        bb = box()
                        assert abs(bb['width'] - exp_w) < 0.6, f'{view} width {bb["width"]}'
                        assert 84 <= bb['height'] <= 160.5, f'{view} height {bb["height"]}'
                        natural = pg.evaluate(f"document.querySelector('.iv-{view}').scrollHeight")
                        assert natural <= 160.5, f'{view} content {natural}px would be clipped'
                    print(f'ok  {vw} pt {mode or "floating"}: compact {want} wide and steady, expanded and quick within {exp_w} x 84-160')
                    ctx.close()
            b.close()
    finally:
        srv.terminate()
    assert not errors, errors
    print('ok  no page errors')


if __name__ == '__main__':
    main()

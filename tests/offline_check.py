"""End-to-end check of the offline and update flow.

Run from the repo root:  python3 tests/offline_check.py [screenshot_dir]
Needs Python Playwright with Chromium.

1. Serves a copy of the site on localhost and opens it, so the service worker saves everything.
2. Stops the server completely, reloads, and confirms the app, fonts and drink picker still work.
3. Starts the server again with a bumped version, taps Check for updates, and confirms the
   update card appears, Update now reloads into the new version and the What's new sheet shows,
   with the tab kept.
"""
import os, re, shutil, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


PORT = free_port()
URL = f'http://localhost:{PORT}/'


def serve(directory):
    proc = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', directory],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if proc.poll() is not None:
            raise RuntimeError(f'server could not start on port {PORT}')
        try:
            socket.create_connection(('127.0.0.1', PORT), timeout=0.2).close()
            SERVERS.append(proc)
            return proc
        except OSError:
            time.sleep(0.1)
    raise RuntimeError('server did not start')


def shot(page, name):
    if SHOTS:
        page.screenshot(path=os.path.join(SHOTS, name))


def main():
    site = tempfile.mkdtemp(prefix='dry-site-')
    for f in os.listdir(ROOT):
        if f in ('.git', 'tests'):
            continue
        src = os.path.join(ROOT, f)
        (shutil.copytree if os.path.isdir(src) else shutil.copy)(src, os.path.join(site, f))
    version = re.search(r"DRY_VERSION = '([^']+)'", open(os.path.join(site, 'version.js')).read()).group(1)

    server = serve(site)
    try:
        run(site, version, server)
    finally:
        for proc in SERVERS:
            proc.terminate()
        shutil.rmtree(site, ignore_errors=True)


SERVERS = []


def run(site, version, server):
    external, errors = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark')
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: external.append(r.url) if not r.url.startswith(URL) and not r.url.startswith('data:') else None)

        # 1. First visit online
        page.goto(URL)
        page.evaluate("navigator.serviceWorker.ready")
        page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
        page.wait_for_function("caches.keys().then(k => k.length > 0)")
        cached = page.evaluate("caches.open('dry-season-' + self.DRY_VERSION).then(c => c.keys()).then(k => k.length)")
        assert cached >= 14, f'only {cached} files saved'
        print(f'ok  first visit saved {cached} files for version {version}')

        # 2. Fully offline: the server is gone
        server.terminate(); server.wait()
        ctx.set_offline(True)
        page.reload()
        page.wait_for_selector('#clearTime')
        page.evaluate("document.fonts.ready")
        fonts = page.evaluate("[document.fonts.check('16px \"Alfa Slab One\"'), document.fonts.check('700 16px \"Schibsted Grotesk\"')]")
        assert all(fonts), f'fonts missing offline: {fonts}'
        assert page.is_visible('#net'), 'offline badge not shown'
        page.click('#openPicker')
        page.wait_for_selector('.pick-group.favs')
        favs = page.eval_on_selector_all('.pick-group.favs .pick-name', 'els => els.map(e => e.textContent)')
        assert favs == ['Heineken Silver', 'Corona Extra'], favs
        shot(page, 'offline_picker.png')
        page.locator('.pick-group.favs .pick').first.click()
        page.click('#qtyPlus')
        page.click('#cfgAdd')
        page.wait_for_timeout(400)
        rows = page.eval_on_selector_all('#tabList li', 'els => els.length')
        assert rows == 1, rows
        shot(page, 'offline_hero.png')
        print('ok  offline: app, fonts, favourites and adding a drink all work')

        # 3. A new version is published
        new_version = version.rsplit('.', 1)[0] + '.' + str(int(version.rsplit('.', 1)[1]) + 1)
        vfile = os.path.join(site, 'version.js')
        text = open(vfile).read()
        open(vfile, 'w').write(text.replace(version, new_version))
        server = serve(site)
        ctx.set_offline(False)
        page.wait_for_function("navigator.onLine")
        page.evaluate("document.querySelector('#bodyDetails').open = true")
        page.click('#checkNow')
        page.wait_for_selector('#coaster.show', timeout=15000)
        page.wait_for_timeout(800)
        shot(page, 'update_coaster.png')
        print('ok  update card appeared for', new_version)
        with page.expect_navigation(timeout=15000):
            page.click('#updNow')
        page.wait_for_selector('#news[open]', timeout=8000)
        page.wait_for_timeout(500)
        sub = page.text_content('#newsSub')
        assert sub == 'Version ' + new_version, sub
        assert page.eval_on_selector_all('#tabList li', 'els => els.length') == 1, 'tab lost after update'
        shot(page, 'whats_new.png')
        print('ok  updated to', new_version, 'with the tab kept and What\'s new shown')

        assert not external, f'third-party requests: {external[:3]}'
        assert not errors, errors
        print('ok  no third-party requests, no page errors')
        browser.close()


if __name__ == '__main__':
    main()

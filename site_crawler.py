#!/usr/bin/env python3
"""
Playwright site crawler: logs in, discovers every reachable page (links, SPA hash routes,
menus, sub-menus, tabs) recursively, and saves a full-page screenshot of each one.

Setup:
    pip install playwright
    playwright install chromium

Run (credentials are read from env vars or prompted - never hard-code them):
    export SITE_USER="your_user"
    export SITE_PASS="your_password"
    python site_crawler.py --base-url "https://y.gpstracktech.com/#/loginv2"

Useful options:
    --headed                 watch the browser
    --max-pages 200          stop after N pages
    --max-depth 6            link depth limit
    --repeat-every 60        re-crawl every 60 minutes (new timestamped folder each run)
    --allow-writes           disable the safety blocker (NOT recommended)

Only use this on sites/accounts you are authorised to test.
"""
import argparse
import csv
import getpass
import json
import os
import re
import sys
import time
from collections import deque
from datetime import datetime
from urllib.parse import urlparse, urldefrag

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# Menu / navigation elements worth clicking when a page uses JS routing (Vue/React/Angular).
CLICKABLE_SELECTORS = [
    "aside li", "nav li", ".sidebar li", ".el-menu-item", ".el-submenu__title", ".el-sub-menu__title",
    ".ant-menu-item", ".ant-menu-submenu-title", ".menu-item", "[role=menuitem]", "[role=tab]",
    ".el-tabs__item", ".ant-tabs-tab", ".nav-link", ".nav-item",
    "[class*=menu] li", "[class*=sidebar] li",
]

# Never click anything whose text looks destructive or ends the session.
DANGEROUS_TEXT = re.compile(
    r"\b(delete|remove|del|reset|clear|logout|log out|sign out|exit|unbind|disable|cut|disconnect|"
    r"restart|shutdown|factory|format|clean|revoke|cancel|reboot)\b", re.I)

# Network safety net: block requests that change data or send commands to devices.
DANGEROUS_REQUEST = re.compile(
    r"/(del|delete|remove|reset|clear|add|update|modify|save|transfer|recharge|command|"
    r"oilElectric|shutdown|restart|unbind|import|upload)[A-Za-z]*(/|\?|$)", re.I)


def slugify(url: str) -> str:
    p = urlparse(url)
    s = (p.path + ("_" + p.fragment if p.fragment else "")).strip("/")
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")
    return (s or "home")[:90]


def norm(url: str) -> str:
    """Normalise a URL but keep the #/route part, because SPAs live there."""
    base, frag = urldefrag(url)
    frag = frag.split("?")[0].rstrip("/") if frag.startswith("/") else ""
    base = base.rstrip("/")
    return base + ("#" + frag if frag else "")


def same_site(url: str, origin: str) -> bool:
    return urlparse(url).netloc == urlparse(origin).netloc


def settle(page, ms=900):
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except PWTimeout:
        pass
    page.wait_for_timeout(ms)


DIALOG_SEL = ".el-overlay-dialog:visible, .el-message-box:visible, [role=dialog]:visible, .ant-modal-wrap:visible"
CLOSE_SELS = (".el-dialog__headerbtn", ".el-message-box__headerbtn", "button[aria-label=Close]",
              "button[aria-label=close]", ".ant-modal-close", ".close")
SAFE_CONFIRM = r"^(ok|okay|confirm|got it|i know|know|close|skip|later|not now|continue|understood|确定|知道了|关闭)$"


def dismiss_dialogs(page, log=print, allow_confirm=False, accept=False):
    """Close pop-up dialogs (notices, announcements) that block clicks.
    Order: X button -> Escape -> (optional) harmless confirm button.
    Terms/agreement buttons are only clicked if accept=True (--accept-dialogs)."""
    pattern = SAFE_CONFIRM[:-2] + (r"|agree|accept|i agree" if accept else "") + ")$"
    # Never touch a dialog that holds a password field: on this site that IS the login form.
    others = page.locator(DIALOG_SEL).filter(has_not=page.locator("input[type=password]"))
    for _ in range(4):
        try:
            dlg = others.first
            if not dlg.count() or not dlg.is_visible():
                return
            text = (dlg.inner_text(timeout=1000) or "").strip().replace("\n", " ")[:160]
            log(f"    dialog detected: {text!r}")
            closed = False
            for sel in CLOSE_SELS:
                b = dlg.locator(sel)
                if b.count() and b.first.is_visible():
                    b.first.click(timeout=2000)
                    closed = True
                    break
            if not closed:
                page.keyboard.press("Escape")
            page.wait_for_timeout(700)
            if others.count() and others.first.is_visible() and allow_confirm:
                btn = others.first.get_by_role("button", name=re.compile(pattern, re.I))
                if btn.count():
                    log(f"    clicking dialog button: {btn.first.inner_text().strip()!r}")
                    btn.first.click(timeout=2000)
                    page.wait_for_timeout(700)
        except Exception:
            return


def login(page, base_url, user, pwd, args, out_dir, log):
    page.goto(base_url, wait_until="domcontentloaded")
    settle(page, 1500)
    # Pop-ups often fade in a moment after load, so wait briefly for one.
    try:
        page.wait_for_selector(DIALOG_SEL, state="visible", timeout=4000)
    except PWTimeout:
        pass
    dismiss_dialogs(page, log, allow_confirm=True, accept=args.accept_dialogs)
    page.screenshot(path=os.path.join(out_dir, "00_login_page.png"))

    u = page.locator(args.user_selector) if args.user_selector else page.locator(
        "input[type=text]:visible, input[type=email]:visible, input:not([type]):visible").first
    p = page.locator(args.pass_selector) if args.pass_selector else page.locator("input[type=password]:visible").first
    u.fill(user)
    p.fill(pwd)
    dismiss_dialogs(page, log, allow_confirm=True, accept=args.accept_dialogs)

    if args.submit_selector:
        btn = page.locator(args.submit_selector).first
    else:
        # search for the button inside the login form/dialog first, then the whole page
        form = page.locator(DIALOG_SEL).filter(has=page.locator("input[type=password]"))
        scope = form.first if form.count() else page
        named = scope.get_by_role("button", name=re.compile(r"^\s*(log\s*in|sign\s*in|login|submit|登录)\s*$", re.I))
        btn = named.first if named.count() else None
    if btn is None:
        p.press("Enter")
    else:
        try:
            btn.click(timeout=5000)
        except PWTimeout:
            log("    normal click blocked; sending DOM click event instead")
            try:
                btn.dispatch_event("click")
            except Exception:
                p.press("Enter")
    # Success = the password field disappears because the app moved on, not because we closed it.
    try:
        page.wait_for_selector("input[type=password]", state="hidden", timeout=20000)
        logged_in = True
    except PWTimeout:
        logged_in = False
    settle(page, 2500)
    dismiss_dialogs(page, log, allow_confirm=True, accept=args.accept_dialogs)
    if not logged_in or page.locator("input[type=password]:visible").count() > 0:
        try:
            msgs = page.locator(".el-message, .el-form-item__error").all_inner_texts()
            if msgs:
                log(f"    page message: {msgs}")
        except Exception:
            pass
        page.screenshot(path=os.path.join(out_dir, "login_failed.png"))
        raise RuntimeError("Login seems to have failed (password field still visible). "
                           "See login_failed.png in the output folder; check credentials or pass "
                           "--user-selector/--pass-selector/--submit-selector.")


def collect_links(page, origin):
    hrefs = page.eval_on_selector_all(
        "a[href], [routerlink], [data-href], [to]",
        """els => els.map(e => e.getAttribute('href') || e.getAttribute('routerlink')
                          || e.getAttribute('data-href') || e.getAttribute('to'))""")
    out = set()
    for h in hrefs:
        if not h or h.startswith(("javascript:", "mailto:", "tel:")):
            continue
        full = page.evaluate("h => new URL(h, document.baseURI).href", h)
        if same_site(full, origin) and not re.search(r"\.(pdf|zip|exe|apk|png|jpe?g|csv|xlsx?)($|\?)", full, re.I):
            out.add(norm(full))
    return out


def discover_by_clicking(page, current_url, origin, args, log):
    """Click menu items / tabs / expanders and record any new route they navigate to."""
    found = set()
    seen_labels = set()
    for sel in CLICKABLE_SELECTORS:
        try:
            count = page.locator(sel).count()
        except Exception:
            continue
        for i in range(min(count, args.max_clicks_per_selector)):
            try:
                el = page.locator(sel).nth(i)
                if not el.is_visible():
                    continue
                label = (el.inner_text(timeout=1500) or "").strip().split("\n")[0][:60]
                key = (sel, label)
                if not label or key in seen_labels or DANGEROUS_TEXT.search(label):
                    continue
                seen_labels.add(key)
                before = norm(page.url)
                el.click(timeout=2500)
                settle(page, 700)
                after = norm(page.url)
                if after != before and same_site(after, origin):
                    found.add(after)
                    log(f"    click '{label}' -> {after}")
                    page.goto(current_url, wait_until="domcontentloaded")
                    settle(page, 700)
                else:
                    # tab / expander / modal: close modals so the crawl can continue
                    page.keyboard.press("Escape")
            except Exception:
                continue
    return found


def crawl_once(args, user, pwd, out_dir):
    shots = os.path.join(out_dir, "screenshots")
    os.makedirs(shots, exist_ok=True)
    log_path = os.path.join(out_dir, "crawl.log")
    logf = open(log_path, "a", encoding="utf-8")

    def log(msg):
        line = f"[{datetime.now():%H:%M:%S}] {msg}"
        print(line)
        logf.write(line + "\n")
        logf.flush()

    api_calls, blocked = {}, []
    rows = []
    origin = args.base_url

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(viewport={"width": args.width, "height": args.height},
                                  ignore_https_errors=args.ignore_https_errors)
        page = ctx.new_page()
        state = {"logged_in": False}

        def on_request(route, request):
            u = request.url
            if state["logged_in"] and not args.allow_writes and request.method != "GET" \
                    and DANGEROUS_REQUEST.search(urlparse(u).path):
                blocked.append(f"{request.method} {u}")
                return route.abort()
            return route.continue_()

        ctx.route("**/*", on_request)

        def on_response(resp):
            req = resp.request
            if req.resource_type in ("xhr", "fetch"):
                key = f"{req.method} {urlparse(resp.url).path}"
                api_calls.setdefault(key, {"count": 0, "status": resp.status, "found_on": set()})
                api_calls[key]["count"] += 1
                api_calls[key]["found_on"].add(norm(page.url))

        page.on("response", on_response)

        log(f"Logging in at {args.base_url}")
        login(page, args.base_url, user, pwd, args, out_dir, log)
        state["logged_in"] = True
        dismiss_dialogs(page, log, allow_confirm=True, accept=args.accept_dialogs)
        landing = norm(page.url)
        log(f"Logged in. Landing page: {landing}")

        queue = deque([(landing, 0, "landing")])
        visited = set()
        n = 0
        while queue and n < args.max_pages:
            url, depth, source = queue.popleft()
            if url in visited or depth > args.max_depth:
                continue
            visited.add(url)
            try:
                log(f"[{n+1}] depth={depth} {url}")
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                settle(page, args.wait_ms)
                dismiss_dialogs(page, log)
                if page.locator("input[type=password]:visible").count():
                    log("    session expired / redirected to login - skipping")
                    continue
                n += 1
                fname = f"{n:03d}_{slugify(page.url)}.png"
                page.screenshot(path=os.path.join(shots, fname), full_page=True)
                rows.append({"n": n, "url": page.url, "title": page.title(), "depth": depth,
                             "found_from": source, "screenshot": fname})

                new = collect_links(page, origin)
                if not args.no_click:
                    new |= discover_by_clicking(page, url, origin, args, log)
                for link in sorted(new):
                    if link not in visited:
                        queue.append((link, depth + 1, url))
            except Exception as e:
                log(f"    ERROR on {url}: {e}")
                rows.append({"n": "", "url": url, "title": "ERROR", "depth": depth,
                             "found_from": source, "screenshot": str(e)[:120]})
        browser.close()

    with open(os.path.join(out_dir, "pages.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["n", "url", "title", "depth", "found_from", "screenshot"])
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(out_dir, "api_calls.json"), "w", encoding="utf-8") as f:
        json.dump({k: {**v, "found_on": sorted(v["found_on"])} for k, v in sorted(api_calls.items())}, f, indent=2)
    with open(os.path.join(out_dir, "blocked_requests.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(blocked))
    log(f"Done. {n} pages, {len(api_calls)} distinct API calls, {len(blocked)} unsafe requests blocked.")
    log(f"Output: {out_dir}")
    logf.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", required=True, help="Login page URL, e.g. https://site.com/#/login")
    ap.add_argument("--user", default=os.getenv("SITE_USER"))
    ap.add_argument("--password", default=os.getenv("SITE_PASS"))
    ap.add_argument("--out", default="crawl_output")
    ap.add_argument("--max-pages", type=int, default=150)
    ap.add_argument("--max-depth", type=int, default=6)
    ap.add_argument("--max-clicks-per-selector", type=int, default=40)
    ap.add_argument("--wait-ms", type=int, default=1200, help="extra wait after load for charts/maps")
    ap.add_argument("--width", type=int, default=1600)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--no-click", action="store_true", help="only follow links, don't click menus")
    ap.add_argument("--ignore-https-errors", action="store_true")
    ap.add_argument("--allow-writes", action="store_true", help="disable the blocker for unsafe requests")
    ap.add_argument("--accept-dialogs", action="store_true",
                    help="also click Agree/Accept on pop-ups (terms notices); off by default")
    ap.add_argument("--repeat-every", type=int, default=0, help="minutes between re-crawls (0 = run once)")
    ap.add_argument("--user-selector")
    ap.add_argument("--pass-selector")
    ap.add_argument("--submit-selector")
    args = ap.parse_args()

    user = args.user or input("Username: ")
    pwd = args.password or getpass.getpass("Password: ")

    while True:
        out_dir = os.path.join(args.out, datetime.now().strftime("%Y%m%d_%H%M%S"))
        os.makedirs(out_dir, exist_ok=True)
        try:
            crawl_once(args, user, pwd, out_dir)
        except Exception as e:
            print(f"Run failed: {e}", file=sys.stderr)
        if not args.repeat_every:
            break
        print(f"Sleeping {args.repeat_every} min...")
        time.sleep(args.repeat_every * 60)


if __name__ == "__main__":
    main()
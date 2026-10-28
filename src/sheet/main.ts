// RArgu OS sheet entry (spec 001). No old-OS code: not even tokens.css, whose
// shared chunk changed how `/` loads its CSS (R1).
import "./sheet.css";
import "./readme.css";
import hostUrl from "virtual:host-url";
import { cancel as cancelGesture, claim, free } from "./gestures";
import { reloadCss } from "./host/css-retry";
import { showFailure } from "./host/failure";
import { LAYOUT } from "./layout";
import { createView, PHONE } from "./view";
import { createWindows } from "./windows";
import {
  initTabs,
  modeOf,
  onMode,
  registerTool,
  select,
  type Mode,
} from "./tabs";
import { createExpand } from "./expand";
import { initHistory } from "./history";
import { initRead } from "./read";
import { initToolEvents } from "./tool-events";
import { initCaseStudies } from "./case-studies";
import { mount as mountPentimento } from "./demos/pentimento";
import * as castlewars from "./demos/castlewars";
import * as crawler from "./demos/crawler";
import * as insider from "./demos/insider";
import { createVisibility } from "./demos/visibility";
import { initMail } from "./email";

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

// R15: on a phone the card folds into a bar. The toggle exists only once
// JavaScript runs, so without it the card stays whole (R3). Fold before the
// view starts: the phone start view is framed below the bar.
const card = $("#card");
const more = card.querySelector<HTMLElement>(".more")!;
const toggle = document.createElement("button");
toggle.type = "button";
toggle.className = "btn railtoggle";
more.id = "more";
toggle.setAttribute("aria-controls", "more");
card.querySelector(".railtop")!.append(toggle);
card.classList.add("folds");
const fold = (open: boolean) => {
  card.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", `${open}`);
  toggle.textContent = open ? "close ▴" : "about ▾";
};
fold(false);
toggle.addEventListener("click", () => fold(!card.classList.contains("open")));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !card.classList.contains("open")) return;
  fold(false);
  if (matchMedia(PHONE).matches) toggle.focus();
});

// the minimap draws each window where it is now (it draws in a later frame,
// after `wins` exists)
const view = createView(() =>
  LAYOUT.map((s) => {
    const [x, y] = wins.pos(s.id);
    return { id: s.id, x, y, w: s.w, h: s.h, tool: !!s.tool };
  }),
);
const wins = createWindows(view);

// 013 R1: the Demo · Try · Read tabs (test builds: a fixture tool can
// register through `__registerTool`)
// 013 R13: the no-JavaScript link to a write-up's page; the Read tab
// replaces it
for (const a of document.querySelectorAll(".nojs-read")) a.remove();
initTabs();
initRead();
initToolEvents();
initCaseStudies();
if (import.meta.env.MODE === "e2e")
  Object.assign(window, { __registerTool: registerTool });

// R7.a: pressing anywhere in a window brings it to the front
let top = 0;
const front = (w: HTMLElement) => (w.style.zIndex = `${++top}`);
for (const w of document.querySelectorAll<HTMLElement>("[data-win]")) {
  // R19: windows are Tab stops in project-list order (their DOM order); a
  // focused window draws on top, so its focus is not under another window
  w.tabIndex = 0;
  w.addEventListener("pointerdown", () => front(w), { capture: true });
  w.addEventListener("focusin", () => front(w));
}
// R19: on a phone, focus leaving the open card for the sheet folds the card,
// so the focus is not under it
$("#vp").addEventListener("focusin", () => {
  if (card.classList.contains("open") && matchMedia(PHONE).matches) fold(false);
});

// 015 R3: the Email links get their address at start-up (src/sheet/email.ts)
initMail();

/** 004 R11: a Quick tools icon's activation still to come (startApp). */
let pending: { w: HTMLElement } | null = null;

// R12: go to a window where it is now; it never moves. 002 R9: an app's
// proc.spawn goes the same way (`focus` false: the focus stays put).
const go = (id: string, focus = true) => {
  // 004 R11: a new navigation ends a Quick tools icon's pending activation
  pending = null;
  // a held window would follow the pan: end any gesture first
  cancelGesture();
  const s = LAYOUT.find((s) => s.id === id)!;
  const w = $(`[data-win="${s.id}"]`);
  fold(false);
  // a window in flight: where it lands, so the view ends centred on it
  const [x, y] = wins.rest(s.id);
  view.panTo(x, y, s.w, s.h);
  front(w);
  // the pan moves the view; the focus must not scroll it again
  if (focus) view.navFocus(w);
};
for (const b of document.querySelectorAll<HTMLElement>("[data-go]"))
  b.addEventListener("click", () => go(b.dataset.go!));

// R13: end every gesture and motion, then every window flies home from where
// it stopped, at the start zoom, with CastleSiege's home framed. The start
// view comes last: a Home flight of the focused window reveals its home.
$("#reset").addEventListener("click", () => {
  pending = null;
  cancelGesture();
  wins.cancel();
  fold(false);
  for (const s of LAYOUT) wins.home(s.id);
  view.start();
  // on a phone Reset is inside the folded card: keep the focus visible
  if (matchMedia(PHONE).matches) toggle.focus({ preventScroll: true });
});

// spec 005 R6: the Pentimento sketch; it runs only on a press
mountPentimento($('[data-win="pentimento"] .demo-area'), view.stop);

// spec 005 R3, R4: Castle Wars loads when it first comes near the view or is
// used (a press in it, focus into it, the card's link), and animates only
// while it is in the view and the tab is visible
// 013 R2: Expand and Restore in each project window's title bar
const expand = createExpand(view, wins);
for (const b of document.querySelectorAll<HTMLElement>(".bar .expand")) {
  const w = b.closest<HTMLElement>("[data-win]")!;
  b.addEventListener("click", () => {
    // R4, R20: the control keeps the focus (WebKit does not focus a button
    // on a click)
    view.navFocus(b);
    if (expand.current() === w) expand.restore();
    else expand.expand(w);
  });
}
// 013 R3: on a phone Read also expands; Restore there goes back to the
// mode before Read (R20)
onMode((w, mode, was) => {
  if (mode !== "read" || !matchMedia(PHONE).matches || expand.current()) return;
  w.dataset.before = was;
  expand.expand(w);
});
expand.onChange((w, on) => {
  if (on || !w.dataset.before) return;
  select(w, w.dataset.before as Mode);
  delete w.dataset.before;
});

// 013 R12: a /p/<id>/ page opens that window expanded in Read, with the
// focus on the write-up's title (R4)
const [openId, openMode] = (document.body.dataset.open ?? "").split(":");
if (openId && openMode === "read") {
  const w = $(`[data-win="${openId}"]`);
  expand.expand(w, true);
  select(w, "read");
  view.navFocus(w.querySelector<HTMLElement>(".r-title")!);
}
// 013 R20: the URL follows Read (after the direct entry's own Read above)
initHistory(view, expand, wins.pos);

// 013 R6: a demo animates only while its Demo panel is shown, and, while a
// window is expanded, only in that window
const seen = createVisibility(view, wins, $("#vp"), (id) => {
  const w = $(`[data-win="${id}"]`);
  const open = expand.current();
  if ((open && open !== w) || modeOf(w) !== "demo") return false;
  return open ? "expanded" : true;
});
onMode(() => seen.check());
expand.onChange(() => seen.check());
const cw = $('[data-win="castlewars"]');
const cwMount = () =>
  castlewars.mount(cw.querySelector(".demo-area")!, view.stop);
seen.watch("castlewars", (s) => {
  if (s.eligible) cwMount();
  castlewars.show(s.visible);
});
cw.addEventListener("pointerdown", cwMount, { capture: true });
cw.addEventListener("focusin", cwMount);
$('[data-go="castlewars"]').addEventListener("click", cwMount);

// spec 006 R5: the crawler's rows show at once; it streams only while it is
// in the view and the tab is visible
crawler.mount($('[data-win="crawler"] .demo-area'), view.stop);
seen.watch("crawler", (s) => crawler.show(s.visible));

// spec 006 R5: the insider chart and list show complete at once; the chart
// plays from the start the first time the window is in the view, and runs
// only while it is in the view and the tab is visible
insider.mount($('[data-win="insider"] .demo-area'), view.stop);
seen.watch("insider", (s) => insider.show(s.visible));

// spec 002 R11: the hosted apps. The host (and each app) loads only when a
// window meets the start rule (eligible, as for the demos above) or the
// visitor activates it: a press in its demo area, Enter on the placeholder,
// or the card's link. A start by the rule runs in the background.
const HOSTED: Record<string, string> = {
  castlesiege: "castlesiege",
  paint: "paint",
  music: "tracker",
  notes: "writer",
};
type HostModule = typeof import("./host/load");
let hostP: Promise<import("./host/load").Host> | null = null;
let hostTries = 0;
// R12: after a failed load, the host chunk is imported from a fresh URL (a
// browser may keep a failed module fetch for its URL). A failed host
// stylesheet loads again first: the retry import has no CSS preload.
const host = () =>
  (hostP ??= (
    hostTries
      ? reloadCss(hostTries).then(
          () =>
            (hostUrl
              ? import(/* @vite-ignore */ `${hostUrl}?retry=${hostTries}`)
              : import("./host/load")) as Promise<HostModule>,
        )
      : import("./host/load")
  ).then((m) => m.createHost({ hosted: HOSTED, front, show: go })));
const areaOf = (id: string) =>
  $(`[data-win="${id}"]`).querySelector<HTMLElement>(".demo-area")!;
// 004 R11: a Quick tools icon also makes the app the active app once it
// runs, if that navigation is still current: no other navigation, no Reset,
// and the focus has not left the window since. Until the start settles the
// window is marked `data-nav`: the app's own focus() there does nothing
// (host/window.ts), so the focus stays where the visitor puts it.
const nav = (w: HTMLElement, d: number) => {
  const n = Number(w.dataset.nav ?? 0) + d;
  if (n > 0) w.dataset.nav = `${n}`;
  else delete w.dataset.nav;
};
document.addEventListener("focusin", (e) => {
  if (pending && !pending.w.contains(e.target as Node)) pending = null;
});
const startApp = (id: string, background: boolean, activate = false) => {
  const p = host();
  const w = $(`[data-win="${id}"]`);
  const me = activate ? (pending = { w }) : null;
  if (me) nav(w, 1);
  const done = () => me && nav(w, -1);
  p.then(
    (h) =>
      h
        .start(id, background)
        .finally(done)
        .then(() => {
          if (!me || pending !== me) return;
          pending = null;
          if (w.contains(document.activeElement))
            view.navFocus(() => h.activate(id));
        }),
    (err) => {
      done();
      // the host itself did not load: this window shows it, Try again
      // imports it again
      if (hostP === p) {
        hostP = null;
        hostTries++;
      }
      console.warn("app host failed to load:", err);
      showFailure(areaOf(id), err, () => startApp(id, false));
    },
  );
};
// 001 R21, 002 R18: a pointer in a running app is a gesture of that app. It
// claims the one-gesture owner (keyed by the app's demo area), so the paper
// does not pan or pinch, no window drag starts, and another app's press
// waits; it stops the view's motion. A press while another gesture owns the
// input does not reach the app, nor does its click. A cancelled gesture
// (Reset, blur, R13, R21.b) is cancelled in the app too: its target hears a
// pointercancel and loses the pointer capture. (Keys and the wheel:
// host/window.ts.)
const ENDS = ["pointerup", "pointercancel", "lostpointercapture"];
/** pointers whose press was refused, until their next press */
const refused = new Set<number>();
function ownAppPointers(area: HTMLElement): void {
  area.addEventListener(
    "pointerdown",
    (e) => {
      const id = e.pointerId;
      refused.delete(id);
      if (area.dataset.host !== "running") return;
      const target = e.target as Element;
      const up = (u: Event) => {
        if ((u as PointerEvent).pointerId === id) done();
      };
      const off = () => {
        for (const t of ENDS) removeEventListener(t, up, true);
      };
      const done = () => {
        off();
        free(id);
      };
      const cancel = () => {
        off();
        target.dispatchEvent(
          new PointerEvent("pointercancel", {
            pointerId: id,
            pointerType: e.pointerType,
            isPrimary: e.isPrimary,
            bubbles: true,
          }),
        );
        for (let el: Element | null = target; el; el = el.parentElement)
          if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      };
      if (!claim("app", id, 10, cancel, area)) {
        refused.add(id);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      for (const t of ENDS) addEventListener(t, up, true);
      view.stop();
    },
    { capture: true },
  );
  // a keyboard click has no pointer: it still works
  area.addEventListener(
    "click",
    (e) => {
      if (!refused.has((e as PointerEvent).pointerId)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
}
for (const id of Object.keys(HOSTED)) {
  const w = $(`[data-win="${id}"]`);
  const area = areaOf(id);
  // the placeholder becomes the app's start control (inert without JS)
  area.inert = false;
  area.tabIndex = 0;
  area.setAttribute("role", "button");
  area.setAttribute("aria-label", `Start ${w.getAttribute("aria-label")}`);
  ownAppPointers(area);
  area.addEventListener(
    "pointerdown",
    () => {
      // a failed window starts again only by its Try again
      if (area.dataset.host !== "failed") startApp(id, false);
    },
    { capture: true },
  );
  area.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target !== area) return;
    e.preventDefault();
    startApp(id, false);
  });
  // a Quick tools icon (`.app`) also activates the app (004 R11); the
  // project link keeps the focus on the window frame (001 R12)
  const link = $(`[data-go="${id}"]`);
  link.addEventListener("click", () =>
    startApp(id, false, link.classList.contains("app")),
  );
  seen.watch(id, (s) => {
    if (s.eligible && area.dataset.host !== "failed") startApp(id, true);
  });
}

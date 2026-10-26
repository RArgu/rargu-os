// Spec 013 R10, R11, Event contract: a tool (011, 012) reports its stage and
// status on its window node; the write-up's diagram shows them. 013 listens
// from page start and keeps the latest of each, so a Read panel opened later
// shows the current state, and draws at most once per frame. When Read opens
// it sends `tool:read-open`, and the tool answers with what it knows.
import { onMode } from "./tabs";

export interface StageDetail {
  stage: string | null;
  state: "start" | "done" | "error";
  mode: "live" | "replay";
  at: number;
}
export type StatusDetail =
  | { judge: "online" | "offline" | "busy"; at: number }
  | { lastRun: string; nextRun: string; waiting: number; at: number };

interface Box {
  stage: string;
  mark: "running" | "drawing" | "stopped";
}
interface State {
  box: Box | null;
  status: StatusDetail | null;
  /** the stage last announced, so each is announced once */
  said: string | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

/** R11: the text of a status line (insider). */
export function statusLine(s: StatusDetail | null): string {
  if (!s || !("lastRun" in s)) return "Status not available";
  const n = s.waiting;
  return `Last run ${when(s.lastRun)} · next run ${when(s.nextRun)} · ${n} ${n === 1 ? "request" : "requests"} waiting`;
}

export function initToolEvents(): void {
  const states = new Map<HTMLElement, State>();
  const dirty = new Set<HTMLElement>();
  let raf = 0;

  function draw(): void {
    raf = 0;
    for (const win of dirty) {
      const st = states.get(win)!;
      const fig = win.querySelector<HTMLElement>(".read-area .dg");
      if (!fig) continue;
      for (const b of fig.querySelectorAll<HTMLElement>(".dg-box")) {
        const on = !!st.box && st.box.stage === b.dataset.stage;
        b.classList.toggle("active", on && st.box!.mark !== "stopped");
        b.querySelector(".dg-mark")!.textContent = on ? st.box!.mark : "";
      }
      const live = fig.querySelector<HTMLElement>(".dg-live")!;
      const key = st.box && `${st.box.stage}:${st.box.mark}`;
      if (key && key !== st.said) {
        const name = fig.querySelector(
          `[data-stage="${st.box!.stage}"] .dg-name`,
        )?.textContent;
        live.textContent = `${name}: ${st.box!.mark}`;
      }
      st.said = key;
      // crawler: the judge's state in its box, in text
      const judge = fig.querySelector<HTMLElement>('[data-stage="gate-d"]');
      if (judge) {
        let el = judge.querySelector<HTMLElement>(".dg-status");
        const s = st.status && "judge" in st.status ? st.status.judge : null;
        if (s && s !== "online") {
          el ??= judge.appendChild(
            Object.assign(document.createElement("span"), {
              className: "dg-status",
            }),
          );
          el.textContent = s;
        } else el?.remove();
      }
      const line = fig.querySelector<HTMLElement>(".dg-statusline");
      if (line) line.textContent = statusLine(st.status);
    }
    dirty.clear();
  }
  const later = (win: HTMLElement) => {
    dirty.add(win);
    raf ||= requestAnimationFrame(draw);
  };

  for (const win of document.querySelectorAll<HTMLElement>("[data-win]")) {
    const st: State = { box: null, status: null, said: null };
    states.set(win, st);
    // the insider diagram has a status line under it (R11)
    const fig = win.querySelector<HTMLElement>(".read-area .dg");
    if (fig && win.dataset.win === "insider") {
      const p = document.createElement("p");
      p.className = "dg-statusline";
      p.textContent = statusLine(null);
      fig.querySelector("figcaption")!.before(p);
    }
    win.addEventListener("tool:stage", (e) => {
      const d = (e as CustomEvent<StageDetail>).detail;
      if (!d || d.stage === null) st.box = null;
      else if (d.state === "start")
        st.box = {
          stage: d.stage,
          mark: d.mode === "replay" ? "drawing" : "running",
        };
      else if (st.box?.stage === d.stage)
        st.box =
          d.state === "error" ? { stage: d.stage, mark: "stopped" } : null;
      later(win);
    });
    win.addEventListener("tool:status", (e) => {
      st.status = (e as CustomEvent<StatusDetail>).detail ?? null;
      later(win);
    });
  }
  onMode((win, mode) => {
    if (mode === "read") win.dispatchEvent(new CustomEvent("tool:read-open"));
  });
}

// Spec 005 R6.a: unmount of the Pentimento sketch. Nothing in the page
// unmounts a window yet, so the module's own unmount is tested here on a DOM
// (jsdom) with fake timers. The run itself is tested in the page
// (tests/e2e/pentimento.spec.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "../../src/sheet/demos/pentimento.ts";
import { active, cancel } from "../../src/sheet/gestures.ts";

// jsdom has no canvas: a 2D context that takes every call and does nothing
const noop: object = new Proxy(() => noop, {
  get: (_, k) => (k === "then" ? undefined : noop),
  set: () => true,
  apply: () => noop,
});

let el: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  // jsdom has no ResizeObserver either
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    noop as CanvasRenderingContext2D,
  );
  el = document.createElement("div");
  el.inert = true;
  document.body.append(el);
});
afterEach(() => {
  unmount();
  el.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const press = () =>
  el
    .querySelector<HTMLButtonElement>("button")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));

describe("R6.a Pentimento mount and unmount", () => {
  it("mount fills the demo area and makes it usable", () => {
    mount(el);
    expect(el.inert).toBe(false);
    expect(el.querySelector("canvas")).not.toBeNull();
    expect(el.querySelector(".layers")!.textContent).toContain("Background");
    expect(el.querySelector("button")!.textContent).toContain("Run the agent");
  });

  it("a full run leaves no timer behind", () => {
    mount(el);
    press();
    vi.advanceTimersByTime(10_000);
    expect(el.querySelector(".cmd")!.textContent).toContain("done: 2 layers");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmount mid-run cancels every timer: no later change", () => {
    mount(el);
    press();
    vi.advanceTimersByTime(600); // the detect line is showing
    const cmd = el.querySelector(".cmd")!;
    const list = el.querySelector(".layers")!;
    const before = [cmd.textContent, list.textContent, el.innerHTML];
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    const after = [cmd.textContent, list.textContent, el.innerHTML];
    vi.advanceTimersByTime(10_000);
    expect([cmd.textContent, list.textContent, el.innerHTML]).toEqual(after);
    expect(cmd.textContent).toBe(before[0]);
  });

  it("mounts once: a second mount does not add a second copy", () => {
    mount(el);
    mount(el);
    expect(el.querySelectorAll("canvas")).toHaveLength(1);
  });
});

// 001 R21 (T3–T5 review, items 1 and 2): a press on Run owns the input
// until it ends, also when the window's demo unmounts mid-press, and it
// stops the view's motion
describe("Run press and the one-gesture owner", () => {
  const down = () =>
    el.querySelector("button")!.dispatchEvent(
      Object.assign(new Event("pointerdown", { bubbles: true }), {
        pointerId: 7,
        button: 0,
      }),
    );
  afterEach(() => cancel());

  it("a press stops the view's motion and owns the input", () => {
    const stop = vi.fn();
    mount(el, stop);
    down();
    expect(stop).toHaveBeenCalledOnce();
    expect(active()).toBe(true);
  });

  it("unmount mid-press gives the input back", () => {
    mount(el);
    down();
    expect(active()).toBe(true);
    unmount();
    expect(active()).toBe(false);
  });
});

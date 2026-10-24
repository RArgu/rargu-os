// 002 R3, R4 (unit part; R4.a): child windows and the ui dialogs open as modal
// panels inside the app's sheet window. The owner's root is blocked while one
// is open; Esc gives the cancel value (confirm false, choose the last index,
// prompt null); focus goes back to the owner; closing a panel never closes
// the app; closeAll settles every open dialog (R10 seam).
import { describe, expect, it } from "vitest";
import { createPanels } from "../../src/sheet/host/window";

function sheetWindow() {
  document.body.innerHTML = `<button id="outside">outside</button>
  <section data-win="notes" tabindex="-1">
    <div class="bar"><span class="t">notes.txt</span></div>
    <div class="demo-area" style="width:356px;height:232px">
      <div class="host-root"><button id="own">own</button></div>
    </div>
  </section>`;
  const el = document.querySelector<HTMLElement>("[data-win]")!;
  const area = el.querySelector<HTMLElement>(".demo-area")!;
  const root = area.querySelector<HTMLElement>(".host-root")!;
  const blocks: boolean[] = [];
  const panels = createPanels({
    el,
    area,
    appName: "Fixture",
    blocked: (b) => {
      blocks.push(b);
      root.toggleAttribute("inert", b);
    },
  });
  return { el, area, root, panels, blocks };
}

const panel = (area: HTMLElement) =>
  area.querySelector<HTMLElement>('[role="dialog"]');

/** A real-looking key press on the focused element (it bubbles). */
function key(k: string): void {
  const t = (document.activeElement ?? document.body) as HTMLElement;
  t.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
  );
}

describe("002 R4 dialogs", () => {
  it("R4.a choose('?', ['A','B','C']) resolves 2 on Esc", async () => {
    const { area, panels } = sheetWindow();
    document.getElementById("own")!.focus();
    const p = panels.choose("?", ["A", "B", "C"]);
    const dlg = panel(area)!;
    expect(dlg).not.toBeNull();
    expect(dlg.textContent).toContain("?");
    expect(dlg.contains(document.activeElement)).toBe(true);
    key("Escape");
    await expect(p).resolves.toBe(2);
    expect(panel(area)).toBeNull();
  });

  it("R4.a prompt resolves null on Esc", async () => {
    const { area, panels } = sheetWindow();
    document.getElementById("own")!.focus();
    const p = panels.prompt("Name?", "x");
    expect(panel(area)!.querySelector("input")!.value).toBe("x");
    key("Escape");
    await expect(p).resolves.toBeNull();
  });

  it("confirm resolves false on Esc, alert resolves on Esc", async () => {
    const { panels } = sheetWindow();
    document.getElementById("own")!.focus();
    const c = panels.confirm("Sure?");
    key("Escape");
    await expect(c).resolves.toBe(false);
    const a = panels.alert("Hi");
    key("Escape");
    await expect(a).resolves.toBeUndefined();
  });

  it("buttons and Enter give their values; the title defaults to the app name", async () => {
    const { area, panels } = sheetWindow();
    document.getElementById("own")!.focus();
    const c = panels.choose("?", ["A", "B", "C"]);
    expect(panel(area)!.textContent).toContain("Fixture");
    [...panel(area)!.querySelectorAll("button")]
      .find((b) => b.textContent === "B")!
      .click();
    await expect(c).resolves.toBe(1);
    const p = panels.prompt("Tempo", "120", "BPM");
    expect(panel(area)!.textContent).toContain("BPM");
    const input = panel(area)!.querySelector("input")!;
    input.value = "140";
    key("Enter");
    await expect(p).resolves.toBe("140");
  });

  it("R4 a dialog panel is inside the demo area, blocks the owner, and gives focus back", async () => {
    const { area, root, panels, blocks } = sheetWindow();
    const own = document.getElementById("own")!;
    own.focus();
    const p = panels.confirm("Sure?");
    const dlg = panel(area)!;
    expect(area.contains(dlg)).toBe(true);
    expect(root.contains(dlg)).toBe(false);
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(root.hasAttribute("inert")).toBe(true);
    key("Escape");
    await p;
    expect(root.hasAttribute("inert")).toBe(false);
    expect(blocks).toEqual([true, false]);
    expect(document.activeElement).toBe(own);
  });

  it("Tab stays inside the panel", () => {
    const { area, panels } = sheetWindow();
    document.getElementById("own")!.focus();
    void panels.confirm("Sure?");
    const dlg = panel(area)!;
    const focusables = [...dlg.querySelectorAll<HTMLElement>("button, input")];
    focusables.at(-1)!.focus();
    key("Tab");
    expect(document.activeElement).toBe(focusables[0]);
    key("Tab");
    // not the last: the browser moves forward on its own; the panel only wraps
    focusables[0].focus();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(focusables.at(-1));
  });

  it("R11 a dialog opened while the focus is outside the window does not take it", () => {
    const { area, panels } = sheetWindow();
    const outside = document.getElementById("outside")!;
    outside.focus();
    void panels.alert("Hi");
    expect(panel(area)).not.toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("R10 seam: closeAll settles every open dialog with its cancel value", async () => {
    const { area, root, panels } = sheetWindow();
    const all = Promise.all([
      panels.alert("a"),
      panels.confirm("b"),
      panels.choose("c", ["X", "Y"]),
      panels.prompt("d"),
    ]);
    panels.closeAll();
    await expect(all).resolves.toEqual([undefined, false, 1, null]);
    expect(panel(area)).toBeNull();
    expect(root.hasAttribute("inert")).toBe(false);
  });
});

describe("002 R3 child windows", () => {
  const PAINT_NEW = {
    title: "New Picture",
    modal: true,
    resizable: false,
    width: 190,
    height: 132,
    minWidth: 160,
    minHeight: 100,
  };

  it("R3 opens as a modal panel with its size and minimum size", () => {
    const { area, root, panels } = sheetWindow();
    const win = panels.child(PAINT_NEW);
    const dlg = panel(area)!;
    expect(dlg.contains(win.root)).toBe(true);
    expect(dlg.textContent).toContain("New Picture");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(win.root.style.width).toBe("190px");
    expect(win.root.style.height).toBe("132px");
    expect(win.root.style.minWidth).toBe("160px");
    expect(win.root.style.minHeight).toBe("100px");
    expect(root.hasAttribute("inert")).toBe(true);
    win.setTitle("Other");
    expect(dlg.textContent).toContain("Other");
    const sizes: [number, number][] = [];
    win.onResize((w, h) => sizes.push([w, h]));
    win.setSize(200, 140);
    expect([win.root.style.width, win.root.style.height]).toEqual([
      "200px",
      "140px",
    ]);
    expect(sizes).toEqual([[200, 140]]);
  });

  it("R3 close() runs onClose, removes only the panel and gives focus back", () => {
    const { area, root, panels } = sheetWindow();
    const own = document.getElementById("own")!;
    own.focus();
    const win = panels.child(PAINT_NEW);
    const ok = document.createElement("button");
    win.root.append(ok);
    ok.focus();
    let closes = 0;
    win.onClose(() => void closes++);
    win.close();
    expect(closes).toBe(1);
    expect(panel(area)).toBeNull();
    expect(area.contains(root)).toBe(true);
    expect(root.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(own);
    win.close();
    expect(closes).toBe(1);
  });

  it("R3 an onClose that returns false keeps the panel; the close button and Esc close it", () => {
    const { area, panels } = sheetWindow();
    document.getElementById("own")!.focus();
    const win = panels.child(PAINT_NEW);
    let veto = true;
    win.onClose(() => (veto ? false : undefined));
    win.close();
    expect(panel(area)).not.toBeNull();
    veto = false;
    panel(area)!
      .querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
      .click();
    expect(panel(area)).toBeNull();
    const w2 = panels.child(PAINT_NEW);
    const b = document.createElement("button");
    w2.root.append(b);
    b.focus();
    key("Escape");
    expect(panel(area)).toBeNull();
  });

  it("R3 an Esc the app handles itself does not close the panel twice", () => {
    const { area, panels } = sheetWindow();
    document.getElementById("own")!.focus();
    const win = panels.child(PAINT_NEW);
    let closes = 0;
    win.onClose(() => void closes++);
    const body = document.createElement("div");
    const b = document.createElement("button");
    body.append(b);
    body.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        win.close();
      }
    });
    win.root.append(body);
    b.focus();
    key("Escape");
    expect(closes).toBe(1);
    expect(panel(area)).toBeNull();
  });

  it("two panels stack: the top one is the overlay; closing it gives focus to the one below", async () => {
    const { panels } = sheetWindow();
    document.getElementById("own")!.focus();
    const win = panels.child(PAINT_NEW);
    const b = document.createElement("button");
    win.root.append(b);
    b.focus();
    const p = panels.confirm("Discard?");
    expect(panels.top()).not.toBe(win.root);
    key("Escape");
    await p;
    expect(panels.top()).toBe(win.root);
    expect(document.activeElement).toBe(b);
  });
});

describe("002 R3 child windows (Codex 002 T4 #2, #3, #5)", () => {
  function setup(bg = false) {
    document.body.innerHTML = `<button id="outside">outside</button>
    <section data-win="paint" tabindex="-1">
      <div class="demo-area"><div class="host-root"><button id="own">own</button></div></div>
    </section>`;
    const el = document.querySelector<HTMLElement>("[data-win]")!;
    let background = bg;
    const panels = createPanels({
      el,
      area: el.querySelector<HTMLElement>(".demo-area")!,
      appName: "Fixture",
      blocked: () => {},
      background: () => background,
    });
    return {
      el,
      panels,
      endBg: () => {
        background = false;
        panels.release();
      },
    };
  }
  const opts = {
    title: "Child",
    modal: true,
    width: 190,
    height: 132,
    minWidth: 160,
    minHeight: 100,
  };

  it("#5 setSize below both minimums applies and reports the minimums", () => {
    const { panels } = setup();
    const win = panels.child(opts);
    const sizes: [number, number][] = [];
    win.onResize((w, h) => sizes.push([w, h]));
    win.setSize(100, 50);
    expect([win.root.style.width, win.root.style.height]).toEqual([
      "160px",
      "100px",
    ]);
    expect(sizes).toEqual([[160, 100]]);
  });

  it("#2 a child panel the app does not focus gets the focus at once, then its first control", async () => {
    const { panels } = setup();
    document.getElementById("own")!.focus();
    const win = panels.child(opts);
    const dlg = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dlg.contains(document.activeElement)).toBe(true);
    const a = document.createElement("button");
    const b = document.createElement("button");
    win.root.append(a, b);
    await Promise.resolve();
    expect(document.activeElement).toBe(a);
  });

  it("#2 a focus the app sets at once is kept", async () => {
    const { panels } = setup();
    document.getElementById("own")!.focus();
    const win = panels.child(opts);
    const a = document.createElement("button");
    const b = document.createElement("button");
    win.root.append(a, b);
    b.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(b);
  });

  // jsdom does not keep the focus out of inert content: the e2e R11 test
  // checks the focus itself
  it("#3 a child opened in a background start is inert until the start ends; the host takes no focus", async () => {
    const { el, panels, endBg } = setup(true);
    el.focus();
    panels.child(opts);
    await Promise.resolve();
    expect(document.activeElement).toBe(el);
    const scrim = document.querySelector<HTMLElement>(".host-scrim")!;
    expect(scrim.inert).toBe(true);
    endBg();
    expect(scrim.inert).toBe(false);
    expect(document.activeElement).toBe(el);
  });
});

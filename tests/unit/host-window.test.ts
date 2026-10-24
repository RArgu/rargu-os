// 002 R2 (unit part of R2.a): the main window uses the sheet window's demo
// area. setTitle sets the title bar, setSize sets the demo area in app px
// within the layout's limits, onResize reports app px once per change, focus
// brings the window to the front, setPosition is ignored.
import { describe, expect, it, vi } from "vitest";
import { createMainWindow } from "../../src/sheet/host/window";

function sheetWindow() {
  document.body.innerHTML = `<section data-win="notes" style="transform:translate(2400px, 960px)">
    <div class="bar"><span class="t">notes.txt</span></div>
    <div class="demo-area" style="height:232px"></div>
  </section>`;
  const el = document.querySelector<HTMLElement>("[data-win]")!;
  const area = el.querySelector<HTMLElement>(".demo-area")!;
  const front = vi.fn();
  const active = vi.fn();
  let bg = false;
  const main = createMainWindow(
    { title: "Fixture" },
    {
      el,
      area,
      max: { w: 356, h: 232 },
      front,
      onActive: active,
      background: () => bg,
      close: vi.fn(),
    },
  );
  return { el, area, front, active, main, setBg: (b: boolean) => (bg = b) };
}

const title = (el: HTMLElement) => el.querySelector(".bar .t")!.textContent;

describe("002 R2 main window", () => {
  it("R2.a setTitle, setSize(300, 200) and focus()", () => {
    const { el, area, front, active, main } = sheetWindow();
    const sizes: [number, number][] = [];
    main.win.onResize((w, h) => sizes.push([w, h]));
    main.win.setTitle("x");
    main.win.setSize(300, 200);
    main.win.focus();
    expect(title(el)).toBe("x");
    expect([area.style.width, area.style.height]).toEqual(["300px", "200px"]);
    expect(sizes).toEqual([[300, 200]]);
    expect(front).toHaveBeenCalledTimes(1);
    expect(active).toHaveBeenCalledTimes(1);
  });

  it("the window's root is inside the demo area", () => {
    const { area, main } = sheetWindow();
    expect(area.contains(main.root)).toBe(true);
    expect(main.win.root).toBe(main.root);
  });

  it("the same size again reports no resize; sizes clamp to the layout's limits", () => {
    const { area, main } = sheetWindow();
    const sizes: [number, number][] = [];
    main.win.onResize((w, h) => sizes.push([w, h]));
    main.win.setSize(300, 200);
    main.win.setSize(300, 200);
    main.win.setSize(9999, 9999);
    expect(sizes).toEqual([
      [300, 200],
      [356, 232],
    ]);
    expect([area.style.width, area.style.height]).toEqual(["356px", "232px"]);
  });

  it("setPosition is ignored: the sheet owns position", () => {
    const { el, main } = sheetWindow();
    const before = el.getAttribute("style");
    main.win.setPosition(10, 20);
    expect(el.getAttribute("style")).toBe(before);
  });

  it("R11 focus() in a background start neither fronts the window nor makes the app active", () => {
    const { front, active, main, setBg } = sheetWindow();
    setBg(true);
    main.win.focus();
    expect(front).not.toHaveBeenCalled();
    expect(active).not.toHaveBeenCalled();
  });

  it("onFocus hears the focus changes the host reports", () => {
    const { main } = sheetWindow();
    const seen: boolean[] = [];
    main.win.onFocus((f) => seen.push(f));
    main.focused(true);
    main.focused(true);
    main.focused(false);
    expect(seen).toEqual([true, false]);
  });

  it("dispose puts back the title and the reserved size and empties the area", () => {
    const { el, area, main } = sheetWindow();
    main.root.append(document.createElement("p"));
    main.win.setTitle("x");
    main.win.setSize(300, 200);
    main.dispose();
    expect(title(el)).toBe("notes.txt");
    expect([area.style.width, area.style.height]).toEqual(["", "232px"]);
    expect(area.childElementCount).toBe(0);
  });
});

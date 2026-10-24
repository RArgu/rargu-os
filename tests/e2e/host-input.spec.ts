// Spec 002 T5: the menu row, shortcuts and input routing (R5.a, R5.b, R18.a,
// and the menu part of R15.a). Real clicks, keys, drags and wheel turns.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { idle } from "./host-helpers";
import { isSheetPage, sheet } from "./sheet-base";

const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const area = (page: Page, id: string) => win(page, id).locator(".demo-area");
const panels = (page: Page, id: string) =>
  win(page, id).locator('.host-panel[role="dialog"]');
const row = (page: Page, id: string) =>
  win(page, id).locator('[role="menubar"]');
const head = (page: Page, id: string, name: string) =>
  row(page, id).getByRole("button", { name, exact: true });
const item = (page: Page, id: string, name: string) =>
  win(page, id).locator(".menu-item", { hasText: name });

/** Starts the app in window `id` by its card link; the move lands at once. */
async function run(page: Page, id: string): Promise<void> {
  await page.locator(`[data-go="${id}"]`).click();
  await expect(area(page, id)).toHaveAttribute("data-host", "running");
}

async function open(page: Page, url = sheet()): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
}

const scroll = (page: Page) =>
  page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    return [vp.scrollLeft, vp.scrollTop];
  });

/** Two frames: the browser has acted on the input sent before. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );

/** Records the last `type` event of the page (window, capture phase), so a
 * test can read its defaultPrevented after the handlers ran. */
const record = (page: Page, type: string) =>
  page.evaluate((type) => {
    addEventListener(
      type,
      (e) => Object.assign(window, { [`__last_${type}`]: e }),
      true,
    );
  }, type);
const prevented = (page: Page, type: string) =>
  page.evaluate(
    (type) =>
      (window as unknown as Record<string, Event | undefined>)[`__last_${type}`]
        ?.defaultPrevented ?? null,
    type,
  );

const chosen = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __fxMenu: { chosen: string[] } }).__fxMenu.chosen,
  );

test("R5.a Writer: ⌘/Ctrl + S in its text runs Writer's Save once, not Paint's; ⌘/Ctrl + C copies natively", async ({
  page,
}) => {
  await open(page);
  // Paint runs in the background
  await run(page, "paint");
  await run(page, "notes");
  const text = win(page, "notes").locator("textarea");
  await text.click();
  await page.keyboard.type("hello");
  await record(page, "keydown");
  await page.keyboard.press("ControlOrMeta+s");
  // Writer's Save of an untitled text asks for a name: one prompt
  await expect(panels(page, "notes")).toHaveCount(1);
  await expect(panels(page, "notes")).toContainText("File name");
  // the browser's own Save does not run
  expect(await prevented(page, "keydown")).toBe(true);
  await frames(page);
  await expect(panels(page, "notes")).toHaveCount(1);
  await expect(panels(page, "paint")).toHaveCount(0);
  await panels(page, "notes").getByRole("button", { name: "Cancel" }).click();
  await expect(panels(page, "notes")).toHaveCount(0);

  // ⌘/Ctrl + C in the text is the browser's copy, once (the menu's Copy
  // item does not also run)
  await text.focus();
  await page.evaluate(() => {
    const w = window as unknown as { __copies: string[] };
    w.__copies = [];
    document.addEventListener("copy", (e) => {
      const t = e.target as HTMLTextAreaElement;
      w.__copies.push(t.value.slice(t.selectionStart, t.selectionEnd));
    });
  });
  await text.evaluate((t: HTMLTextAreaElement) => t.select());
  await page.keyboard.press("ControlOrMeta+c");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __copies: string[] }).__copies,
      ),
    )
    .toEqual(["hello"]);
  expect(await prevented(page, "keydown")).toBe(false);
});

test("R5.b a fixture menu: the submenu opens, the disabled item does nothing, a radio item unchecks the others; a new menu replaces the row", async ({
  page,
}) => {
  await open(page, sheet("?host=notes:fx-menu"));
  await run(page, "notes");
  await expect(row(page, "notes")).toHaveCount(1);
  // the row sits under the title bar, inside the window
  const [bar, menu, frame] = await Promise.all([
    win(page, "notes").locator(".bar").boundingBox(),
    row(page, "notes").boundingBox(),
    win(page, "notes").boundingBox(),
  ]);
  expect(menu!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);
  expect(menu!.y + menu!.height).toBeLessThanOrEqual(frame!.y + frame!.height);

  // submenu
  await head(page, "notes", "File").click();
  await item(page, "notes", "Recent").hover();
  await expect(item(page, "notes", "a.txt")).toBeVisible();
  await item(page, "notes", "a.txt").click();
  await expect(win(page, "notes").locator(".menu")).toHaveCount(0);
  expect(await chosen(page)).toEqual(["a.txt"]);

  // disabled item: nothing runs, the menu stays open
  await head(page, "notes", "File").click();
  await item(page, "notes", "Gone").click();
  await expect(item(page, "notes", "Gone")).toBeVisible();
  expect(await chosen(page)).toEqual(["a.txt"]);
  await page.keyboard.press("Escape");
  await expect(win(page, "notes").locator(".menu")).toHaveCount(0);

  // radio group: the app sets a new menu; the row is replaced, not added
  const checked = async () => {
    await head(page, "notes", "View").click();
    const marks = await win(page, "notes")
      .locator(".menu-item")
      .evaluateAll((rows) =>
        rows.map(
          (r) =>
            `${r.querySelector(".menu-label")!.textContent}:${!!r.querySelector(".check")}`,
        ),
      );
    return marks;
  };
  expect(await checked()).toEqual(["Small:true", "Large:false"]);
  await item(page, "notes", "Large").click();
  expect(await chosen(page)).toEqual(["a.txt", "Large"]);
  await expect(row(page, "notes")).toHaveCount(1);
  expect(await checked()).toEqual(["Small:false", "Large:true"]);
  await page.keyboard.press("Escape");

  // keyboard: Tab reaches the row, ArrowDown opens, Enter chooses
  await head(page, "notes", "File").focus();
  await page.keyboard.press("ArrowDown");
  await expect(win(page, "notes").locator(".menu")).toHaveCount(1);
  await page.keyboard.press("ArrowDown"); // Recent
  await page.keyboard.press("ArrowRight"); // its submenu
  await page.keyboard.press("ArrowDown"); // a.txt
  await page.keyboard.press("Enter");
  expect(await chosen(page)).toEqual(["a.txt", "Large", "a.txt"]);
  await expect(head(page, "notes", "File")).toBeFocused();

  // a shortcut runs from a text field when it is no editing key
  await win(page, "notes").locator(".fx-field").focus();
  await page.keyboard.press("ControlOrMeta+k");
  expect(await chosen(page)).toEqual(["a.txt", "Large", "a.txt", "Mark"]);

  // a modal panel disables the row and the shortcuts
  await head(page, "notes", "File").click();
  await item(page, "notes", "Ask").click();
  await expect(panels(page, "notes")).toHaveCount(1);
  await expect(row(page, "notes").locator("xpath=..")).toHaveAttribute(
    "inert",
    "",
  );
  await page.keyboard.press("ControlOrMeta+k");
  await frames(page);
  expect(await chosen(page)).toEqual(["a.txt", "Large", "a.txt", "Mark"]);
});

test("R18.a Paint: a drag on the canvas draws and the sheet does not pan; keys and the wheel in the app stay in it", async ({
  page,
}) => {
  await open(page);
  await run(page, "paint");
  await idle(page);
  const canvas = win(page, "paint").locator("canvas.paint-canvas");
  const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const clean = await pixels();
  const at = await scroll(page);
  const pos = await win(page, "paint").boundingBox();
  const cv = (await canvas.boundingBox())!;
  const [x, y] = [cv.x + cv.width / 2, cv.y + cv.height / 2];
  await page.mouse.move(x - 30, y - 20);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 20, { steps: 6 });
  await page.mouse.up();
  await expect.poll(pixels).not.toBe(clean);
  expect(await scroll(page)).toEqual(at);
  // only the title bar drags: the window did not move
  expect(await win(page, "paint").boundingBox()).toEqual(pos);

  // arrow keys, Alt + arrows and Home on a control in the app do not pan
  // the sheet or move the window
  await win(page, "paint").locator(".paint-tool").first().focus();
  // (the focus may reveal the window: the view moves first)
  await frames(page);
  const still = await scroll(page);
  for (const key of ["ArrowRight", "ArrowDown", "Alt+ArrowLeft", "Home"])
    await page.keyboard.press(key);
  await frames(page);
  expect(await scroll(page)).toEqual(still);
  expect(await win(page, "paint").boundingBox()).toEqual(pos);

  // a wheel turn over the app does not scroll the sheet
  await record(page, "wheel");
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => prevented(page, "wheel")).toBe(true);
  await frames(page);
  expect(await scroll(page)).toEqual(still);
});

test("R18 Writer: the wheel scrolls Writer's text, never the sheet", async ({
  page,
}) => {
  await open(page);
  await run(page, "notes");
  const text = win(page, "notes").locator("textarea");
  await text.fill(Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n"));
  await text.evaluate((t) => (t.scrollTop = 0));
  const at = await scroll(page);
  const box = (await text.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => text.evaluate((t) => t.scrollTop)).toBeGreaterThan(0);
  // at its end, the turn stays in the app
  await text.evaluate((t) => (t.scrollTop = t.scrollHeight));
  await page.mouse.wheel(0, 300);
  await frames(page);
  expect(await scroll(page)).toEqual(at);
});

test("R18 an arrow key in an empty text field of an app does not scroll the sheet (WebKit); inside the text it moves the caret", async ({
  page,
}) => {
  await open(page);
  await run(page, "notes");
  const text = win(page, "notes").locator("textarea");
  await text.fill("");
  await text.focus();
  const at = await scroll(page);
  await record(page, "keydown");
  for (const key of ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"]) {
    await page.keyboard.press(key);
    // the caret is at both ends: the key would only scroll the sheet
    expect(await prevented(page, "keydown"), key).toBe(true);
    await frames(page);
    expect(await scroll(page), key).toEqual(at);
  }
  // a caret that can move keeps the browser's own key
  await text.fill("ab");
  await text.evaluate((t: HTMLTextAreaElement) => t.setSelectionRange(1, 1));
  await page.keyboard.press("ArrowRight");
  expect(await prevented(page, "keydown")).toBe(false);
  expect(
    await text.evaluate((t: HTMLTextAreaElement) => t.selectionStart),
  ).toBe(2);
});

test("R15.a zoom 50 %: Paint's menus open fully inside its window", async ({
  page,
}) => {
  await open(page);
  await run(page, "paint");
  await idle(page);
  const box = (await win(page, "paint").boundingBox())!;
  await page.evaluate(
    ([x, y]) =>
      document.querySelector("#vp")!.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -100 * Math.log(0.5),
          clientX: x,
          clientY: y,
        }),
      ),
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  await expect(page.locator("#zPct")).toHaveText("50%");
  await idle(page);
  const frame = (await win(page, "paint").boundingBox())!;
  const within = async (sel: string) => {
    const r = (await win(page, "paint").locator(sel).last().boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(r.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(r.x + r.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(r.y + r.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  };
  for (const name of ["File", "Edit", "View"]) {
    await head(page, "paint", name).click();
    await expect(win(page, "paint").locator(".menu")).toHaveCount(1);
    await within(".menu");
    // under its header
    const [hb, mb] = await Promise.all([
      head(page, "paint", name).boundingBox(),
      win(page, "paint").locator(".menu").boundingBox(),
    ]);
    expect(Math.abs(mb!.y - (hb!.y + hb!.height))).toBeLessThanOrEqual(2);
    await page.keyboard.press("Escape");
    await expect(win(page, "paint").locator(".menu")).toHaveCount(0);
  }
});

// ---- Codex T5 review (#4–#9) ----

test("R5 keyboard: Tab from Writer's window frame reaches its menu row and stays; Esc then Tab leaves Writer's text for the frame (001 R19)", async ({
  page,
  browserName,
}) => {
  await open(page);
  await run(page, "notes");
  // Safari's Tab skips buttons; Option + Tab reaches them
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const frame = win(page, "notes");
  const file = head(page, "notes", "File");
  await frame.focus();
  for (let i = 0; i < 4; i++) {
    if (await file.evaluate((e) => e === document.activeElement)) break;
    await page.keyboard.press(tab);
  }
  await expect(file).toBeFocused();
  // Writer's focus callback (it focuses its text) does not take it away
  await frames(page);
  await expect(file).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(win(page, "notes").locator(".menu")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(file).toBeFocused();

  // Writer keeps Tab in its text (it types spaces); on the sheet Esc alone
  // leaves it for the frame (004 R10, owner decision 2026-10-23)
  const text = win(page, "notes").locator("textarea");
  await text.focus();
  await page.keyboard.press("Tab");
  await expect(text).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(frame).toBeFocused();
});

test("R5 keyboard: in another app, Esc then Tab leaves its field for the window frame (001 R19)", async ({
  page,
}) => {
  await open(page, sheet("?host=notes:fx-menu"));
  await run(page, "notes");
  const field = win(page, "notes").locator(".fx-field");
  await field.focus();
  await page.keyboard.press("Escape");
  await expect(field).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(win(page, "notes")).toBeFocused();
});

test("R5 disabled branches: no shortcut under a disabled submenu; header moves skip a disabled header", async ({
  page,
}) => {
  await open(page, sheet("?host=notes:fx-menu"));
  await run(page, "notes");
  await win(page, "notes").locator(".fx-field").focus();
  await record(page, "keydown");
  await page.keyboard.press("ControlOrMeta+j");
  await frames(page);
  expect(await chosen(page)).toEqual([]);
  expect(await prevented(page, "keydown")).toBe(false);

  // from the File header, Right goes to View, past the disabled Off
  await head(page, "notes", "File").focus();
  await page.keyboard.press("ArrowRight");
  await expect(head(page, "notes", "View")).toBeFocused();
  // from the open File menu, Right opens View's menu; Off never runs
  await head(page, "notes", "File").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "notes", "Small")).toBeVisible();
  expect(await chosen(page)).toEqual([]);
});

test("R5 shifted editing keys stay native in a text field and an editable element; elsewhere the shortcut runs", async ({
  page,
}) => {
  await open(page, sheet("?host=notes:fx-menu"));
  await run(page, "notes");
  await record(page, "keydown");
  for (const sel of [".fx-field", ".fx-edit"]) {
    await win(page, "notes").locator(sel).focus();
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await frames(page);
    expect(await chosen(page)).toEqual([]);
    expect(await prevented(page, "keydown")).toBe(false);
  }
  await head(page, "notes", "File").focus();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await chosen(page)).toEqual(["Redo"]);
});

test("R5 a new menu closes the open one; closing the app closes its open submenu", async ({
  page,
}) => {
  await open(page, sheet("?host=notes:fx-menu"));
  await run(page, "notes");
  const menus = page.locator(".menu");
  await head(page, "notes", "File").click();
  await item(page, "notes", "Recent").hover();
  await expect(menus).toHaveCount(2);
  await page.evaluate(() =>
    (window as unknown as { __fxMenu: { redraw(): void } }).__fxMenu.redraw(),
  );
  await expect(menus).toHaveCount(0);
  await expect(row(page, "notes")).toHaveCount(1);

  await head(page, "notes", "File").click();
  await item(page, "notes", "Recent").hover();
  await expect(menus).toHaveCount(2);
  await page.evaluate(() =>
    (window as unknown as { __fxMenu: { close(): void } }).__fxMenu.close(),
  );
  await expect(area(page, "notes")).not.toHaveAttribute("data-host", "running");
  await expect(menus).toHaveCount(0);
});

test("R5 Tracker's Song menu: the keyboard's choice stays in view in the scrolling menu", async ({
  page,
}) => {
  // 004 T2: Music's window (348 px) holds the whole menu; the served page
  // gives it the earlier 001 size (197 px, demo 160) so the menu must scroll
  await page.route(isSheetPage, async (route) => {
    const html = (await (await route.fetch()).text()).replace(
      /(data-win="music"[^>]*style="width:)\d+px;height:\d+px([^]*?class="demo-area" style="height:)\d+px/,
      "$1440px;height:197px$2160px",
    );
    await route.fulfill({ body: html, contentType: "text/html" });
  });
  await open(page);
  await run(page, "music");
  await head(page, "music", "Song").focus();
  await page.keyboard.press("ArrowDown");
  const menu = win(page, "music").locator(".menu");
  await expect(menu).toHaveCount(1);
  // taller than its room: it scrolls
  expect(await menu.evaluate((m) => m.scrollHeight > m.clientHeight + 1)).toBe(
    true,
  );
  // Up from the first wraps to the last
  await page.keyboard.press("ArrowUp");
  const seen = () =>
    menu.evaluate((m) => {
      const r = m.querySelector(".menu-item.active")!.getBoundingClientRect();
      const b = m.getBoundingClientRect();
      return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    });
  expect(await seen()).toBe(true);
  await page.keyboard.press("ArrowDown");
  expect(await seen()).toBe(true);
});

test("R18 a rotated window (wobble): a menu opens under its header", async ({
  page,
}) => {
  // full motion: a window may be tilted when its menu opens
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(sheet());
  await run(page, "paint");
  await idle(page);
  const w = win(page, "paint");
  await expect
    .poll(() => w.evaluate((el) => el.style.transform))
    .toMatch(/rotate\(0deg\)/);
  await w.evaluate((el) => (el.style.transform += " rotate(8deg)"));
  await head(page, "paint", "File").click();
  await expect(w.locator(".menu")).toHaveCount(1);
  // straight again: the menu's place in the window shows
  await w.evaluate(
    (el) =>
      (el.style.transform = el.style.transform.replace(" rotate(8deg)", "")),
  );
  const [hb, rb, mb] = await Promise.all([
    head(page, "paint", "File").boundingBox(),
    w.locator(".host-bar").boundingBox(),
    w.locator(".menu").boundingBox(),
  ]);
  // at the header's left, just under the menu row
  expect(Math.abs(mb!.x - hb!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(mb!.y - (rb!.y + rb!.height))).toBeLessThanOrEqual(2);
});

// ---- Codex 002 review (T9) #3 and the missing branch checks ----

for (const how of ["Reset", "blur"])
  test(`001 R13 R21 ${how} in the middle of a Paint stroke ends the stroke: no capture, no more drawing`, async ({
    page,
  }) => {
    await open(page);
    await run(page, "paint");
    await idle(page);
    const canvas = win(page, "paint").locator("canvas.paint-canvas");
    await canvas.evaluate((c) =>
      c.addEventListener("pointerdown", (e) =>
        Object.assign(window, { __pid: (e as PointerEvent).pointerId }),
      ),
    );
    const pixels = () =>
      canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    const captured = () =>
      canvas.evaluate((c) =>
        c.hasPointerCapture((window as unknown as { __pid: number }).__pid),
      );
    const clean = await pixels();
    const cv = (await canvas.boundingBox())!;
    const [x, y] = [cv.x + cv.width / 2, cv.y + cv.height / 2];
    await page.mouse.move(x - 30, y - 20);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 3 });
    await expect.poll(pixels).not.toBe(clean);
    expect(await captured()).toBe(true);
    if (how === "Reset") {
      await page.locator("#reset").focus();
      await page.keyboard.press("Enter");
    } else await page.evaluate(() => dispatchEvent(new Event("blur")));
    expect(await captured()).toBe(false);
    const after = await pixels();
    // the pointer moves on with its button down: Paint draws nothing more
    await page.mouse.move(x + 30, y + 20, { steps: 4 });
    await frames(page);
    expect(await pixels()).toBe(after);
    await page.mouse.up();
  });

test("R5 a shortcut the app's own handler takes (preventDefault) does not run the menu item", async ({
  page,
}) => {
  await open(page, sheet("?host=notes:fx-menu"));
  await run(page, "notes");
  const field = win(page, "notes").locator(".fx-field");
  // the app takes ⌘/Ctrl + K in its field
  await field.evaluate((f) =>
    f.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "k") e.preventDefault();
    }),
  );
  await field.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await frames(page);
  expect(await chosen(page)).toEqual([]);
  // elsewhere in the app the shortcut runs
  await head(page, "notes", "File").focus();
  await page.keyboard.press("ControlOrMeta+k");
  expect(await chosen(page)).toEqual(["Mark"]);
});

test("R5 Esc then Shift+Tab leaves an app's field for its window frame (001 R19)", async ({
  page,
}) => {
  // Writer's Esc alone leaves its text (004 R10): the route, in another app
  await open(page, sheet("?host=notes:fx-menu"));
  await run(page, "notes");
  const field = win(page, "notes").locator(".fx-field");
  await field.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Tab");
  await expect(win(page, "notes")).toBeFocused();
});

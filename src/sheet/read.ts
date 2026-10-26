// Spec 013 R3, R8: the Read panel. It scrolls itself (readme.css: overscroll
// and touch; view.ts leaves its keys and touches alone). Its section nav
// scrolls the panel, not the sheet, and marks the section in view.
import { onMode } from "./tabs";
import { reduced } from "./view";

/** The section in view: the last H2 at or above the line under the nav. */
function current(area: HTMLElement, heads: HTMLElement[]): number {
  if (area.scrollTop + area.clientHeight >= area.scrollHeight - 2)
    return heads.length - 1;
  const line = area.scrollTop + navHeight(area) + 16;
  let i = 0;
  heads.forEach((h, k) => {
    if (h.offsetTop <= line) i = k;
  });
  return i;
}
/** The nav's height when it sits over the text (a sticky row), else 0. */
const navHeight = (area: HTMLElement) => {
  const nav = area.querySelector<HTMLElement>(".r-nav")!;
  return getComputedStyle(nav).position === "sticky" &&
    nav.offsetWidth >= area.clientWidth / 2
    ? nav.offsetHeight
    : 0;
};

const LINE = 40;
/** R3: the panel's own key scroll, in every browser the same (WebKit does not
 * scroll a focused panel by keys; Firefox passes a key the panel cannot use
 * on to the sheet). Returns the new scrollTop, or null for another key. */
function keyScroll(area: HTMLElement, e: KeyboardEvent): number | null {
  const page = area.clientHeight * 0.9;
  const top = area.scrollTop;
  switch (e.key) {
    case "ArrowDown":
      return top + LINE;
    case "ArrowUp":
      return top - LINE;
    case "PageDown":
      return top + page;
    case "PageUp":
      return top - page;
    case " ":
      return top + (e.shiftKey ? -page : page);
    case "Home":
      return 0;
    case "End":
      return area.scrollHeight;
    case "ArrowLeft":
    case "ArrowRight":
      return top; // the panel does not scroll sideways; nor does the sheet
  }
  return null;
}

export function initRead(): void {
  for (const area of document.querySelectorAll<HTMLElement>(".read-area")) {
    area.tabIndex = 0; // R3: keys scroll it once it has the focus
    const links = [...area.querySelectorAll<HTMLAnchorElement>(".r-nav a")];
    const heads = links.map((a) => area.querySelector<HTMLElement>(a.hash)!);
    let at = -1;
    const mark = () => {
      const i = current(area, heads);
      if (i === at) return;
      at = i;
      links.forEach((a, k) =>
        k === i
          ? a.setAttribute("aria-current", "true")
          : a.removeAttribute("aria-current"),
      );
    };
    // R20: a hidden panel loses its scroll position; Read gets it back
    let kept = 0;
    area.addEventListener("scroll", () => (kept = area.scrollTop), {
      passive: true,
    });
    const win = area.closest<HTMLElement>("[data-win]")!;
    onMode((w, mode) => {
      if (w === win && mode === "read") area.scrollTop = kept;
    });
    area.addEventListener("scroll", mark, { passive: true });
    area.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      // a field keeps its keys; Space presses a button or link
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (t.closest("input, select, textarea")) return;
      if (e.key === " " && t !== area && t.closest("a, button")) return;
      const to = keyScroll(area, e);
      if (to === null) return;
      e.preventDefault();
      area.scrollTo({ top: to, behavior: "instant" });
    });
    // the panel opens hidden: mark once it has a size
    new ResizeObserver(mark).observe(area);
    // a fragment link would scroll every ancestor (the sheet) and the URL
    area.querySelector(".r-nav")!.addEventListener("click", (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>("a");
      if (!a) return;
      e.preventDefault();
      const h = area.querySelector<HTMLElement>(a.hash)!;
      area.scrollTo({
        top: h.offsetTop - navHeight(area) - 8,
        behavior: reduced() ? "auto" : "smooth",
      });
    });
  }
}

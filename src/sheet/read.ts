// Spec 013 R3, R8: the Read panel. It scrolls itself (readme.css: overscroll
// and touch; view.ts leaves its keys and touches alone). Its section nav
// scrolls the panel, not the sheet, and marks the section in view.
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
    area.addEventListener("scroll", mark, { passive: true });
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

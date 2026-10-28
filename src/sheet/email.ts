// 015 R3: the public email is never in the page source. The markup carries its
// two parts as separate data attributes (scripts/sheet-content.ts mailLink);
// this joins them at start-up, sets a real mailto: href (so Tab, Enter and
// right-click work) and shows the link. No network call.

/** The address held by an a[data-mail] link. */
export const addressOf = (a: HTMLElement): string =>
  `${a.dataset.u ?? ""}@${a.dataset.d ?? ""}`;

/** `mailto:` for the page's first Email link, or "" when there is none. */
export function mailtoHref(root: ParentNode = document): string {
  const a = root.querySelector<HTMLElement>("a[data-mail]");
  return a ? `mailto:${addressOf(a)}` : "";
}

/** Set the href of every Email link and show it; "show" links also print
 * the address as their text (the resume). */
export function initMail(root: ParentNode = document): void {
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a[data-mail]")) {
    if (!a.dataset.u || !a.dataset.d) continue;
    const addr = addressOf(a);
    a.href = `mailto:${addr}`;
    if (a.dataset.mail === "show") a.textContent = addr;
    a.hidden = false;
  }
}

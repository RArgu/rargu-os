// Spec 013 R18: the insider case studies load from a same-origin JSON file
// (noindex) when Origin first scrolls into view, into a data-nosnippet
// container under the notice. They are in no page's HTML. A failed load keeps
// the notice and says so.
interface Cases {
  cases: { heading: string; paragraphs: string[] }[];
}

async function load(box: HTMLElement): Promise<void> {
  const state = box.querySelector<HTMLElement>(".cases-state")!;
  state.textContent = "Loading the case studies…";
  try {
    const r = await fetch(box.dataset.src!);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = (await r.json()) as Cases;
    const out = document.createDocumentFragment();
    for (const c of d.cases) {
      const h = document.createElement("h3");
      h.textContent = c.heading; // text only: the file is data
      out.append(h);
      for (const t of c.paragraphs)
        out.append(
          Object.assign(document.createElement("p"), { textContent: t }),
        );
    }
    state.remove();
    box.append(out);
  } catch (e) {
    console.warn("case studies did not load:", e);
    state.textContent =
      "The case studies did not load. Reload the page to try again.";
  }
}

export function initCaseStudies(): void {
  for (const box of document.querySelectorAll<HTMLElement>(
    ".cases[data-src]",
  )) {
    const io = new IntersectionObserver((seen) => {
      if (!seen.some((s) => s.isIntersecting)) return;
      io.disconnect();
      void load(box);
    });
    io.observe(box);
    // owner N9: when Origin scrolls into view (its heading, or the box)
    const origin = box
      .closest(".r-body")
      ?.querySelector<HTMLElement>('h2[id$="-sec-origin"]');
    if (origin) io.observe(origin);
  }
}

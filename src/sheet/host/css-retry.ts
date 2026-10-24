// 002 R12: stylesheets that failed to load (the host's or an app's CSS
// preload), loaded again by Try again. The sheet imports this module before
// it first imports the host, so a failed host stylesheet is seen too.
export const failedCss = new Set<HTMLLinkElement>();
document.addEventListener(
  "error",
  (e) => {
    const l = e.target;
    if (l instanceof HTMLLinkElement && l.rel === "stylesheet")
      failedCss.add(l);
  },
  true,
);

let pending: Promise<unknown> | null = null;

/** Replaces each failed stylesheet link with a fresh one; rejects if one
 * fails again. A call during a reload waits for it and shares its failure. */
export async function reloadCss(n: number): Promise<void> {
  while (pending) await pending;
  const links = [...failedCss];
  failedCss.clear();
  await (pending = Promise.all(
    links.map(
      (old) =>
        new Promise<void>((ok, no) => {
          const l = document.createElement("link");
          l.rel = "stylesheet";
          const url = new URL(old.href);
          url.searchParams.set("retry", `${n}`);
          l.href = url.href;
          l.addEventListener("load", () => ok());
          l.addEventListener("error", () =>
            no(new Error(`Unable to load ${old.href}`)),
          );
          old.replaceWith(l);
        }),
    ),
  ).finally(() => (pending = null)));
}

// Spec 007 T2 (R7): the sheet's base path, in one place. The sheet tests use
// it instead of a literal path. Since the switch-over (007 T3) the sheet is at
// "/"; SHEET_BASE=/other npx playwright test … runs them on another path.

/** The sheet's path: "/" by default, or the SHEET_BASE env variable. */
export const SHEET = process.env.SHEET_BASE || "/";

/** The sheet's URL with an optional query, e.g. sheet("?host=notes:fx-menu"). */
export function sheet(query = ""): string {
  return SHEET + query;
}

/** The paths that serve the sheet's page ("/next" and "/next.html", or "/"
 * and "/index.html"). */
export const SHEET_PATHS =
  SHEET === "/" ? ["/", "/index.html"] : [SHEET, `${SHEET}.html`];

export const isSheetPage = (u: URL): boolean =>
  SHEET_PATHS.includes(u.pathname);

/** The sheet entry's name in the build (the Vite input key, which names the
 * entry's JS and CSS assets): "next" for "/next", "index" for "/". */
export const SHEET_ENTRY = SHEET === "/" ? "index" : SHEET.slice(1);

/** Matches the URL of the sheet entry's own JS or CSS asset. */
export const entryAsset = (ext: "js" | "css"): RegExp =>
  new RegExp(`/assets/${SHEET_ENTRY}-[^/]+\\.${ext}$`);

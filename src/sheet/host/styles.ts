// 002 R13-R16: the hosted apps' look. The old OS's tokens and widget styles
// load as `?host` modules, scoped under `.host-root` at build time
// (scripts/host-css.ts), as the apps' own CSS does. The host then sets, on
// every host root, the old role variables of the theme that matches the
// visitor's colour scheme (`default` light, `night` dark), `--u` 1 px and
// `--text-size` 16 px (any sheet zoom: the zoom is a transform), and keeps
// `dataset.motion` in step with prefers-reduced-motion.
import "../../ui/tokens.css?host";
import "../../ui/base.css?host";
import { refreshIcons } from "../../ui/icons";
import { RESOURCES } from "./resources";

export type ThemeName = "default" | "night";

const DARK = "(prefers-color-scheme: dark)";
const REDUCE = "(prefers-reduced-motion: reduce)";

interface ThemeFile {
  palette: string[];
  roles: Record<string, number>;
}

/** The rule that themes every host root, from /etc/themes/<name>.json. */
function rule(name: ThemeName): string {
  const t = JSON.parse(
    RESOURCES[`/etc/themes/${name}.json`] as string,
  ) as ThemeFile;
  const vars = ["--u: 1px", "--text-size: 16px"];
  t.palette.forEach((c, i) => vars.push(`--p${i}: ${c}`));
  for (const [role, i] of Object.entries(t.roles))
    if (t.palette[i]) vars.push(`--t-${role}: ${t.palette[i]}`);
  // icons.ts tints black glyph icons with the page root's --text (the sheet
  // itself has no --text)
  const text = t.palette[t.roles.text] ?? "#000000";
  return `.host-root{${vars.join(";")}}:root{--text:${text}}`;
}

/**
 * Starts the host's styles: before any app starts, the theme and
 * dataset.motion; on a scheme change, the new theme, then `changed(name)`
 * (the host publishes sys:theme) and the icons drawn again.
 */
export function startStyles(changed: (name: ThemeName) => void): {
  get(): ThemeName;
} {
  const dark = matchMedia(DARK);
  const reduce = matchMedia(REDUCE);
  // get() reads its own query list: in Chromium, reading `dark.matches`
  // between a scheme change and the change event (an app's start calls
  // sys.theme.get) takes the change in, and the event never comes
  const get = (): ThemeName => (matchMedia(DARK).matches ? "night" : "default");
  // an adopted sheet comes after the document's, so its .host-root rule
  // wins over tokens.css's (now .host-root too)
  const sheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  sheet.replaceSync(rule(get()));
  const motion = () =>
    (document.documentElement.dataset.motion = reduce.matches
      ? "reduced"
      : "full");
  motion();
  reduce.addEventListener("change", motion);
  dark.addEventListener("change", () => {
    sheet.replaceSync(rule(get()));
    changed(get());
    refreshIcons();
  });
  return { get };
}

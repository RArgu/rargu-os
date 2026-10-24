// 007 R6: the head tags of the sheet page from content/identity.json: title,
// description, canonical and og:*. Used by the site-identity plugin in
// vite.config.ts.

export interface Identity {
  name?: string;
  tagline?: string;
  links?: { website?: string };
}

/** The site's name, after the owner's name in the title (007 R6). */
export const SITE = "RArgu OS";

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// Every insertion is a replacement callback: in a replacement string, `$&`,
// `$$`, `$1`... in the text would be read as tokens (Codex 007 review #2).

/** `html` with the identity's title, description, canonical and og tags. */
export function siteHead(html: string, id: Identity): string {
  const { name, tagline } = id;
  let out = html;
  if (name) {
    out = out.replace(
      /<title>[^<]*<\/title>/,
      () => `<title>${esc(name)} · ${SITE}</title>`,
    );
  }
  if (tagline) {
    out = out.replace(
      /(<meta name="description" content=")[^"]*"/,
      (_, open: string) => `${open}${esc(tagline)}"`,
    );
  }
  // the address search engines and link previews should use
  const site = id.links?.website;
  if (site && name) {
    const url = site.endsWith("/") ? site : `${site}/`;
    out = out.replace(
      "</title>",
      () => `</title>
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(name)} · ${SITE}" />
    <meta property="og:description" content="${esc(tagline ?? "")}" />`,
    );
  }
  return out;
}

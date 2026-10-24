# content/ — owner-supplied material

Layout and frontmatter are defined in SPEC.md §11. Everything here is final for v1 except the `TODO(content)` items listed below.

- identity.json   name, handle, title, tagline, email, links, repoUrl, hostname
- resume.md       full resume; `##` headings become section anchors
- work/           one Markdown file per role, named YYYY-company.md
- education/      one Markdown file per degree
- projects/       one Markdown file per project
- writing/        essays (currently one placeholder)
- contact.md
- images/         PNGs (or GIFs) referenced from the Markdown
- easter-eggs.md  builder input for SPEC §10 — not site content

## Notes for the build

1. Copy `content/` into the image at the SPEC §5.2 paths. Do NOT copy `easter-eggs.md` or this `README.md`; use `easter-eggs.md` as input for the §10 fortunes, About credits, and syslog story.
2. §5.2 gives `content/images/` no destination. Choose one, and keep the relative reference `../images/whole-plant-ice-cream-cover.png` in `projects/whole-plant-ice-cream.md` resolving from `Documents/Projects/`. That PNG is ~690 KB, so it falls under the >64 KB lazy-load rule (§5.1).
3. `projects/castlesiege.md` and `projects/focused-web-crawler.md` carry an extra frontmatter field, `future_app: true`: the owner wants both runnable inside the OS later. Not v1 scope; keep the field and don't fail on unknown frontmatter keys.
4. YAML types: `year` parses as an integer and writing `date` as a date object. Coerce to strings for display.
5. `<!-- TODO(content): ... -->` comments mark owner gaps. The document viewer sanitizes raw HTML (§7.1), so make sure these comments are stripped, not escaped into visible text, and list them in the final report.
6. `repoUrl` is https://github.com/RArgu/rargu-os (public, created 2026-10-24, spec 010).

## Open TODO(content) items (owner will fill later; none block the build)

- contact.md: what he's open to, time zone, what not to contact him about
- easter-eggs.md: humor tone; anything to hide in the OS
- writing/notes-in-preparation.md: first essay
- projects/castlesiege.md: gameplay screenshots/GIFs (owner supplying)

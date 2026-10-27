# 014 challenges log

Real problems met while building 014. Evidence: `docs/ledger/2026-10-26-spec-014.md`,
`docs/review/spec-014-critique-codex.md`.

## 2026-10-26 — Two kinds of colour source
- What happened: languages have one exact source (GitHub Linguist, MIT), but tools have no shared one: some colours
  come from the tool's own logo or CSS, others only from Simple Icons, which cites a brand page. Python even differs:
  Linguist `#3572A5`, Simple Icons `#3776AB`.
- What we did: languages use Linguist v9.7.0 at a pinned commit (licence kept in the repo); every other entry
  records its full source, the version or date read, and how the value was taken (T1, `50c15a1`).
- Public: yes

## 2026-10-26 — The first tint left the screen's colour range
- What happened: the drafted rule (fixed lightness, capped strength) put 24 of 54 tints outside sRGB; clipping moved
  their hue by up to about 21°. Found in our own check and by the Codex critique.
- What we did: lower only the colour strength until it fits, round to bytes, and test the final hex: hue within
  1.4°, contrast at least 11.0:1 light and 9.4:1 dark (T2, `61df90b`).
- Public: yes

## 2026-10-26 — Chips with no brand colour
- What happened: web APIs (WebSocket, Canvas, Web Workers), AppKit, Requests, Pillow and GDELT have no brand
  colour of their own.
- What we did: the owner chose the parent's colour (JavaScript, Swift, Python); GDELT has no parent and stays
  neutral. Each is a one-hop `same` entry with its reason (T1).
- Public: yes

# Documentation map

Start at the root [README](../README.md) for what the site is, the code layout and the commands. This directory
holds the project documentation for RArgu OS:

- [specs/](specs/README.md): one folder for each change (spec and tasks), and the index with the status of each.
  The workflow is the `spec-driven` skill in `.agents/skills/`.
- [mockups/](mockups/README.md): the approved HTML mocks. The current approved mock is the layout baseline.
- [OWNER_QUESTIONS.md](OWNER_QUESTIONS.md): owner decisions made outside a spec.
- `review/`: the critic output (Codex critiques, implementation reviews, mock-vs-build comparisons) with
  dispositions.
- `ledger/`: one file for each session, with the commands that ran and their results.
- Local only (git-ignored, not in the public repo, spec 010): `handoffs/` (session handoffs and morning reports),
  `archive/` (the docs of DevPageOS and the parked Castle Wars art work), and at the repo root `design/`, `plan/`
  and `tools/` (the old OS's design files and the Castle Wars art pipeline).

Source art is in `art-source/`. It is kept out of git (owner decision 2026-10-22).

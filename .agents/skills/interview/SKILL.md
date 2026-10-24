---
name: interview
description: >
  Ask the owner questions until you both agree on exactly what to build, then write the answers down so later work
  can't drift from them. Use when a request is unclear or has open decisions, when the owner says "interview me",
  "/interview" or "ask me questions", and in spec-driven step 1 for every NEEDS OWNER item.
---

<!-- Ported from RETVController (written there 2026-10-14) on 2026-10-22; device-result rules made generic. Idea: the
"/interview" skill described in a hackathon workflow video (no published source found; nothing copied). Questioning
rules paraphrased from MIT-licensed mattpocock/skills (grilling). -->

# Interview

Goal: no open decision is left, and the answers are written where later work will read them.

## Before you ask

1. Read the request and the files it touches. List every decision the work needs.
2. Answer what you can yourself: code (file:line), earlier specs (*Never* and *Out of scope* lines), `docs/`,
   `docs/OWNER_QUESTIONS.md`, the approved mock in `docs/mockups/`, library docs. Ask the owner only for decisions:
   scope, preference, authority, risk.
3. Order the remaining questions so each answer can remove later ones.

## Asking

- **One question per AskUserQuestion call**, one decision per question. No batched rounds.
- Give your recommended answer first, marked "(Recommended)", with one line on why. Give 2–4 real options.
- Say what each option changes. Mark facts and guesses apart; cite the file or URL behind a fact.
- For visual choices, put a small ASCII mockup or code snippet in each option's preview.
- An empty or unclear "Other" answer: ask again. Don't fill it in yourself.
- Results the owner reports from their own browser or phone: ask for the exact value, one value per question, name
  the exact control and say "touch nothing else". Label the result owner-reported.
- Keep going until every decision on your list has an answer, or the owner says stop. A new answer that opens a new
  decision goes on the list.

## Write it down

- In a spec: put decisions in *Assumptions*, *Boundaries* and *Approval record* (date, question, answer). A
  `NEEDS OWNER` line goes away only when it is answered.
- Outside a spec: add a dated row to `docs/OWNER_QUESTIONS.md` § Answered.
- Later work that would go against a recorded answer stops and asks again first.

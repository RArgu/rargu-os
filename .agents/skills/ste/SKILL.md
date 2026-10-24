---
name: ste
description: >
  Write replies, reports and docs in short, plain technical English, based on the rules of Simplified Technical
  English. Use for every reply to the owner, every handoff, spec, ledger entry and doc change, and when the owner says
  "/ste", "plain English", "too wordy" or "what does that mean". Not for code, and not for site copy.
---

<!-- Ported from RETVController (written there 2026-10-14, in our own words) on 2026-10-22; examples changed to this
repo. Based on the published rules of ASD-STE100 Simplified Technical English (Issue 9, 2025; copyright and trademark
of ASD, Brussels), read via secondary sources (en.wikipedia.org/wiki/Simplified_Technical_English and
simplified-english.co.uk/rules-ste8.html). This is not ASD-STE100 and has no STE dictionary. Nothing copied. -->

# STE: plain technical English

The reader is busy and may not share your context. Write so that they understand it in one read.

## Words

- Use common, concrete words. One word has one meaning. Keep the same term for the same thing everywhere.
- No jargon or metaphors: not "lever", "knob", "surface" (as a verb), "counterfactual", "load-bearing", "land" (for
  "finish"), "unblock", "footgun". Say what actually happens.
- Technical names are fine (`vite`, `wrangler`, Playwright). Do not use a technical name as a verb.
- Do not use phrasal verbs when a single verb exists: "start", not "kick off". "find", not "figure out".
- Do not leave out articles, verbs or subjects to save space. No contractions.
- American spelling.

## Sentences

- Instruction sentences: 20 words maximum. Description sentences: 25 words maximum.
- One instruction per sentence. Write instructions as commands: "Run the test." Two actions in one sentence only
  when they happen at the same time.
- Active voice. Use passive only when you do not know who does the action.
- Simple verb forms: command, present, past, future ("will"). No long chains of helping verbs ("would have been
  being").
- Use "-ing" words only as names of things ("panning", "logging"), not as verbs in a long clause.
- Three nouns in a row at most. "window drag handler" is the limit. Break up longer ones with "of", "for" or "the".
- No semicolons. Make two sentences.

## Paragraphs and structure

- One topic per paragraph. Six sentences maximum.
- Put steps, conditions and options in a numbered or bulleted list.
- Lead with the result or the answer. Then give the reason.
- Warnings: start with **WARNING** (risk to data or the live site) or **CAUTION** (risk of lost work or a bad
  result). Then the command, then the risk: "**CAUTION:** Commit first. The script rewrites `src/`."

## Facts

- Keep the claim labels from AGENTS.md: say which is observed, derived, inferred or **Unverified**, with the file or
  URL.
- Give numbers, file paths and exact commands, not "some", "a few" or "the usual way".

## Check before you send

Read the text once as the owner. Shorten each sentence over the limit. Replace each word from the jargon list. Delete
each sentence that says nothing new.

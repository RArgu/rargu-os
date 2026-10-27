# 013 write-up plan: Focused Web Crawler and Insider Trading

Updated 2026-10-26 after the owner's round-2 and round-3 answers and the Codex critique
(`docs/review/spec-013-critique-codex.md`) (spec, "Owner answers 2026-10-26"). This is not site copy. The
owner approves the final text (spec, content task C5).

**Framing (owner):** each write-up is about the **new live build** (011, 012). Challenges are the ones met while
building it, from the track's `challenges.md`. Results come from our own runs. The course project is a short
**Origin** section with credit.

Sections (spec R8): Overview, Uses, How it works (one diagram, the live system), Challenges, Results, Origin. Each
section starts with one bold claim sentence. No images or charts except the diagram (Q7). Target: 400 to 600 words.

Sources: `content/projects/*.md`; the 011/012 drafts (`docs/specs/011-crawler-live/spec.md`,
`docs/specs/012-insider-live/spec.md`, read 2026-10-26); the course repos, read 2026-10-26 from shallow clones (no code
run). Repo paths are repo-relative. Everything from 011/012 is a draft and can change as they build.

---

## 1. Generalized Focused Web Crawler

**Window:** `crawler` · **Content file:** `content/projects/focused-web-crawler.md` · **Modes:** Demo (006) · Try
(011) · Read.

### Title block

- Title, year: "2025, live 2026" (owner, after approval), set when the tool ships.
- Role line (draft): "Built the live version. In the course project: the LLM strategy and the evaluations."
- Stack chips (owner, N7): the live build's stack, Ollama kept. From 011: TypeScript, Cloudflare Workers, Workers AI,
  Turnstile, Ollama (011 R5–R9; 011 confirms at C4). The course stack (Python, asyncio, Anthropic API, scikit-learn,
  Pandas, Matplotlib) is named in Origin text.
- Links: both course repos, the `LLM-Page-Selection` branch link, and the live site's own repo if public.

### Overview (filled at 011 C4)

- Claim sentence (draft): "**Four crawl strategies race on the same topic, and one evaluator scores them.**"
- A visitor types a topic. Three deterministic strategies and one LLM judge crawl from the same seeds, side by side.
  The window shows precision, domain diversity and overlap, and gives a zip (011 R2, R5, R9, R12).

### Uses

- Build a small, labelled set of pages on a research topic, and download it as a zip (011 R12; the course "grad
  student" use from the content file).
- See how a cheap LLM judge compares with deterministic focused crawling on your own topic.

### How it works: the live system (diagram; boxes to confirm at 011 C4)

Each box has its own `id`. Boxes for 011's stage ids (011 R15) also carry `stage` (spec R9 schema). Every 011 stage
id must be on one box.

1. **Topic** (browser): topic field and Turnstile check → Worker `/api/crawl/start`.
2. **`seeds`**: up to 20 URLs from DuckDuckGo, then Wikipedia, then Brave (011 R4).
3. **`frontier`**: four frontiers kept in the browser, one per strategy (011 R6).
4. **`fetch`**: the Worker fetches one page per request, under the fetch rules (011 R8). Loop label: "↺ next page".
5. **Gates, tier of 4:** `gate-a` URL priority · `gate-b` static similarity · `gate-c` adaptive similarity ·
   `gate-d` LLM judge: a small model on Ollama, CPU only, on a home machine (owner rule: no machine model in public text),
   through a Tunnel. Note: "may be offline; the other three keep running" (011 R7).
6. **`evaluate`**: a Workers AI model from another model family labels every page once, blind to the strategy →
   precision, diversity, overlap (011 R9) → zip in the browser (011 R12).
- Caption (draft): "The browser runs the race. Cloudflare fetches the pages, and a home machine judges them."
- `tool:status`: `{ judge }` sets the `gate-d` note.

### Challenges (from `docs/specs/011-crawler-live/challenges.md`, picked at C4)

Not written yet. Likely candidates (**inferred** from the 011 draft, to replace with what really happens): fitting a
crawl into the Free plan's 10 ms CPU and 50 subrequests per request; a CPU-only judge that must answer in 30 s; bot
pages and robots.txt; keeping the Worker from becoming an open proxy (011 R8 tags).

### Results (from 011's evaluation task, C3)

- A small HTML table (owner, N2): strategy · pages · precision · domain diversity · URLs only it found. Averages over
  10 topics × 3 runs (owner, round 3; 011 eval task). Under the table: run dates, judge model, labeler model, caps.
- Say that the labeler is also an LLM, so precision is "relevant according to the labeler".

### Origin (draft ready, owner checks)

- Claim sentence (draft): "**It started as a team project for CS-GY 6913 Web Search Engines, Fall 2025.**"
- The course version crawled up to 1,000 pages per strategy in Python, and the owner's LLM judge used Claude 3.5
  Haiku through the Anthropic API (`WSEProject` branch `LLM-Page-Selection`: `f_call_llm/d_relevance_filter.py`,
  `c_crawler/j_script_run_d_llmfocus.py`). The live build rewrites the method in TypeScript (011 assumption 2).
- Course stack in one line: Python, asyncio, the Anthropic API, scikit-learn, Pandas, Matplotlib (frontmatter).
- Credit (011 commit check, owner round 3): the owner built the LLM strategy and the evaluation layer on
  `LLM-Page-Selection`, the more complete branch. The teammate (GitHub username only: `hz3866` or `MacroMozilla`, 011 confirms from commit data) built the
  pipeline, the seeds, URL priority, the similarity crawlers, and the original labeler and precision plot on
  `master`. Neither branch has frontend code, so the write-up does not mention a frontend. Repo owner:
  `MacroMozilla`.
- Before the team project, the owner wrote a solo keyword crawler with swappable policies
  (`RArgu/CS-GY-6913-GeneralizedCrawler`). The zip came from it first. The live build has zips too.
- Links: `MacroMozilla/WSEProject` (branch `LLM-Page-Selection`), `RArgu/CS-GY-6913-GeneralizedCrawler`.

### Facts still open (crawler)

1. Closed at approval: teammates by GitHub username only (011 confirms which: `hz3866` or `MacroMozilla`).
2. Closed at approval: no machine model in public text. The Ollama model name comes from 011.
3. Closed after approval: the year line is "2025, live 2026".

---

## 2. Insider Trading Detection on Polymarket

**Window:** `insider` · **Content file:** `content/projects/polymarket-insider-trading.md` · **Modes:** Try (012) ·
Read. Try opens first, on the Maduro market (owner, N6).

### Title block

- Title, year: "2026, live 2026" (owner, after approval), set when the tool ships. Role line (draft): "Built the live version. In the course project: the idea, the data
  collection and the analysis design."
- Stack chips (owner, N7): the live build's stack: Python on the spare computer, Polymarket Data API v2, GDELT,
  Cloudflare Workers, D1 (012 R6–R11; 012 confirms at C4). The course stack (PySpark, Spark SQL, Spark MLlib,
  BigQuery, GraphQL) is named in Origin text.

### Overview (filled at 012 C4)

- Claim sentence (draft): "**It finds sharp price moves on Polymarket and the wallets that bet big just before
  them.**"
- A computer at home collects a set of markets each night and scores the wallets that bought before each sharp move.
  The site shows the stored results, with every score factor (012 R1, R2, R10).
- "Insider candidates", not proof (012 R12 wording).

### Uses

- Look at a market's sharp moves and the wallets that came before them, with the reasons for each score.
- Ask for a new market. It is ready after the next nightly run (012 R3–R5).
- A starting point for a journalist or a platform's trust team (**inferred**; keep only if the owner agrees).

### How it works: the live system (diagram; boxes to confirm at 012 C4)

Each box has its own `id` (`visitor`, `queue`, `push`, `store`, …). The compute boxes also carry `stage` with 012's
stage ids (012 R18), so they show "drawing" while a stored result draws (spec R10).

1. **Visitor** (browser): browse stored markets · request a market → Worker `/api/insider/request` (Gamma check).
2. **Queue** (D1): waiting requests, at most 5 new markets per night (012 R4, R6). Loop label: "↺ next night".
3. **Nightly run** on the spare computer, 03:00 (012 R6). Inside, one box per step:
   `market` (Gamma metadata) → `prices` (CLOB price history) → `moves` (5-minute VWAP, z > 3) → `candidates` (net
   buys in the 24 h before) → `news` (GDELT) → `score` (points rule 0–100).
4. **Push** → **Stored results** (D1) → back to 1.
- Status line from `tool:status`: last run, next run, requests waiting.
- Caption (draft): "Nothing runs while you watch. A computer at home checks the markets each night, and the site
  shows what it found."

### Challenges (from `docs/specs/012-insider-live/challenges.md`, picked at C4)

Not written yet. Known so far (**observed** in 012 assumption 1): the Goldsky subgraph that the course project used
answers `ENDPOINT_DEPRECATED`, and Data API v1 is retired, so the live build moved to Data API v2. Others to come
from the log. Likely (**inferred**): the course random forest learned its own label rule and was not saved, so the
live build uses a transparent points rule (012 assumption 5).

### Results (from 012's runs, C3)

- The number of markets stored and candidates found, with the date.
- Only 2 of the 3 markets that were open at the end of the course project resolved. "China invades Taiwan" is still
  open, and the live tool refreshes it each night (owner, round 3).
- Report-case check: from 012 R22's output (`jobs/insider/eval/report-cases.json`): the report's section 4 wallets
  over the 5 resolved start markets, with full addresses (critique 17). 013 runs no check of its own.
- Owner's choice (N8): publish the check only if the live rule flags the report's wallets. If it does not, Results
  leaves the check out. Rule (owner, N10): publish all rows if 2 or more of the 3 expected wallets are listed and
  the market maker is not. the report's §4.2 wallet bet about 115 h before its spike, outside the 24 h look-back, so it will likely
  not be listed. Table if shown, titled "Report cases, checked with the live
  rule": wallet · market · listed (yes/no) · score.

### Origin (draft ready, owner checks)

- Claim sentence (draft): "**It started as a two-person project for CS-GY 6513 Big Data, Spring 2026.**"
- Course pipeline in 2 to 3 sentences: on-chain fills from the Goldsky subgraph, PySpark into BigQuery, spike
  detection, wallet trace, scoring against GDELT news, then a Spark MLlib random forest and k-means
  (`RArgu/CS-GY6513-FinalProject`, `collect/`, `pipeline/ingest.py`, `analysis/*.ipynb`).
- Credit (owner, rounds 2 and 3): the owner had the idea, wrote the proposal, built the data collection and designed
  the analysis phases. `shwetanshu07` built the ingestion and the notebooks. Link
  `https://github.com/shwetanshu07`. No full name (owner rule at approval).
- The label problem, kept honest: the labels came from rules, and 2 of the 9 features defined the label, so 0.99
  accuracy showed that the model learned the rule (content file; report).
- Numbers (owner, round 3; 012 research §10): "333K on-chain fills across 6 markets (~$256M volume when collected)".
  Spec content task C6 changes the content file (lines 8 and 17) and `content/resume.md:47` to match.

#### Case studies (owner, Q8: as in the report)

- The spec R18 notice directly above them. Draft: "**These wallets were candidates from our course project's
  heuristics, not proof of insider trading.** Figures are from our final report (2026-05-18). To ask for a correction
  or removal, email <site email>. We reply within 7 days."
- Then the report's section 4 case studies with its own hedges: the wallet that matches the public DOJ case (the
  report "cannot claim definitive identification"), the §4.2 and §4.3 wallets, and the market-maker contract as the
  counter-example. Copy full addresses and figures from the PDF at C4, not from this outline.
- Where they live (owner, N5): in `content/projects/insider-case-studies.json` (spec content task C7), loaded with
  `noindex` into a `data-nosnippet` container (spec R18). It loads when Origin scrolls into view (owner, N9). The
  notice is in the static HTML. No address is. Removal steps: spec R19.

### Facts still open (insider)

1. Closed (round 3): the numbers and Shwetanshu's GitHub handle.
2. Is `fetch_trades.py` part of the course pipeline (the report does not list it)? Not needed for the short Origin.
3. Course-project challenges are no longer a section. Keep one line on the shared-cluster problem in Origin? (Draft:
   no, to keep Origin short.)

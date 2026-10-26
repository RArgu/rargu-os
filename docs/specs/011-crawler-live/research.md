# 011 research: the real crawler on rargu.dev

Research for [spec.md](spec.md). Collected 2026-10-26. Labels as in AGENTS.md: **observed**, **derived**,
**inferred**, **Unverified**. Prices change often. Check each one again before the build.

## 1. The original code

Two repos. Both were cloned shallowly to the session scratchpad and read. Nothing was run.

### 1.1 Where the owner's work is

- `MacroMozilla/WSEProject` has two branches: `master` and `LLM-Page-Selection`
  (observed, `gh api repos/MacroMozilla/WSEProject/branches`).
- `master` has no LLM strategy and no commit by the owner (observed, `git shortlog -sne` on `master`).
- `LLM-Page-Selection` (last commit 2025-12-12) has 17 commits by "Rodrigo Arguello", 14 by "harry" and 1 by
  MacroMozilla (observed, `git shortlog -sne HEAD`).
- The owner's commits add the files that `content/projects/focused-web-crawler.md` describes (observed,
  `git log --author=Rodrigo --stat`):
  - `f_call_llm/c_anthropic_client.py`, `f_call_llm/d_relevance_filter.py`
  - `c_crawler/j_script_run_d_llmfocus.py` (the LLM strategy)
  - `g_evaluator/b_llm_labeler.py`, `c_metrics.py`, `d_visualize.py`, `e_pca.py`, `f_discover_types.py`
- `RArgu/CS-GY-6913-GeneralizedCrawler`: 4 commits, all by RArgu, 2025-12-04 (observed).

**Consequence:** the spec must use the `LLM-Page-Selection` branch, not `master`. (derived)

### 1.2 Licenses

- WSEProject has no LICENSE file on either branch (observed). The teammates' code is "all rights reserved" by
  default. (inferred: default copyright law, not legal advice)
- GeneralizedCrawler says "MIT" in its README only, with no LICENSE file (observed, README `## License`).
- **Consequence:** a port can freely reuse the owner's own files. Code by "harry" (seeds, URL priority, static and
  adaptive similarity, fetch pipeline) needs the teammates' permission to copy. A clean reimplementation of the
  published *method* does not copy code. (inferred, not legal advice)

### 1.3 How each part works (branch `LLM-Page-Selection` unless noted)

| Part | What it does | Where | Cost per page |
|---|---|---|---|
| Seeds | DuckDuckGo through the `ddgs` scraping package, 100 results per topic, cached as `<query>.seed.jsonl` | `b_pre_crawler/b_searchengine_api.py:14-43` | 0 (one search per topic) |
| URL priority | Score = 0.5·log10(domain count + 1) + 0.5·log10(TLD count + 1), in a min-heap. Uses no topic words. | `a_url_scorer.py:6-30`, `a_priority_queue.py:7-36` | 0 |
| Static similarity | NLTK tokens + WordNet lemmas, IDF²-weighted cosine against the mean of ~100 seed pages. Reject below 0.10 or 0.25. | `j_script_run_b_relatedfocus*.py:62-71`, `doctool/doc_mana.py:23-73` | 0 (CPU only) |
| Adaptive similarity | Same, but each accepted page moves the mean | `j_script_run_c_dynamicfocus.py:62-74` | 0 (CPU only) |
| LLM judge (owner) | YES/NO prompt, first 8,000 characters, `max_tokens` 64, model `claude-3-5-haiku-20241022`, 5 workers | `f_call_llm/c_anthropic_client.py:21-25,81-110`, `c_crawler/j_script_run_d_llmfocus.py:59-65,190-204` | 1 call, ~2k input tokens |
| Labeler (owner) | Async labeler: relevance YES/NO and a page type from 10 classes, 10 at a time | `g_evaluator/b_llm_labeler.py:45-70,253-254` | 1 call per page per strategy |
| Metrics (owner) | Precision, unique domains ÷ pages, pairwise URL overlap, URLs unique to one strategy | `g_evaluator/c_metrics.py:44-170` | 0 |
| Fetch | `gatling` async pipeline (aiohttp), 10 at a time, 15 s timeout, robots.txt fails closed, no per-domain delay, no size limit | `c_crawler/helper_fctns.py:48`, `b_pre_crawler/c_check_robotfile.py:49-93` | 1 GET + robots.txt |
| Text | `trafilatura` | `requirements.txt` | CPU |

Notes:

- The LLM strategy targets 500 relevant pages per run (`j_script_run_d_llmfocus.py:59`). (observed)
- The labeler sends the whole page text with no truncation on `master` (`f_call_llm/b_extract_by_ollama.py`, model
  `gemma3:12b` on Ollama). The owner's labeler on the branch truncates. (observed)
- `claude-3-5-haiku-20241022` is retired (observed, Anthropic pricing page, Haiku 3.5 row "retired"). Any reuse must
  change the model id. (derived)
- No code emits progress events, and the pipeline uses global state (`f_urls_collected`, `qbuffer`). A service
  needs a rewrite of the run loop either way. (observed, derived)
- No run results or logs are in either repo (observed). Run time per page is **Unverified**.

### 1.4 What ports to TypeScript

- Easy: URL priority, IDF cosine (a word count, `Math.log`, a dot product), adaptive mean, the metrics, the YES/NO
  prompt. (derived from the code size: `doc_mana.py` is ~50 lines of math)
- Needs a substitute: NLTK lemmatizer (use a small stemmer or plain lowercase tokens), `trafilatura` (use
  `HTMLRewriter` text extraction or a readability port), Python `robotparser` (a small robots.txt parser).
  (inferred)
- Not needed: sentence-transformers. The code has no embedding model in any strategy. (observed)

## 2. Cloudflare (checked 2026-10-26)

| Item | Value | Source |
|---|---|---|
| Workers Paid | $5/month; 10M requests and 30M CPU-ms included | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Subrequests per invocation | Free 50; Paid 10,000 default | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| CPU per request | Free 10 ms; Paid 30 s default, 5 min max. Waiting on `fetch()` is not CPU. | same |
| Open connections | 6 per invocation | same |
| Memory | 128 MB per isolate | same |
| Wall time | No limit for HTTP while the client is connected; 15 min for DO alarms | same |
| Durable Objects (Paid) | 1M requests and 400,000 GB-s per month included | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| Turnstile | Free, unlimited verifications | [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/) |
| Rate Limiting binding | 10 s or 60 s periods; per location, approximate. Plan and price **Unverified**. | [binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) |
| R2 | $0.015/GB-month; free 10 GB-month; no egress fee | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Worker `fetch()` | Hostnames only, not raw IPs | [known issues](https://developers.cloudflare.com/workers/platform/known-issues/) |
| Tunnel proxy read timeout | 125 s (524 after), idle 900 s | [connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/) |
| Tunnel and SSE | Buffered unless the origin sends `Content-Type: text/event-stream` | [tunnel errors](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/troubleshoot-tunnels/common-errors/) |

**Unverified:** Tunnel price (third-party sources say free), Access service tokens, Cloudflare's acceptable-use
terms for crawling from Workers, whether a Worker `fetch()` can reach private address ranges, and the outbound IP
of a Worker `fetch()`.

**Consequence:** a crawl of more than ~45 pages does not fit the Free plan (50 subrequests). The crawl needs Workers
Paid ($5/month) or a crawl that runs outside Cloudflare. (derived)

## 3. LLM prices (per 1M tokens, input / output, checked 2026-10-26)

| Model | Price | Source |
|---|---|---|
| Claude Haiku 5.5 (prompts ≤ 100k tokens) | $0.10 / $0.50 | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) (observed by me and the researcher) |
| Claude Haiku 4.5 | $1 / $5 | same |
| Workers AI `llama-3.1-8b-instruct-fp8-fast` | $0.045 / $0.384 | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Workers AI `llama-3.2-3b-instruct` | $0.051 / $0.335 | same |
| Workers AI `gemma-4-26b-a4b-it` | $0.10 / $0.30 | same |
| Workers AI free allocation | 10,000 neurons/day ($0.011 per 1,000 neurons). Tokens per neuron **Unverified**. | same |
| OpenAI `gpt-5.4-nano` | $0.20 / $1.25 | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| Gemini 3.5 Flash-Lite | $0.30 / $2.50, free tier exists | [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Groq `gpt-oss-20b` | $0.075 / $0.30 | [Groq models](https://console.groq.com/docs/models) |
| DeepSeek `deepseek-flash` | $0.15 / $0.60 off-peak | [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) |

Spend caps: Anthropic lets you set a monthly limit below the tier limit (requests then fail with HTTP 400)
([rate limits](https://platform.claude.com/docs/en/api/rate-limits)). Gemini project caps are experimental and lag
~10 minutes. Others **Unverified**.

## 4. Seeds (topic → first URLs)

- The original uses `ddgs`, which scrapes DuckDuckGo (observed). It is not an official API. Use from a server is
  likely to be blocked or rate limited. (inferred)
- Brave Search API: about $5 per 1,000 queries with $5 of free credit each month (about 1,000 queries). The old free
  plan ended for new users in February 2026. Card required. **Unverified**: third-party sources only
  ([costbench](https://costbench.com/software/ai-search-apis/brave-search-api/),
  [agentdeals](https://agentdeals.dev/vendor/brave-search-api)). Brave's own page was not reached.
- Wikipedia search API: free, no key, but the seeds are Wikipedia pages only. (inferred)

## 5. Home computer

- Power: 40 W ≈ 29 kWh/month ≈ $5.30/month at 18.16 ¢/kWh (US residential, August 2026, preliminary,
  [EIA Table 5.6.A](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a)). The 40 W figure
  is an assumption. (derived)
- A crawl that runs on the home computer sends every request from the home IP. Site owners and abuse lists see that
  IP. (derived)
- Residential ISP terms on servers: **Unverified**. Cloudflare Tunnel opens only outbound connections, so no port
  is opened on the router. (inferred from how `cloudflared` works)
- Local model speed on the owner's hardware: **Unverified**. The hardware is not known.

## 6. Cost per run (derived)

This section is for a Workers Paid design. The owner chose Free for v1 (2026-10-26), so §10 replaces it. It stays for
a later move to Paid.

Assumptions: 4 strategies × 25 pages = up to 100 fetched pages. Each fetched URL gets one label (cache by URL). The
LLM strategy's own judge calls are about 25. That gives about 125 LLM calls × 1,000 input tokens (text cut to about
4,000 characters) + 10 output tokens.

| LLM | Per run | 300 runs/month |
|---|---|---|
| Workers AI llama-3.1-8b-fast | ~$0.006 | ~$1.80 |
| Haiku 5.5 | ~$0.013 | ~$3.90 |
| gpt-5.4-nano | ~$0.027 | ~$8 |
| Ollama on the home computer | $0 per run | power ~$5.30/month flat |

Fixed costs: Workers Paid $5/month. A search API: up to 1,000 queries/month in the free credit if Brave's terms are
as reported. **Rough total at 300 runs/month: $7–15/month** with a cloud LLM; add ~$5 power if the home computer
runs all month.

## 7. Cloudflare Free plan (added 2026-10-26, after the owner chose Free for v1)

Checked on the official pages on 2026-10-26 (observed, by me, with WebFetch):

| Item | Free value | Source |
|---|---|---|
| Worker requests | 100,000/day, reset 00:00 UTC. Over the limit: Error 1027 (fail closed) or the route skips the Worker (fail open). | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| CPU per request | 10 ms | same |
| Subrequests per request | 50 (fetch, and calls to R2, KV, D1, Cache API). The page also names 1,000 for "internal services" without a definition. Workers AI and Durable Object calls: not stated, **Unverified**. | same |
| Open connections | 6 waiting for headers at once; the 7th waits | same |
| Static assets | "Requests to static assets are free and unlimited." Effect of `run_worker_first` not stated. | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Durable Objects | Available on Free, SQLite storage only. 100,000 requests/day, 13,000 GB-s/day, 5M rows read/day, 100,000 rows written/day, 5 GB. | same |
| D1 | 5M rows read/day, 100,000 rows written/day, 5 GB | same |
| KV | 100,000 reads/day, 1,000 writes/day, 1 GB. Over a limit: that operation fails. | same |
| Workers AI | On Free and Paid. 10,000 neurons/day, reset 00:00 UTC. "To use more than 10,000 Neurons per day, you need to sign up for the Workers Paid plan." Over the limit: operations fail with an error. | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Turnstile | Free, unlimited | [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/) |

### 7.1 What this means for the crawler (derived)

- **One request cannot hold a run.** A run needs ~100 page fetches + robots.txt + LLM calls. 50 subrequests and
  10 ms CPU per request do not hold that. So the browser drives the run in small steps: one page fetch per request.
- **HTML parsing moves to the browser** (DOMParser on the visitor's CPU) except for link extraction (see the open
  proxy note, spec R8). Similarity math (strategies 2 and 3) runs in the browser.
- **The labeler is the tight limit.** Neurons per label (text cut to 2,000 characters ≈ 500 tokens, 3 output
  tokens), from the per-model neuron prices:

  | Workers AI model | Neurons per 1M input / output | Neurons per label | Labels per day | Runs per day (100 labels) |
  |---|---|---|---|---|
  | `qwen3-30b-a3b-fp8` | 4,625 / 30,475 | ~2.4 | ~4,100 | ~40 |
  | `gemma-4-26b-a4b-it` | 9,091 / 27,273 | ~4.6 | ~2,200 | ~22 |
  | `llama-3.3-70b-instruct-fp8-fast` | 26,668 / 204,805 | ~14 | ~720 | ~7 |
  | `gpt-oss-120b` | 31,818 / 68,182 | ~16 + reasoning tokens | < 600 | < 6 |

  The 012 tool shares the same 10,000 neurons if it uses Workers AI.
  These are list-price estimates. Characters do not fix the token count, and model defaults (thinking, output
  length) can add tokens. Spec R13 pins the settings, and T1 measures real neurons per label (critique #6).
- **Worker requests per run:** ~1 start + ~100 fetch + ~25 judge + ~10 label batches ≈ 140. At 30 runs/day that is
  ~4,200 of 100,000 (4 %). Not a limit for the crawler alone.
- **CPU per step is Unverified.** Reading a 256 KB body, link extraction with `HTMLRewriter`, HMAC tags for the links
  and a JSON reply must fit 10 ms. T1 measures it. Smallest workaround if it does not fit: send the raw HTML to the
  browser and extract links there. That gives up strict link checks (spec R8, Q-N3).

## 8. Seed sources (added 2026-10-26)

| Order | Source | Needs | Notes |
|---|---|---|---|
| 1 | DuckDuckGo HTML results page (`html.duckduckgo.com/html/?q=`), as `ddgs` does | Nothing (no key) | Not an official API. DuckDuckGo may block or challenge requests from Cloudflare IPs. Terms of use for automated queries: **Unverified**. The owner chose to try it first. |
| 2 | Wikipedia search (`en.wikipedia.org/w/api.php?action=query&list=search`) | No key. A descriptive User-Agent with contact info (Wikimedia policy, **Unverified** wording). | Seeds are Wikipedia articles only. The crawl then follows their outbound links. |
| 3 | Brave Search API | An API key (Worker secret) and a card on the Brave account | About 1,000 queries/month in free credit, $5 per 1,000 after (third-party sources, **Unverified**). |

Fallback trigger (proposal): the source answers non-200, answers a challenge page, takes more than 4 s, or gives
fewer than 5 usable result URLs. Each step costs 1 subrequest. The start request uses at most 3 for seeds.

## 9. The judge model on the spare computer (added 2026-10-26)

The hardware is not known. Assumptions and estimates (**inferred**, from typical Ollama behaviour; measure at T1):

| Spare computer | Suggested model | Size (Q4) | Time per page (~1,000-token prompt) | 25 pages |
|---|---|---|---|---|
| GPU with ≥ 12 GB VRAM | `gemma3:12b` (the model the team's original labeler used on `master`) | ~8 GB | ~1–2 s | under 1 min |
| GPU with 6–8 GB VRAM | `gemma3:4b` | ~3 GB | ~1 s | under 1 min |
| CPU only, 16 GB RAM | `gemma3:4b`, text cut to 1,500 characters | ~3 GB | ~10–30 s | 4–12 min |
| Apple silicon, ≥ 16 GB | `gemma3:12b` | ~8 GB | ~3–6 s | 1–3 min |

- Gemma for the judge and Qwen for the labeler keep the two in different model families. (derived from the owner's
  "different from the judge")
- Tunnel: `cloudflared` opens outbound connections only. Ollama listens on `127.0.0.1:11434` only. Cloudflare Access
  with a service token protects the hostname. Access on the free Zero Trust plan (50 users) and a card on file:
  third-party sources only, **Unverified**. A `cloudflared` ingress rule by path (to expose only `/api/chat`):
  **Unverified**. The fallback is a small local reverse proxy that allows only `POST /api/chat` and `GET /api/version`.
- The 125 s Tunnel read timeout (§2) is far above one judge call.

## 10. Cost on Free (derived)

Cloudflare $0 (Free plan, Workers AI free allocation, Turnstile free). Brave $0 inside the free credit, used only as
the last fallback. Power for the spare computer ~$4–8/month if it runs all month (§5). **Total ≈ $5/month.**

## 11. The spare computer: 2018 MacBook Pro (added 2026-10-26, round 2)

Owner: a 2018 MacBook Pro (Intel) with **8 GB RAM** (owner, 2026-10-26). CPU model (i5/i7/i9) is not known.

**8 GB budget (inferred):** macOS with no apps open uses ~3–4 GB. `cloudflared` uses < 100 MB. That leaves ~4 GB for
the model and 012's nightly job together. A 1–2B model (0.8–1.4 GB plus ~0.5 GB context) fits. `gemma3:4b` (~3.3 GB
plus context) fills the rest and forces swap if anything else runs. So: a 1–2B judge, and the judge is unloaded
during the nightly job (spec R20).

| Item | Finding | Label |
|---|---|---|
| Newest macOS | macOS 15 Sequoia. The 2018 MacBook Pro is not on the macOS 26 Tahoe list. | Inferred: third-party lists agree ([Macworld](https://www.macworld.com/article/673697/what-version-of-macos-can-my-mac-run.html), [512 Pixels](https://512pixels.net/?p=32495)); one outlier disagrees |
| Ollama | Needs macOS 14 Sonoma or newer. Intel Macs run "CPU only" (no GPU). | Observed, [docs.ollama.com/macos](https://docs.ollama.com/macos) |
| Consequence | The Mac must run macOS 14 or 15. Models run on the CPU only. | Derived |
| `cloudflared` | Has macOS builds (Homebrew) and installs as a launchd service (`cloudflared service install`). | Inferred, not checked on the official page |
| Security updates | Sequoia gets security fixes for some time after Tahoe. End date **Unverified**. | Inferred |
| Model speed | No published CPU-only number for this machine. A 1–4B model is the practical range on Intel; models above ~7B drop to a few tokens/s ([serverman guide](https://www.serverman.co.uk/ai/ollama/how-to-install-ollama-on-mac/), no measurements). | Inferred |

Estimates to replace with the T1 benchmark (**inferred**, typical 4-bit models on a 4–6 core Coffee Lake CPU):

| Model | Size (Q4) | Prompt speed | ~400-token prompt (1,500 characters) |
|---|---|---|---|
| `gemma3:1b` | ~0.8 GB | ~100–200 tokens/s | ~2–4 s |
| `qwen3:1.7b` / `llama3.2:1b` | ~1–1.4 GB | ~80–150 tokens/s | ~3–5 s |
| `gemma3:4b` | ~3.3 GB | ~30–60 tokens/s | ~7–14 s |

Note: `qwen3:*` on the Mac and `qwen3-30b-a3b` as the labeler are the same family. To keep the judge and labeler
in different families, choose the judge from Gemma or Llama. (derived)

### 11.1 Always-on concerns (inferred, check during T1)

- **Sleep:** set "never sleep on power" (`sudo pmset -c sleep 0 disksleep 0`). With the lid closed, a MacBook sleeps
  unless an external display is connected or sleep is disabled (`sudo pmset -a disablesleep 1`). Turn on restart after
  a power failure (`sudo pmset autorestart 1`).
- **Battery:** plugged in 24/7 at 100 % ages the battery and can make it swell. macOS battery health management
  (Intel Thunderbolt 3 notebooks, macOS 10.15.5+) reduces the charge level. A charge-limit app (third party) is an
  option. Check the battery for swelling now and then. Unverified for this machine.
- **Heat:** CPU inference holds all cores at full load. The 2018 MacBook Pro (mostly the i9) is known to slow down
  when hot (thermal throttling), which makes judge calls slower. Keep it on a hard surface with free airflow. The T1
  benchmark should include a 10-minute sustained run.
- **Restarts and updates:** Ollama and `cloudflared` must start at login or as launchd services. A macOS update
  restart takes the LLM column offline until they start again. The site handles this (spec R7).
- **Model load:** Ollama unloads a model after 5 minutes idle (default `keep_alive`). The first judge call after that
  waits for the load. Set `OLLAMA_KEEP_ALIVE` long (for example 1 h), or call the model once at run start.
- **Section 9 above** assumed unknown hardware. This section replaces it for the Mac.
- **One request at a time:** a CPU-only Mac serves one judge call at a time well. Two runs at once double the wait.
  Spec R7 gives the LLM to one run at a time.
- **012's nightly job at 03:00:** it competes for CPU and RAM. During that job, judge calls get slow or time out. With
  8 GB they must not run together. The proposal (spec R20): the judge is off from 02:55 until the job reports done
  (05:00 at the latest), and Ollama unloads the model first. The job never waits for a crawl. Few visitors come at
  03:00 (inferred). 012's job memory need is not known to this track (**Unverified**).

## 12. Who wrote what, and which branch is complete (added 2026-10-26, round 2)

From a full clone of `MacroMozilla/WSEProject` (both branches), session scratchpad `wfull/`. All **observed**
(commands: `git shortlog -sne`, `git log --numstat`, `git log master..llm`, `gh api repos/MacroMozilla/WSEProject`).

### 12.1 Authorship

| Author | Branch | Commits | Lines added / removed | Dates |
|---|---|---|---|---|
| harry (`hz3866@nyu.edu`) | `master` | 18 | +4,362 / −2,305 | 2025-11-15 to 2025-12-13 |
| Rodrigo Arguello | `LLM-Page-Selection` only | 17 | +3,195 / −52 | all on 2025-12-12 |
| MacroMozilla | `master` | 1 (README title) | +1 | 2025-11-15 |

- **The owner's commits match his claim of "LLM head + evals".** Anthropic client, LLM relevance filter, LLM crawl
  strategy (`j_script_run_d_llmfocus.py`), the async labeler (relevance + page type), metrics (precision, diversity,
  overlap), plots, PCA and page-type discovery. Plus five small fixes to shared code (directory setup, a broken
  import, seed loading, folder names, query choice).
- **Harry's commits match "normal crawl plus the original evals".** The async pipeline (`TaskFlowManager`), seeds,
  URL priority, static and adaptive similarity crawlers, the Ollama labeler (`f_call_llm/batch_executor_relevance.py`,
  `gemma3:12b`) and the precision-at-N curve (`g_evaluator/a_calc_focus.py`).
- **"Harry did the frontend": no evidence in the repo.** Neither branch has a front end (no HTML, JS, web app or UI
  file; `git ls-tree -r` grep). If a front end existed, it lived somewhere else. **Unverified.**
- The owner's 17 commits came in two bursts on 2025-12-12 (03:16–03:23 and 13:42–13:44), seconds apart. The work was
  most likely written earlier and committed file by file. (inferred)

### 12.2 Which branch is more complete

- The branch forks from `master` at `9c92686` (harry, 2025-12-11). It was never merged. There are no pull requests and
  no tags. The default branch is `master`. Last push to the repo: 2025-12-14.
- **`LLM-Page-Selection` has more features:** the 4th strategy (LLM), and the full evaluation layer that the project
  text describes (precision, diversity, overlap, page types, plots, PCA). `master` has none of these files (3,393
  lines only on the branch).
- **`master` has newer crawler work:** 4 commits by harry after the fork (2025-12-11 to 2025-12-13): a 0.10-threshold
  static crawler, a refactored adaptive crawler, more Ollama servers, and a better precision-at-N plot. The branch
  does not have these.
- **Final submission: Unverified.** Git does not show what was submitted. The branch is the only place where all four
  strategies and the shared metrics exist together. That makes it the most likely basis for the final comparison
  (inferred). `master`'s last commits (one day after the branch) suggest the teammate kept working on the baseline
  crawlers in parallel. (inferred)
- **No results exist in either branch.** No CSV, plot or log is committed (`.gitignore` excludes the outputs). The
  write-up's results must come from the new build's own evaluation (spec R19).

### 12.3 The original test topics

`b_pre_crawler/a_const.py` (same on both branches) has 10 topics: AI Image Generation App, Healthy Lifestyle
Tracker, Anime Character Creator, Travel Itinerary Planner, Global News Digest, AI Voiceover Generator, Mindfulness
Meditation App, Anime Recommendation Engine, Smart Travel Assistant, International Affairs Monitor. The owner's
labeler used only the first (`QUERY = "AI Image Generation App"`, `g_evaluator/b_llm_labeler.py:49`).

### 12.4 Zips

The zip output exists only in the owner's solo crawler (`RArgu/CS-GY-6913-GeneralizedCrawler`, `storage.py:73-131`).
The team crawler saves HTML files to disk and has no zip. (observed) The new build makes a zip anyway (spec R12).

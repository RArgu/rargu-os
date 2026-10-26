# 012 research: live Polymarket insider check

Research for [spec.md](spec.md), 2026-10-26. All curl tests ran from the owner's Mac on 2026-10-26 with
`Origin: https://rargu.dev`. Test market: "Will Donald Trump win the 2024 US Presidential Election?" (Gamma id
`253591`, condition `0xdd22…0917`, Yes token `2174…6455`, $1.53B volume). Small test market: Gamma id `688265`
(Maduro in US custody, $379K volume).

## 1. The original pipeline (RArgu/CS-GY6513-FinalProject)

Read from a clone of the repo. File:line refers to that repo.

| Stage | What it does | Where |
|---|---|---|
| Fetch | Gamma `/events?slug=`, `/markets?condition_id=`; CLOB `/prices-history` in 15-day chunks; Data API v1 `/trades?market=` with offset, then a `before=` cursor past offset 10000; Goldsky orderbook subgraph, `orderFilledEvents` where `makerAssetId = token`, 1000 per page, one day per chunk | `collect/fetch_metadata.py:13-46`, `fetch_prices.py:18-53`, `fetch_trades.py:20-122`, `fetch_wallets.py:22-108` |
| Ticks | price = takerAmount ÷ makerAmount, size_usd = takerAmount ÷ 1e6 | `collect/extract_ticks.py:33-37` |
| Spikes | 5-min VWAP per token. Rolling mean and std over the 20 previous buckets (rows, not time). z = (vwap − mean) ÷ std, null if std < 0.002. Spike: z > 3.0 and bucket volume ≥ $100. Up moves only, per token. No merge of nearby spikes. 569 spikes. | `analysis/detect.ipynb:67-71,327-340,466-483,724-727` |
| Wallets | Window [spike − 24 h, spike). Taker fills on the spiking token plus maker fills on the other token. One "bet" = one wallet's sum per spike and role; kept if ≥ $100. 128,096 bets, 13,068 wallets. | `analysis/trace.ipynb:82-83,519,1325-1327` |
| News | BigQuery `gdeltv2.events` × `eventmentions`. Keywords hand-written per market (e.g. MADURO, VENEZUELA). `bet_before_news` = a mention exists after the wallet's first bet. | `analysis/score_v2.ipynb:80,129,350` |
| Labels | label = 1 if `prescience_score > 0.7` and `win_rate > 0.65`, plus one wallet set by hand | `analysis/classify.ipynb:88-89,256,325` |
| Model | Random forest, 100 trees, depth 8; 9 features. Test accuracy 0.990, AUC 0.9995. `win_rate` importance 0.90. K-means k = 4 on label-1 wallets. | `classify.ipynb:536-594,828-837`; `classify_v2_insights.md:57-67` |

Findings that change the port:

1. **No saved model.** No `.save()`, pickle or joblib of the forest. Only the BigQuery result table is saved
   (`classify.ipynb:1399`). (observed) A "model export" means retraining.
2. **The model learned the label rule.** Two of nine features are the label definition, and `win_rate` has 0.90 of
   the importance. The report says so (`rep.txt:~530`). (observed)
3. **`win_rate` needs a resolved market.** It cannot score an open market. (derived)
4. **GDELT keywords were hand-written per market.** A live check needs keywords from the market question. (derived)
5. **The repo has no LICENSE file.** (observed) The owner co-wrote it, so a port of the owner's own logic is fine.
   `shwetanshu07` wrote the analysis notebooks (`content/projects/polymarket-insider-trading.md`). Credit him in the
   window. (inferred)

## 2. Polymarket APIs (observed 2026-10-26)

| API | CORS | Auth | Paging and limits | Notes |
|---|---|---|---|---|
| Gamma `GET /markets/{id}`, `/markets?slug=&closed=true`, `/events?slug=` | `*` | none | Rate 300 req/10 s (`/markets`) | `?slug=` alone returns `[]` for a closed market. Add `closed=true`. |
| Gamma `GET /public-search?q=&limit_per_type=` | `*` | none | 350 req/10 s | Returns events with their markets. |
| CLOB `GET /prices-history?market={token}&startTs&endTs&fidelity` | `*` | none | 1,000 req/10 s | `startTs`–`endTs` max ~15 days (15 d OK, 20 d "interval is too long"). `interval=max` returns `[]` for the closed 2024 market. Open market, `interval=max&fidelity=1`: 4,161 points for 30 days (down-sampled). Points are `{t, p}`, no volume. `cache-control: max-age=90`. |
| Data API v1 `GET /trades?market={condition}` | `*` | none | 200 req/10 s; `limit` ≤ 10,000; `offset` ≤ 10,000 (400 past it) | `start`/`end` work on a market (679 trades in a 100,000 s window). **v1 is retired on 2026-10-24** ([migration guide](https://docs.polymarket.com/migrate/data-api-v1-to-v2)) but still answered on 2026-10-26. Do not build on it. |
| Data API v2 `GET /v2/trades?condition={condition}` | `*` | none | 300 req/10 s; `limit` ≤ 1,000; keyset cursor (`next_cursor`), newest first | `start`/`end` work **only** with `user=` ([openapi](https://data-api.polymarket.com/v2/openapi.json)); with `condition=` they are ignored (observed). `filter_type=CASH&filter_amount=N` is honored (min trade $10,001 at N = 10000). `taker_only=false` adds maker rows (679 → 1,800 in one window). **The cursor needs the filters again** (`?cursor=` alone returns `[]`). ~1.4 s per 1,000-row page. One 503 seen in ~60 pages. |
| Data API v2 `GET /v2/activity?user=` | `*` | none | `limit` ≤ 1,000, cursor; `sort_direction=ASC`, `start=1` for full history | For a wallet's first-ever trade (wallet age). |

Rate limits are per IP and Cloudflare queues over-limit requests instead of a fast 429
([rate limits](https://docs.polymarket.com/quickstart/introduction/rate-limits)).

Trade fields (v2): `proxy_wallet, side, token_id, condition_id, size, price, timestamp, outcome, outcome_index,
name, pseudonym, profile_image, transaction_hash`. `name` is the Polymarket username. (observed)

### Size of a big market (observed)

On the 2024 election market, 10 pages (10,000 trades, 14 s) of v2 reach back:

| Trade filter | Time covered by 10,000 trades |
|---|---|
| none | 0.3 days |
| ≥ $1,000 | 1.1 days |
| ≥ $10,000 | 13 h per 1,000 trades |

The Maduro market (id 688265) has 765 trades in total (one page, 44 days). Most markets are small. A few are too big
to read in full on demand. (derived)

## 3. Goldsky

- The orderbook subgraph the original used answers **429 `ENDPOINT_DEPRECATED`**: "paused and deprecated following
  Polymarket's migration to V2 — the data is stale and incorrect." (observed)
- Replacement: Goldsky Edge Data API, `GET https://edge.goldsky.com/data/polymarket/activity` with `token_id`,
  `start_time`, `end_time`, `min_amount_usdc`, `cursor` ([openapi](https://edge.goldsky.com/data/openapi.json)). It
  has a real time window, so a 24 h window before an old spike costs a few requests. (observed)
- It needs an API key (`x-api-key`) or x402 payment. Without one it answers 402: "prepaid balance, funds ~500 requests
  at 10 atomic units each" for 5,000 atomic USDC ($0.005). So about **$0.00001 per request**. (observed price;
  account terms **Unverified**)
- CORS on the 402 echoed `access-control-allow-origin: https://rargu.dev`. (observed) The key must stay on a server.

## 4. GDELT DOC 2.0 API

- `https://api.gdeltproject.org/api/v2/doc/doc?query=&mode=timelinevolraw|artlist&format=json&startdatetime=&enddatetime=`.
  CORS `*`. No key. (observed)
- **1 request per 5 s per IP.** Three of five calls got 429 even after waits of 6–8 s. A call took 10–13 s.
  (observed) From Cloudflare's shared egress IPs, 429 will be more frequent. (inferred)
- `artlist` returned 2017 articles, so the date range is not limited to 3 months. (observed)
- Consequence: one timeline call and one headline call per market, cached a long time. Show "news not available now"
  on 429.

## 5. Cloudflare (from the docs, 2026-10-26)

| Item | Free | Paid ($5/month) |
|---|---|---|
| Subrequests per invocation | 50 | 10,000 |
| CPU per request | 10 ms | 30 s default, 5 min max |
| Wall clock (HTTP) | no limit while the client stays connected | same |
| D1 | 5M rows read/day, 100K written/day, 5 GB | 25B read, 50M written/month, 5 GB |
| KV | 100K reads, 1K writes/day | 10M reads, 1M writes/month |

Sources: [limits](https://developers.cloudflare.com/workers/platform/limits/),
[pricing](https://developers.cloudflare.com/workers/platform/pricing/).

A cold check of a medium market needs 1 Gamma + ~20 CLOB chunks + up to 60 trade pages + ~10 wallet-age calls + 2
GDELT calls ≈ 95 subrequests. That is over the Free limit. Parsing a 1,000-row page (~0.9 MB JSON) costs a few ms of
CPU, so 60 pages also break 10 ms. **Free does not fit. Workers Paid does.** (derived)

## 6. Options compared

| | (a) Browser only | (b) Worker + cache | (c) Spare computer via Tunnel | (d) Hybrid: (b) + spare computer pushes precomputed results |
|---|---|---|---|---|
| Works now? | Yes, all four APIs send CORS `*` | Yes | Yes | Yes |
| Monthly cost | $0 | $5 (Workers Paid, shared with 011) | $0 Cloudflare + power (~$4–8, inferred for a 30–60 W box) | $5 + power |
| Uptime | Upstream only | Cloudflare | Home power and network | Cloudflare; spare computer optional |
| Latency, cold | 10–90 s, on the visitor's phone | 10–90 s, streamed | Same or better (no CPU caps) | Featured markets instant |
| Latency, cached | none (no shared cache) | < 1 s | < 1 s | < 1 s |
| Same answer for all visitors | No | Yes | Yes | Yes |
| Site stays same-origin (010 R9) | **No**: 4 new third-party origins, visitor IPs go to Polymarket and GDELT | Yes, `/api/*` only | Yes, behind the Worker | Yes |
| Fidelity to the original | Heuristic port in TS | Heuristic port in TS | Can run Python, full trade history, retrain a model | Both |
| Big markets | Caps, slow on phones | Caps, coverage shown | Can read everything with time and a disk | Big featured markets read in full offline |
| Keys (Goldsky) | Not possible (key would be public) | Worker secret | On the box | Both |
| Main risk | API change breaks it; G-net for 4 origins | Shared egress IPs and GDELT 429 | Box offline = feature offline | More moving parts |

**Owner answer 2026-10-26:** a stored variant of (d) on Cloudflare Free. No cold checks. The PC collects full history
nightly and pushes results; visitors browse stored markets and can queue a request. See §9 and spec.md.

**Fallback for (c):** if the Tunnel is down the Worker must answer from cache or run (b). So (c) needs (b) anyway.
(derived) That makes (d) the useful way to add the spare computer: it never sits in the visitor's request path. It
pushes finished results to the Worker (D1) with a token. If it is off, nothing breaks. (derived)

## 7. Score: model or transparent rule

- A model export is not possible as is (finding 1). A retrained forest would again learn the heuristic labels
  (finding 2) and its main feature needs a resolved market (finding 3). (derived)
- A points score with every factor shown is honest, testable and works on open markets. Factors that work on one
  market, from the original's features: bet size, hours before the spike, entry price (long odds), share of the
  pre-spike buying, bets before more than one spike, bet before the news rose (prescience), wallet age (new). (derived)
- K-means "styles" (serial, high stakes, opportunistic) can come back later from the spare computer. Not needed now.

## 8. Naming real wallets

**Owner answer 2026-10-26:** "Insider candidates" with full address and username. The list below is kept as the
background for the Risks section of spec.md.

- Wallet addresses are pseudonymous, but v2 returns a Polymarket username (`name`) and some usernames are real names.
  (observed field; the real-name share is **Unverified**)
- A public page that says "insider" next to an address is an accusation in plain words. The original report already
  says the labels have no ground truth. (observed, `rep.txt`)
- Lower-risk choices (inferred, not legal advice; the owner may want a lawyer's view):
  1. Call the result "Unusual bets before a price move" and the score "pattern score", not "insider score".
  2. Show a short address (`0x4bfb…982e`), no username, no avatar. Link to the address on Polymarket only on click.
  3. Put the "flags patterns, does not prove insider trading" line next to every list, not only in a footer.
  4. No wallet search, no "top insiders" page, no indexing of results (`noindex`, results only via the API).
  5. A contact line for removal requests, and a short block list the owner can add a wallet to.
- Polymarket API terms for public display: **Unverified** (search found no developer terms; check
  polymarket.com/tos before launch).

## 9. Cloudflare Free fit for the stored design (2026-10-26)

Free limits from the docs ([limits](https://developers.cloudflare.com/workers/platform/limits/),
[pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[static assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)):

| Limit (Free) | Value | Insider use | Fits? |
|---|---|---|---|
| Worker requests | 100,000/day; static assets free and unlimited; over the limit `run_worker_first` paths answer 429 (documented, not tested) | Reads of `/api/insider/*`; `max-age=300` helps repeat views only (browser cache). Shared with 011. | Yes. Fallback R17 if hit. |
| Subrequests | 50 per invocation (1,000 to Cloudflare services) | ≤ 2 Gamma calls per visitor request; D1 calls | Yes |
| CPU | 10 ms per request | Reads return stored text without parsing. Push parses ≤ 1 MB JSON once. | Reads yes. Push **Unverified**: measure in tasks; if over, push smaller parts (one per section). |
| D1 | 500 MB per database, 10 databases, 5M rows read and 100K written per day, 2 MB per row, 100 KB per statement, 50 queries per invocation | 50 markets × ≤ 1 MB = ≤ 50 MB. Result passed as a bound parameter, not in the statement text. | Yes |
| KV | 100K reads, 1K writes per day | Not used | — |
| Durable Objects | SQLite-backed only, 100K requests/day | Only if 011's `Limits` object is shared | Yes |
| Cron Triggers | 5 per account, 10 ms CPU | Not used: the PC runs the schedule | — |

**Request budget (Free, 100,000 Worker requests per day, shared with 011; inferred estimate):** one insider view
is about 1 list + 1 result + ≤ 30 pictures = ~32 requests (browser cache helps only repeat views). 500 views a day
use ~16,000. The PC uses < 1,000 a night (pushes, pictures, job status). 011 budgets its runs separately (30 runs
a day). D1: a view reads ~32 rows; far under 5M reads a day.

**Blockers on Free:** none found. One item to measure: Worker CPU for a 1 MB push (derived risk, not observed).

**PC job size (observed 2026-10-26):** Maduro market (`916440`, $11M volume): all v2 trades in 27 pages, 38 s. The
2024 election market ($1.53B) has more than 10,000 trades per 0.3 days at the end; a full first run is long
(estimate: hours, inferred), so R7 caps a first run at 3 h and refreshes read only new trades.

## 10. Which project numbers are right (2026-10-26)

Sources: the original repo (`README.md`, `config/markets.json`, `analysis/detect.ipynb`), the final report
(`docs/Prediction_Market_Insiders_Final_Report.pdf`, text layer via `pdftotext -layout`), Gamma today, and this
repo (`content/resume.md:47`, `content/projects/polymarket-insider-trading.md:8,17`).

### Fills

| Figure | Where | What it counts |
|---|---|---|
| 333,363 | report text lines 54, 191 | Raw Goldsky `orderFilledEvents` with `makerAssetId` = a token of the 6 markets, before ingest filters (observed) |
| 329,373 | `detect.ipynb` (tick count table) | The same fills after ingest (price in (0,1), size > 0), loaded into BigQuery. Per market and side: strikes 77,435; Maduro 8,356; Khamenei 71,364; US forces 102,963; ceasefire 9,462; Taiwan 59,793 (observed; sum checked) |
| 226K+ | site and resume | **Not found** in the repo or the report (grep, observed). 329,373 − 102,963 (US forces) = 226,410, so it is probably the count without the US-forces market, from an earlier collection (inferred, not proven) |

**Verdict:** use **333K** (raw, the report's figure) or **329K** (after cleaning). 226K is an under-count for "6
markets". (derived)

### Volume

| Figure | Where | Why it differs |
|---|---|---|
| $253M | README table: 89 + 10 + 131 + 11 + 1.1 + 11 | Market volumes when the data was collected, rounded down (observed) |
| $256M | `config/markets.json` `volume`: 89.65 + 10.97 + 131.11 + 11.64 + 1.17 + 11.46 | Same, unrounded (observed) |
| ~$300M | report lines 94–135 | Uses **$56.6M for Maduro, which is the whole event** "Maduro out in 2025" (6 markets, $56.62M on Gamma today), not the "by January 31" market ($10.97M). 300.5 = 89.7 + 56.6 + 131.1 + 11.0 + 1.1 + 11.0 (observed and derived) |
| $240M+ | site and resume | Not found in any source. It is a true lower bound of $253–256M but matches no sum (inferred) |
| $355.7M | Gamma, 2026-10-26 | The open markets kept trading after collection: US forces $73.9M, ceasefire $5.0M, Taiwan $45.0M (observed) |

**Verdict:** the right figure for the data the project analyzed is **~$256M** (config, at collection). The report's
Maduro row is the event volume, an error. (derived)

### Maduro: the live v2 pull against the original

- Original: 8,356 cleaned Goldsky fills for 2025-12-03 to 2026-01-03 (config `collect_from`/`collect_to`), one
  query per token on `makerAssetId` only (research §1).
- v2 today: 9,367 taker trades, 26,329 rows with maker rows, 2025-12-12 to 2026-01-03 (Gamma `startDate`
  2025-12-12). (observed)
- The units differ (one leg of a fill vs one taker trade vs every maker leg), so the counts do not match and are
  not expected to. (derived)

### Status of the 6 markets today (Gamma, observed 2026-10-26)

| Market | Gamma id | Result |
|---|---|---|
| US strikes Iran by Feb 28 | 1198423 | Yes |
| Maduro out by Jan 31 | 916440 | Yes |
| Khamenei out by Feb 28 | 1180303 | Yes |
| US forces enter Iran by Mar 31 | 1162940 | **No** (closed 2026-04-05) |
| US–Iran ceasefire by Jun 30 | 1484895 | Yes (closed 2026-04-08) |
| China invades Taiwan by end of 2026 | 567621 | **Still open** (Yes at 0.0195) |

So 2 of the 3 "active" markets resolved. The Taiwan market has not. (observed)

## 11. The spare PC: 2018 MacBook Pro, 8 GB

- **macOS:** the 2018 MacBook Pro is not on the macOS Tahoe 26 list
  ([9to5Mac](https://9to5mac.com/2025/06/09/macos-tahoe-26-compatibility-list/)). Sequoia 15 is its last version
  (inferred). Security fixes for Sequoia will end in a few years (inferred). Python 3.12, DuckDB, Pillow and
  `requests` have Intel macOS builds (inferred from their wheels; check at install).
- **Memory budget (8 GB):** macOS and its services take ~3–4 GB, Ollama keeps ~2–3 GB loaded for 011 (owner). That
  leaves ~1–2 GB (inferred). Spark needs a JVM with 1–2 GB of heap before data, so **Spark does not fit**. (inferred)
- **Plan:** write each 1,000-row page to a DuckDB file at once. Set `memory_limit = '600MB'` and `threads = 2`. Do the
  5-min buckets, z-scores and 24 h windows in SQL. Target < 800 MB RSS (R7, R21; measure in tasks).
- **Time:** network bound, not CPU bound. Maduro: 27 pages in 38 s (observed). At ~1.4 s per 1,000 rows, the 6 start
  markets (~330K fills in the original; v2 rows with makers are about 3× the taker trades) need roughly 1,000–1,500
  pages, so 25–35 min for the first full run, plus ~10 s per GDELT call (derived estimate). Nightly refreshes read
  only new trades: minutes.
- **Disk:** ~100–200 bytes per stored row in DuckDB, so 1M rows ≈ 100–200 MB (inferred).
- **With 011 (011 R20, adopted 2026-10-26; Codex 012 #4):** the job owns 03:00–05:00 owner time. It writes
  `~/.rargu/llm-busy.lock` with its PID, unloads the Ollama model, never waits for a crawl, stops new
  work at 04:50 and deletes the lock. The `launchd` job kills its process group at 04:55 (011 R20); 011's proxy
  ignores a stale lock only outside 02:55–05:00 when its PID is not running. 011 budgets ≥ 2 GB
  free; the job targets < 800 MB.
- **Estimate per night (derived, not measured; R21.a measures it):**

  | Step | First night (6 markets) | Normal night (Taiwan refresh + up to 5 new) |
  |---|---|---|
  | v2 trades | 1,000–1,500 pages × 1.4 s ≈ 25–35 min | Taiwan: new trades only, 1–5 min; a new small market ~1 min (Maduro 38 s); a big one is cut at 04:50 and continues |
  | CLOB prices | ~150 calls, 1–2 min | < 1 min per market |
  | GDELT | 6 × (1 timeline + 5 headline calls) at ~18 s each ≈ 10–12 min | ≤ 6 × 6 calls ≈ 11 min |
  | Wallet ages and pictures | ≤ 600 calls, 5–8 min | ≤ 1–5 min |
  | Compute and push | < 2 min | < 1 min |
  | **Total** | **~45–60 min** (ends ~04:00) | **~5–30 min** |
  | **Peak memory** | **< 800 MB RSS** (DuckDB 600 MB limit + Python ~150 MB) | same |

  R8 keeps 10 moves, but the job asks GDELT for headlines around the 5 largest only, to save time.
- **Resume of a cut market:** v2 has no time filter on a market, so a resumed run reads from the newest trade
  again until it meets stored rows, then continues with a saved cursor. Whether a saved cursor still works the next
  day is **Unverified** (cursors are signed); if not, the job pages through the stored part again (~1.4 s per
  1,000 rows).
- **Always on:** set "Prevent automatic sleeping when the display is off" (or `pmset -c sleep 0`), and
  `pmset repeat wakeorpoweron` as a safety net. A `launchd` job with `StartCalendarInterval` runs once at the next
  wake if the Mac slept at 03:00 (launchd behavior, inferred from its man page). Lid open on a stand for heat. Keep
  battery health management on; months at 100 % charge can swell an old battery (inferred).

## 12. Profile pictures

- In 1,000 Maduro trades ≥ $500: 442 wallets, 434 with a `name`, 140 with a `profile_image`. Every image URL was on
  `polymarket-upload.s3.us-east-2.amazonaws.com`. (observed 2026-10-26)
- Options:
  1. **Hot-link** the S3 URL in the page. Adds a third-party origin (G-net), fails the 010 R9 same-origin check, sends
     visitor IPs to AWS, and shows whatever the user uploads later.
  2. **Proxy** through the Worker on each view. Same origin, but one subrequest per image, and it still shows
     today's picture without a check.
  3. **Copy at night** on the PC (resize to 64 px, WebP, strip metadata), store in D1, serve from the Worker. Same
     origin, ~2–4 KB each, the block list works, and nothing changes on the site between runs.
- **Recommended: 3** (lead decision in spec R20). It keeps 010 R9, so it needs no owner call unless the owner wants
  hot-linking.

## 13. Math contract (spec R8–R10)

All times UTC epoch seconds. Dollars = `size × price` of a row.

**Moves (R8).** Taker rows only (each fill once).
1. Bucket = `floor(timestamp / 300) × 300`, per token. Bucket VWAP = Σ(price × dollars) ÷ Σ dollars; volume = Σ dollars.
2. Empty buckets are skipped: the window is the 20 previous non-empty buckets of the same token (as the original,
   `rowsBetween(-20, -1)`). A bucket with fewer than 20 previous buckets has no z.
3. mean and std over those 20 VWAPs; std is the sample std (n − 1, Spark `stddev`). z = (VWAP − mean) ÷ std; no z if
   std < 0.002.
4. A bucket is a move bucket when z > 3 and volume ≥ $100. A Yes move is up in Yes; a No move is up in No (= down in Yes).
5. Merge: move buckets of the same token whose starts are ≤ 3,600 s apart form one move. Move time = start of its
   first bucket. Move size = max VWAP − mean of the first bucket.
6. Keep the 10 largest moves by size; ties by larger z, then earlier time.

**Candidates (R9).** All legs. For a move on token T (other token O), window [t − 86,400, t).
- Buy dollars = BUY of T + SELL of O. Sell dollars = SELL of T + BUY of O. Net = buy − sell; gross = buy + sell.
- Keep net ≥ 500 and net ≥ 0.2 × gross.
- Bet time = time of the wallet's first buy row in the window. Hours before = (t − bet time) ÷ 3,600.
- Entry price = Σ(price paid for T × buy dollars) ÷ Σ buy dollars, where a SELL of O at p counts as a buy of T at 1 − p.

**Score (R10).**
- Size percentile: rank of the wallet's net among all (wallet, move) pairs kept in this market (percentile rank,
  ties get the lower rank).
- Share: wallet net ÷ Σ net of all kept wallets for this move.
- Moves bet on: number of this market's moves where the wallet is kept.
- News rise day: first UTC day in the market life where the GDELT daily article count ≥ 2 × the median of the 7
  previous days and ≥ 5 articles. Points when bet time < 00:00 UTC of that day and the day is ≤ 7 days after the bet.
  GDELT keywords: words of the market question with a capital letter (not first word, not month names), up to 3;
  if none, the 4 longest words that are not stop words, numbers or dates; joined with spaces (AND).
- Wallet age: `/v2/activity?user=&type=TRADE&sort_direction=ASC&start=1&limit=1` (the `type` parameter is in the
  v2 openapi, observed). First trade time; points by days before the bet time.
- A factor with no data scores 0 and is marked `no_data`. The result lists the factors with no data.
- Candidate list order: score, then net, then address (ascending).

**Fixtures (tests):** (1) two planted jumps on Yes, +0.12 in 30 min and +0.08 in 45 min, noise std 0.004; (2) a
down move of Yes (= No move); (3) 15 buckets only (no z); (4) a flat series (no move); (5) a move with no wallet over
$500 (no candidate). Expected moves, z values, wallet nets, factors and totals are written in the fixture files.

## 14. Push schema (spec R11, summary)

`schema_version: 1`. Top level: `market` (id, condition id, question ≤ 300 chars, slug ≤ 200, closed, end date,
as_of, collection, coverage `{ trades_from, trades_to, partial_reason ≤ 200 }`), `prices` (≤ 3,000 points, each
`[t, p]` with 0 ≤ p ≤ 1), `moves` (≤ 10: time, token, size, z, price before and after), `candidates` (≤ 10 per move:
address `^0x[0-9a-f]{40}$`, username ≤ 50, image sha256 or null, net, gross, bet time, hours before, entry price,
score 0–100, factors list of `{ id, points, value, no_data }`), `news` (≤ 400 daily counts; ≤ 25 headlines with
title ≤ 300 and `https:` URL ≤ 500), `rule_version`. Numbers must be finite. Unknown keys: 400.

## 15. v2 trade rows: roles and duplicates (observed 2026-10-26, Codex 012 #2)

- Fields: `proxy_wallet, side, token_id, condition_id, size, price, timestamp, outcome, outcome_index, title, slug,
  icon, event_slug, name, pseudonym, bio, profile_image, profile_image_optimized, transaction_hash`. No role field,
  no fill id, no log index.
- Maduro, newest 1,000 rows: `taker_only=true` gave 1,000 rows with 1,000 different `transaction_hash` values.
  `taker_only=false` gave 1,000 rows with 363 different hashes. In the 363-row overlap, every taker row was also in
  the all-legs stream.
- One transaction held two rows with equal wallet, side, token, size, price and time (`0x79cbe531…` BUY No 2,345).
  A content key would drop a real fill.
- Consequence (spec R7): read both streams, assign roles by matching, keep page/row order, never deduplicate by
  content. Whether a transaction can hold two taker rows is **Unverified**; the matching rule handles it (each taker
  row is used once).

**Note for R22 (inferred):** the report says Vivaldi007 entered "approximately 115 hours before the largest
pre-resolution spike" on US strikes Iran (report text line ~339). The R9 window is 24 h. Unless the wallet also
bought within 24 h of some kept move, the rule will not list it, and under the owner's rule the results would not
be published. The same holds for `0x1caa6a…46a0` (about 37 h before, report §4.3). The owner kept the 24 h look-back
(reconciliation round). The verdict needs 2 of the 3 expected wallets, so if only the soldier wallet is listed, the
results are not published. R22 states both gaps either way.

---
title: Insider Trading Detection on Polymarket
short: Insider Trading
year: 2026
stack: [Python, PySpark, Spark SQL, Spark MLlib, BigQuery, GraphQL]
links: [https://github.com/RArgu/CS-GY6513-FinalProject]
status: demo-coming
summary: A PySpark pipeline over 226K+ Polymarket fills. It flags wallets that bet big before sharp price moves. Candidates, not proof.
---

# Insider Trading Detection on Polymarket

A two-person project for CS-GY 6513 Big Data, Spring 2026, with Shwetanshu Raj.

## What it is

A PySpark pipeline that looks for suspicious trading right before sharp price moves on Polymarket. It ingested 226K+ on-chain wallet fills across 6 geopolitical markets ($240M+ in volume) and found price spikes with Spark SQL rolling-window functions. It then traced the wallets that bet big just before each spike and scored them against a timeline of news from the GDELT corpus in BigQuery. Finally, a random forest and k-means clustering in Spark MLlib flagged the wallets that looked most like insiders.

It flags candidates. It doesn't prove anyone traded on inside information.

## Why we built it

We thought it was interesting. I'd already been building bots on Polymarket, so I knew how to pull huge amounts of data out of it. Then, in April 2026, a U.S. soldier was charged with betting on Maduro's capture days before it happened. After that, the question of who knows what before a market moves wasn't hypothetical anymore.

## My part

I pitched the insider-trading idea, drafted the proposal, and built the data collection. That meant fetchers for market metadata, price history, and trades, wallet-level fills pulled from the Goldsky subgraph over GraphQL, and per-trade tick extraction. Shwetanshu built the BigQuery ingestion and the analysis notebooks, from spike detection through classification.

## What was hard

- **No ground truth.** Nobody publishes a list of insiders, so our training labels came from heuristics. The model's strongest features were the same ones that defined those labels. High accuracy only meant it had learned our rule, not that it had found insiders, and the report says so.
- **Sharing a cluster.** NYU's Dataproc cluster wouldn't let both of us use the same environment at once, so we moved the data to BigQuery, where we could both query the same tables at any time.

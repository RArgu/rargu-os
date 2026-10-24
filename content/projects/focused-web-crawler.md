---
title: Generalized Focused Web Crawler
short: Focused Crawler
year: 2025
stack: [Python, asyncio, Anthropic API, Ollama, scikit-learn, Pandas, Matplotlib]
links: [https://github.com/MacroMozilla/WSEProject, https://github.com/RArgu/CS-GY-6913-GeneralizedCrawler]
future_app: true
status: demo-coming
summary: Give it a topic and four strategies crawl side by side: URL keywords, static similarity, adaptive similarity, and an LLM judge. One evaluator scores precision, domain diversity, and overlap. I built the LLM strategy and the evaluation layer.
---

# Generalized Focused Web Crawler

A team project for CS-GY 6913 Web Search Engines, Fall 2025.

## What it is

You give it a topic, and it crawls the web for pages about that topic. It runs four strategies side by side: URL-keyword priority, static document similarity, adaptive document similarity, and an LLM that judges relevance. All four feed the same evaluator. It labels each page for relevance and page type, then measures precision, domain diversity, and how much the strategies' results overlap.

## Why we built it

We wanted to see how well cheap AI holds up against older, deterministic focused-crawling methods. We also wanted something useful, more academic than commercial: a tool a grad student could point at a research topic and get back a ready-made zip of the websites they need.

## My part

My commits added the LLM strategy and the shared evaluation layer: the Anthropic client and relevance filter, the LLM-focused crawler, an asynchronous relevance and page-type labeler, the precision, diversity, and overlap metrics, the comparison charts, and a TF-IDF/PCA view of what each strategy collected.

Before that, I built a keyword-baseline crawler on my own, with swappable decision and crawl policies, so an LLM policy could drop in later. It's the second link above.

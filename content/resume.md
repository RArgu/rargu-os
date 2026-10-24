# Rodrigo Arguello

Software Engineer · [rargu.dev](https://rargu.dev) · [r.arguello.h@gmail.com](mailto:r.arguello.h@gmail.com) · [github.com/RArgu](https://github.com/RArgu) · [linkedin.com/in/rodrigo-arguello](https://linkedin.com/in/rodrigo-arguello)

## Experience

### Software Engineer, DropIn
Monterrey, Mexico · Mar 2024 – Aug 2024

- Architected a cloud-native route optimization microservice on AWS Lambda, Step Functions, and S3 processing 200+ daily delivery stops; reduced average route time ~25% vs. manual planning.
- Designed a k-means classification pipeline partitioning city regions into delivery zones with configurable constraints (mountains, highways), enforcing cluster completion before cross-zone hops.
- Implemented batched optimization with ~10-stop look-ahead heuristics to respect Google Maps API limits; instrumented CloudWatch metrics, reducing external API costs by 40%.
- Deployed an AWS production system (Lambda, SQS, S3, CloudWatch, IAM) with stream ingestion and cross-region S3 replication for disaster recovery, sustaining 99.5% uptime.

### Associate Member of Technical Staff, Salesforce
Automation Builder Core Team · San Francisco, California · Feb 2022 – Apr 2023

- Redesigned the breadcrumb navigation system for Salesforce Flow Builder, improving UX for 150,000+ daily active users building workflow automations.
- Resolved 50+ critical production incidents with QA and product teams, maintaining platform stability for enterprise customers.
- Built Splunk logging and metrics dashboards over AWS-hosted Flow services and wired alerts into the deployment pipeline; reduced mean time to detection by 30%.
- Worked in an agile scrum team on a two-week release cadence (sprint planning, daily stand-ups, retrospectives).

### Engineering Analyst, Goldman Sachs
Marcus Lending Platform · Dallas, Texas · Jul 2021 – Dec 2021

- Architected an automated end-to-end testing platform for Marcus loan application onboarding, letting the Lending team run integration tests 3× faster without touching production data.
- Developed Python REST API endpoints for loan application creation, validation, credit checks, and status updates across the lending pipeline.
- Redesigned the customer selection parser that queries and filters applicants, reducing data retrieval time by 40%.

### Summer Analyst, Technology, Citibank N.A.
New York, New York · Jun 2020 – Aug 2020

- Built a Python OCR application using Tesseract to automate transcription of cash receipts, eliminating manual data entry for the operations team.

## Projects

### CastleSiege: Turn-Based Strategy Game
[castlesiege.fly.dev](https://castlesiege.fly.dev) · TypeScript, React Native / Expo, Node.js, WebSocket, PostgreSQL, Web Workers, Fly.io / Docker, CI/CD

- Built an in-browser game AI (Monte Carlo Tree Search + alpha-beta search, Zobrist-hashed move ordering) in an off-main-thread Web Worker; powers a practice bot and automated self-play that stress-tests balance and fairness.
- Designed a data-driven, patchable rules engine in pure TypeScript (asymmetric pieces, multiple win conditions, repetition-based anti-stall), verified by 1,600+ automated tests; built end-to-end via an AI-driven multi-agent development workflow with gated CI.
- Shipped a Node.js + WebSocket server with PostgreSQL Glicko-2 ranked matchmaking and captcha-protected auth, self-hosted on Fly.io; CI/CD runs a test gate, image smoke test, and health check with auto-rollback.

### Insider Trading Detection on Polymarket
Python, PySpark, Spark SQL, Spark MLlib, BigQuery, GraphQL

- Built a 4-stage PySpark pipeline ingesting 226K+ on-chain wallet fills across 6 geopolitical markets ($240M+ volume); detected price spikes with Spark SQL rolling-window functions.
- Constructed a domain-specific knowledge base over the GDELT news corpus in BigQuery and trained a Spark MLlib random-forest + k-means model to flag suspected insider wallets.

### Generalized Focused Web Crawler
Python, LLM agent architecture, Anthropic / OpenAI SDKs, BeautifulSoup

- Engineered an LLM-backed agent architecture with pluggable DecisionPolicy and CrawlPolicy abstractions, accepting natural-language crawl goals to drive semantic relevance decisions.
- Implemented a keyword baseline (density-plus-coverage scoring, 3× title weighting, min-heap frontier with dedup and depth penalties) for A/B comparison against the LLM policy.

## Education

### Master of Science, Computer Science
New York University Tandon School of Engineering · New York, New York · Aug 2024 – May 2026 · GPA 3.5

### Bachelor of Science, Computer Science
New York University Tandon School of Engineering · New York, New York · Aug 2017 – May 2021 · GPA 3.3

## Skills

- **Languages:** Java, Python, JavaScript, TypeScript, React, SQL
- **Backend:** REST APIs, microservices, distributed systems
- **Cloud / Infra:** AWS (Lambda, API Gateway, DynamoDB, S3, SQS, Step Functions, CloudWatch, Cognito, IAM); IaC with AWS SAM and CloudFormation
- **Data / ML:** PySpark, Spark MLlib, Spark SQL, BigQuery
- **AI / LLM:** Anthropic SDK, OpenAI SDK, agent architectures
- **Tools:** Node.js, Docker, Git, CI/CD

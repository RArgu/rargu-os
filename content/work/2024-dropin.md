---
title: Software Engineer
company: DropIn
start: 2024-03
end: 2024-08
location: Monterrey, Mexico
---

# Software Engineer, DropIn

DropIn gave e-commerce businesses warehousing and delivery they couldn't get on their own, and also built chatbots for those businesses' websites. The company was about ten people, not counting drivers. I worked on the delivery side and built the route optimizer by myself.

Drivers and ops loved it. It was a big improvement over how they planned routes before, and running it on AWS made it much nicer to work with.

- Architected a cloud-native route optimization microservice on AWS Lambda, Step Functions, and S3 processing 200+ daily delivery stops; reduced average route time ~25% vs. manual planning.
- Designed a k-means classification pipeline partitioning city regions into delivery zones with configurable constraints (mountains, highways), enforcing cluster completion before cross-zone hops.
- Implemented batched optimization with ~10-stop look-ahead heuristics to respect Google Maps API limits; instrumented CloudWatch metrics, reducing external API costs by 40%.
- Deployed an AWS production system (Lambda, SQS, S3, CloudWatch, IAM) with stream ingestion and cross-region S3 replication for disaster recovery, sustaining 99.5% uptime.

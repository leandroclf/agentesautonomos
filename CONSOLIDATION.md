# Consolidation disposition

Status: **REFERENCE / archive candidate**.

This repository represents an older distributed BDI/MARL agent architecture with SQS, Prometheus/Grafana, recovery and lifecycle components. It is not the canonical Engineering Harness.

## Disposition

- planning/execution/validation orchestration -> ai-engineering-team
- generic skills/policies -> ai-kit
- SQS distributed agent topology -> do not migrate without a measured scale/reliability requirement
- BDI/MARL concepts -> research/reference only; no current evidence justifies production complexity
- observability patterns -> compare with the existing OpenTelemetry-first direction before selectively migrating
- resilience patterns -> migrate only as concrete requirements arise in active products

Claims in legacy documentation about throughput, uptime, cost reduction or completion percentage are not treated as current production evidence unless reproduced by benchmark/CI.

No new runtime features should be added here. Archive only after dependency checks and explicit disposition of any remaining unique code.

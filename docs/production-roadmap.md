# Production roadmap (~150k DAU scale notes)

This scaffold is a single-node demo. Production personal / office agents need
tenancy, shared storage, routing, and human approvals. The numbers below are
**order-of-magnitude planning notes**, not SLOs or load-test results.

## Target shape

Assume ~**150k daily active users**, each with a small number of long-lived
conversations and occasional tool-heavy turns:

| Rough signal | Planning hint |
|--------------|---------------|
| Peak concurrent loops | Low thousands of active workers / shards, not 150k processes |
| Storage | Shared Postgres (or equivalent) with **one writer owner per shard** |
| Routing | Lease-based sticky routing: conversation → shard → worker |
| Env | Remote sandboxes; loop never shares tenant disk |
| Approvals | Hook + memo for dangerous tools (deploy, send, pay) |

Pi Durable already assumes **one process owns a storage at a time**. Scale by
**sharding conversations**, not by multi-writer SQLite.

## Phase 0 — this repo (done as demo)

- [x] Loop vs env boundary in code
- [x] Local SQLite + `NodeExecutionEnv` cwd sandboxes
- [x] Sticky `requestId`, crash resume, worker reopen
- [x] Docs + OSS layout

## Phase 1 — HTTP API + remote env stub

- Thin HTTP / WebSocket surface over one Harness process:
  - create conversation, submit, wait / stream (`watch` ops), configure
- `RemoteExecutionEnv` stub implementing the same interface as
  `NodeExecutionEnv` (exec / read / write over a handle)
- Health + graceful `close` for rolling deploys

## Phase 2 — multi-tenant + Postgres storage

- Tenant id on conversations / documents
- Implement or adapt a **Postgres `Storage`** backend (Pi Durable storage
  interface is small; SQLite/JSONL are references)
- Migrate demo docs (`app.sandbox`) to include `tenantId` + env handle
- Per-tenant model / tool allow-lists via extensions

## Phase 3 — lease routing

- Lease table: `shard_id → owner_worker, expires_at`
- Router: resolve conversation → shard → worker with sticky affinity
- On worker death: lease expiry → another worker opens shard storage →
  `resume()`
- Client retries with same `requestId` remain exactly-once

## Phase 4 — approvals & multiplayer

- `beforeTool` hooks with `api.memo` for Slack / UI approvals (see upstream
  Pi Durable approval example)
- `viewState` / `watch` for multiple clients on one conversation
- `whenBusy: "steer"` for mid-flight human course correction
- Audit log of approval decisions as durable entries or documents

## Phase 5 — scale toward ~150k DAU

Planning checklist (measure before optimizing):

1. **Shard by tenant or conversation range** so each worker’s working set fits
   RAM (Durable keeps active transcripts + live tasks hot).
2. **Separate env fleet** from loop fleet; autoscale sandboxes on tool QPS, not
   on chat message rate.
3. **Compaction** settings (`reserveTokens` / `backgroundTokens`) so long
   personal histories do not pin huge contexts.
4. **Idempotent side effects** for tools that must survive replay (`replay:
   "safe"`) vs tools that must never double-fire (no replay + approval).
5. **Observability**: per-conversation usage (`harness.usage`), lease steal
   rate, resume lag, sandbox provision latency.
6. **Backpressure**: queue depth per shard; reject or shed when leases cannot
   be acquired quickly.
7. **Data residency / secrets**: API keys only in worker env; never in
   transcripts or sandbox seeds.

### Capacity sketch (illustrative)

If 150k DAU → ~5–15k concurrent online, and 5–20% have an active generation or
tool task:

- Active tasks might sit in the **hundreds to low thousands**.
- Prefer **many small shards** (fast failover) over one giant DB writer.
- Env pool sized to peak concurrent bash/file tools, which is usually **much
  smaller** than concurrent chat watchers.

Revisit with real `watch` fanout and tool duration histograms before buying
hardware stories.

## Non-goals (for now)

- Replacing Pi coding agent TUI
- Multi-writer SQLite
- Guaranteeing model-provider SLAs
- Shipping a hosted SaaS from this repository alone

## References

- Upstream: [Pi Durable](https://earendil.com/posts/pi-durable/)
- This repo: [architecture.md](architecture.md),
  [handoff-csunleaf-axonfire.md](handoff-csunleaf-axonfire.md)

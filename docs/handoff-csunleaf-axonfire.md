# Handoff: Slack agent `csunleaf-axonfire`

**Audience:** Slack coding agent **csunleaf-axonfire** (and humans pairing with it).  
**Repo:** `cFireworks/pi-durable-personal-agent`  
**Status:** Scaffold + local isolation demo landed. Implementation backlog below.

Speak as the repo owner’s agent when acting in Caesar Wong’s accounts. Keep
secrets out of chat and git.

---

## Already done (do not redo)

- [x] OSS layout: LICENSE (Apache-2.0), README (EN + short ZH), `.gitignore`,
      `.env.example`
- [x] `package.json` with `@earendil-works/pi-durable` `^1.0.0`, `engines.node
      >=22.19.0`
- [x] `demos/isolation.mjs` — loop SQLite worker + two cwd sandboxes, sticky
      submit, crash resume, worker-2 failover (faux + optional chat)
- [x] Docs: architecture, production roadmap (~150k DAU notes), CONTRIBUTING
- [x] This handoff + root `AGENTS.md`

Verify locally: `npm install && npm run demo` → exit 0, prints `DEMO OK`.

---

## Implementation backlog (priority order)

### 1. Lease router

**Goal:** Sticky routing so one worker owns a storage shard at a time; on death,
another worker acquires the lease and `resume()`s.

**Suggested slice:**

- In-memory or Postgres lease table: `shard_id`, `owner`, `expires_at`,
  `heartbeat_at`
- `acquire / renew / release` API used by loop workers
- Unit test: owner A dies → B acquires → same conversation id continues
- Wire demo mode that uses two worker processes + shared lease store (not only
  in-process `close()`)

**Acceptance:** Documented protocol in `docs/architecture.md`; faux test proves
no dual-writers on one shard.

### 2. HTTP API

**Goal:** Thin surface over Harness for external clients (Slack bridge, web UI).

**Suggested endpoints (draft):**

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/v1/conversations` | create + optional sandbox doc |
| `POST` | `/v1/conversations/:id/submit` | body includes `requestId` |
| `GET`  | `/v1/conversations/:id` | snapshot / view |
| `GET`  | `/v1/conversations/:id/watch` | SSE or WebSocket of `watch()` ops |
| `POST` | `/v1/conversations/:id/configure` | model / tools |
| `GET`  | `/healthz` | process up; optional storage ping |

**Acceptance:** curl script in `demos/` or `scripts/` creates a conversation,
submits faux turn, sees marker file; sticky retry returns same submission id.

### 3. Remote env stub

**Goal:** Prove loop/env split beyond local cwd.

**Suggested slice:**

- `RemoteExecutionEnv` stub with same methods tools need (read/write/bash or
  whatever `NodeExecutionEnv` exposes — match upstream types)
- Transport can be in-process RPC first (loop → “remote” child), then HTTP
- Sandbox document stores `{ kind: "remote", handle }` instead of only `path`
- Isolation demo flag: `node demos/isolation.mjs faux --remote-stub`

**Acceptance:** Markers still isolate; killing loop does not kill remote stub
filesystem; README documents the swap point.

### 4. CI

**Goal:** GitHub Actions (or equivalent) on PR:

- Node 22.19+
- `npm ci`
- `npm run demo` (faux only — no secrets)
- Optional lint later

**Acceptance:** Green check on PR without repository secrets.

---

## Out of scope for first pass (track, don’t block)

- Full Postgres `Storage` backend
- Real Firecracker / gVisor sandbox fleet
- Hosted multi-tenant billing
- Replacing Pi coding agent

See [production-roadmap.md](production-roadmap.md).

---

## Working agreements

1. Prefer extending `demos/isolation.mjs` patterns over greenfield rewrites.
2. Every new durable side effect: decide `replay: "safe"` vs approval hook.
3. When stuck on pi-durable API, read installed package types under
   `node_modules/@earendil-works/pi-durable` and upstream post
   https://earendil.com/posts/pi-durable/
4. Report blockers in Slack with: command run, exit code, **redacted** logs.
5. Do not force-push `main` after the public repo exists without human OK.

---

## First message checklist for csunleaf-axonfire

When you pick up this handoff:

1. Clone / pull `cFireworks/pi-durable-personal-agent` (once the GitHub repo
   exists).
2. Run `npm install && npm run demo`; paste `DEMO OK` summary (no secrets).
3. Open a PR for **lease router spike** or **HTTP API spike** (pick one).
4. Link this file in the PR body.

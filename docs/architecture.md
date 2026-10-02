# Architecture: loop microservice + ExecutionEnv sandbox

## Problem

An always-on personal agent needs two different lifetimes:

1. **Conversation / task lifetime** — transcript, checkpoints, sticky submits,
   forks, steers, documents. Must survive process death.
2. **Tool execution lifetime** — files, shells, network side effects. Must be
   isolated per conversation (or per tenant) and may live on another machine.

If you collapse both into one process cwd, a loop crash and a sandbox wipe look
the same, and multi-tenant routing becomes accidental shared disk.

## Loop microservice

The **loop** owns:

- `Harness.open(storage, { models, registry, env, settings })`
- Durable storage (local demo: SQLite via `openNodeSqliteStorage`)
- Conversation create / reattach / fork
- Task checkpoints and `harness.resume()` after reopen
- Exactly-once client submits via `requestId`
- Extension registry (`CodingTools`, custom tools, approval hooks)

One process **owns** a given storage at a time. Other clients attach to that
process (HTTP / websocket in production — see roadmap). Sticky session means:
route messages for a conversation to the worker that currently holds the lease
on that conversation’s storage shard.

```text
Client ──submit(requestId)──► Loop worker ──commit──► Storage
                                    │
                                    └── env() ──► ExecutionEnv (local or remote)
```

### Sticky `requestId`

Clients retry after network blips. With the same `requestId`, Pi Durable returns
the original submission instead of asking the model twice. The isolation demo
asserts `aliceAgain.id === aliceSub.id`.

### Crash resume

Every model call and tool call is a task with a checkpoint. After
`harness.close()` (or hard kill), a new process:

1. Opens the same storage path / shard.
2. Calls `harness.resume()`.
3. Reattaches conversations by id.
4. Continues unfinished work; safe-to-replay tools rerun; unsafe ones report
   interruption to the model.

Sandbox **files** are not inside SQLite. They live in the ExecutionEnv. The demo
proves markers on disk survive loop death.

## ExecutionEnv sandbox

Pi Durable’s `env` callback builds an `ExecutionEnv` per tool call from
conversation state. This repo stores a `Sandbox` document (`kind: "app.sandbox"`)
with a `path` (or future remote handle):

```js
env: async ({ conversationId, read }, envContext) => {
  const sandbox = await read.snapshot(Sandbox, conversationId, envContext);
  if (!sandbox?.path) return undefined;
  // Local today. Production: RemoteExecutionEnv({ handle: sandbox.path })
  return new NodeExecutionEnv({ cwd: sandbox.path });
}
```

### Isolation rules

| Concern | Loop | Env |
|---------|------|-----|
| Transcript / tasks / docs | Yes | No |
| Agent cwd files | No | Yes |
| Process crash | Resume from storage | Files persist independently |
| Cross-conversation write | N/A | Separate cwd / handle |
| Remote host | Optional | Same interface |

Two conversations in the demo get `run/sandboxes/sandbox-a` and `sandbox-b`.
Markers `ALICE-OK` / `BOB-OK` must not cross-contaminate.

### Failover

Worker-2 opens the **same** SQLite, resumes, reattaches conversation ids, and
continues. Sandbox cwd paths in the `Sandbox` document still point at the same
directories. Failover of the loop does **not** require copying sandbox trees if
storage and env volumes remain reachable.

## What this repo intentionally does not do yet

- Lease / shard router across many loop workers
- HTTP API in front of Harness
- Real remote ExecutionEnv (SSH / Firecracker / container)
- Postgres storage backend
- Multi-tenant auth / quotas

Those are spelled out in [production-roadmap.md](production-roadmap.md) and the
Slack handoff [handoff-csunleaf-axonfire.md](handoff-csunleaf-axonfire.md).

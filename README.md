# pi-durable-personal-agent

Open-source scaffold for an **always-on personal agent** built on
[`@earendil-works/pi-durable`](https://www.npmjs.com/package/@earendil-works/pi-durable).

This repo is a **landing / learning surface**, not a full multi-tenant product.
It shows the core contract: a **loop microservice** (Harness + durable storage)
separated from **ExecutionEnv sandboxes** (where tools actually run), with
sticky `requestId` submits, crash resume, and worker failover.

> **Production docs:** see [docs/architecture.md](docs/architecture.md) and
> [docs/production-roadmap.md](docs/production-roadmap.md). Upstream Pi Durable
> intro: [earendil.com/posts/pi-durable](https://earendil.com/posts/pi-durable/).

---

## Why Pi Durable?

Pi the coding agent is excellent for one person in a terminal. If the process
dies, a human looks and tells it to continue.

A personal / office agent is different:

- It must survive redeploys, OOM kills, and laptop sleep.
- Many surfaces (Slack, web, CLI) may attach to the same conversation.
- Tool work should live in a sandbox (or remote VM), not inside the loop
  process’s own working directory.
- Application state (todos, sandbox handles, approvals) must commit with the
  transcript, not drift beside it.

**Pi Durable** is that application harness: storage + concurrent conversations +
tasks with checkpoints + pluggable `ExecutionEnv`. This scaffold keeps the
**loop** and the **env** on opposite sides of a clear boundary so production can
swap `NodeExecutionEnv` for a remote sandbox without rewriting the agent loop.

---

## Quickstart demo

Requires **Node ≥ 22.19** (Pi Durable `engines`).

```bash
git clone https://github.com/cFireworks/pi-durable-personal-agent.git
cd pi-durable-personal-agent
npm install
npm run demo
```

`npm run demo` runs the **faux** stack (no API key). It will:

1. Open a loop worker over SQLite under `run/`.
2. Create two conversations with separate cwd sandboxes (`sandbox-a` / `sandbox-b`).
3. Prove cwd isolation (markers stay in the right sandbox).
4. Crash the loop mid-flight; reopen on a second worker; resume + failover.

Optional real-model path (never commit secrets):

```bash
cp .env.example .env
# set PI_DURABLE_CHAT_API_KEY
npm run demo:chat
```

---

## Architecture (loop vs env)

```
┌─────────────────────────────────────────┐
│  Loop microservice                      │
│  Harness + Storage (SQLite / Postgres*) │
│  sticky requestId · resume · watch      │
└──────────────────┬──────────────────────┘
                   │ env({ conversation }) → ExecutionEnv
     ┌─────────────┴─────────────┐
     ▼                           ▼
 sandbox-a cwd              sandbox-b cwd
 (or RemoteExecutionEnv)    (or another host)
```

\*Postgres and lease routing are roadmap items — see
[docs/production-roadmap.md](docs/production-roadmap.md).

Details: [docs/architecture.md](docs/architecture.md).

---

## Repo layout

| Path | Role |
|------|------|
| `demos/isolation.mjs` | Minimal loop + sandbox isolation demo |
| `demos/lib-providers.mjs` | faux / chat model helpers |
| `docs/architecture.md` | Loop microservice + ExecutionEnv design |
| `docs/production-roadmap.md` | Multi-tenant path toward ~150k DAU |
| `docs/CONTRIBUTING.md` | How to contribute |
| `docs/handoff-csunleaf-axonfire.md` | Slack agent implementation backlog |
| `AGENTS.md` | Short agent-facing map + pointer to handoff |

---

## License

[Apache-2.0](LICENSE)

---

## 简短中文

这是一个基于 **Pi Durable** 的开源脚手架，演示「个人常驻 Agent」的核心合同：

- **Loop 微服务**：Harness + 耐久存储，负责会话、检查点、`requestId` 幂等、崩溃续跑。
- **ExecutionEnv 沙箱**：工具在独立 cwd（或远程环境）执行，与 loop 进程文件系统解耦。
- 本地一键：`npm install && npm run demo`（faux，无需 API Key）。
- 生产向路线（多租户、Postgres、租约路由、审批、约 15 万 DAU 量级提示）见 `docs/`。

上游介绍：[Pi Durable 官方博文](https://earendil.com/posts/pi-durable/)。

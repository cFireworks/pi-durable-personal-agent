# AGENTS.md

Map for coding / Slack agents working in this repository.

## What this repo is

OSS scaffold for **cFireworks/pi-durable-personal-agent**: always-on personal
agent on `@earendil-works/pi-durable` with a clear **loop microservice vs
ExecutionEnv sandbox** split.

## Quick commands

```bash
npm install
npm run demo          # faux, no API key
npm run demo:chat     # needs PI_DURABLE_CHAT_API_KEY
```

Node **≥ 22.19** required.

## Where to look

| Need | Path |
|------|------|
| Isolation demo | `demos/isolation.mjs` |
| Model helpers | `demos/lib-providers.mjs` |
| Architecture | `docs/architecture.md` |
| Scale / multi-tenant | `docs/production-roadmap.md` |
| Human contributors | `docs/CONTRIBUTING.md` |
| **Slack agent handoff** | `docs/handoff-csunleaf-axonfire.md` |

## Do / don't

- **Do** keep sandbox files under `run/sandboxes/` (gitignored).
- **Do** use sticky `requestId` on submits in new demos.
- **Do** extend via Pi Durable extensions / docs, not ad-hoc global state.
- **Don't** commit `.env` or print secrets.
- **Don't** clone GitHub in CI scripts unless the task explicitly requires it
  and credentials are provided safely.
- **Don't** collapse loop storage and tool cwd into one directory.

## Primary implementation owner (Slack)

**csunleaf-axonfire** — full backlog and acceptance notes live in
[docs/handoff-csunleaf-axonfire.md](docs/handoff-csunleaf-axonfire.md).

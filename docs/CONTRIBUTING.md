# Contributing

Thanks for helping harden an always-on personal agent on Pi Durable.

## Ground rules

1. **Node ≥ 22.19** — match `engines` in `package.json`.
2. **No secrets in git** — use `.env` (gitignored); keep `.env.example` empty of
   real values. Never log API keys.
3. **Keep the loop / env boundary** — loop code owns Harness + storage; tool
   side effects go through `ExecutionEnv`. Do not write agent artifacts into the
   repo root or the loop process cwd by default.
4. **Faux first** — new demos must pass `npm run demo` (faux) without network.
5. **License** — contributions are under Apache-2.0 (see [LICENSE](../LICENSE)).

## Setup

```bash
npm install
npm run demo
```

Optional chat stack:

```bash
cp .env.example .env
# export PI_DURABLE_CHAT_API_KEY=...
npm run demo:chat
```

## Pull requests

- Prefer small PRs: one demo, one doc, or one feature slice.
- Update docs when you change the public boundary (storage, env, HTTP).
- Note any upstream `@earendil-works/pi-durable` version bumps in the PR body.
- Link issues / Linear tickets when they exist.

## Code style

- ESM (`"type": "module"`).
- Prefer clear phase comments in demos over clever abstractions.
- Fail demos with non-zero exit and an explicit `FAIL:` / `DEMO ASSERTIONS
  FAILED` message.

## Security

- Do not add exploit PoCs, credential scrapers, or instructions for unauthorized
  access.
- Dangerous tools (deploy, mail send, payment) need approval hooks before they
  land as defaults.

## Questions

Open a GitHub issue, or see [AGENTS.md](../AGENTS.md) and
[handoff-csunleaf-axonfire.md](handoff-csunleaf-axonfire.md) for the current
implementation backlog.

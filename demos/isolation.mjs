/**
 * Isolation demo for pi-durable-personal-agent
 * — Loop microservice (Harness + SQLite) isolated from ExecutionEnv sandboxes.
 *
 * Shows:
 * 1. Loop worker owns SQLite storage (session / sticky submit)
 * 2. Two NodeExecutionEnv sandboxes (sandbox-a / sandbox-b) outside the loop
 *    conceptual boundary; remote ExecutionEnv would use the same interface
 * 3. Crash the loop process mid-tool; reopen + resume; sandbox files persist
 * 4. Second worker failover: reopen same storage; cwd sandboxes unchanged
 *
 * Usage (Node >= 22.19):
 *   npm run demo          # faux — no API key
 *   npm run demo:chat     # PI_DURABLE_CHAT_API_KEY + Token Plan qwen3.8-flash
 *   node demos/isolation.mjs faux|chat
 *
 * Secrets are never printed.
 */
import { mkdir, writeFile, readFile, access, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry, defineDoc, defineExtension, Harness, section, ToolResultEntry,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
  buildModels, fauxAssistantMessage, fauxToolCall,
} from "./lib-providers.mjs";

const context = BACKGROUND_CONTEXT;
const which = process.argv[2] || (process.env.PI_DURABLE_CHAT_API_KEY ? "chat" : "faux");
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const runDir = join(rootDir, "run");
const dbPath = join(runDir, "loop.sqlite");
const sandboxA = join(runDir, "sandboxes", "sandbox-a");
const sandboxB = join(runDir, "sandboxes", "sandbox-b");

const Sandbox = defineDoc({
  kind: "app.sandbox",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({}),
});

const Coding = defineExtension({
  name: "coding",
  sections: [
    section("preamble", () =>
      "You are a coding agent. Always use bash/read/write tools. " +
      "Stay inside your cwd. After writing the required marker files, reply DONE.",
      { tag: false }),
    section("cwd", (input) => input.env?.cwd),
  ],
});

const exists = (p) => access(p).then(() => true).catch(() => false);
const listFiles = async (dir) => {
  try { return (await readdir(dir)).sort(); } catch { return []; }
};
const readText = async (path) => {
  try { return (await readFile(path, "utf8")).trim(); } catch { return null; }
};

/**
 * Loop worker: owns SQLite. ExecutionEnv is built from Sandbox doc path.
 * Loop process ≠ sandbox filesystem. Remote env implements same ExecutionEnv iface.
 */
async function openLoopWorker(workerLabel, models) {
  const registry = createRegistry();
  registry.install(CodingTools);
  registry.install(Coding);
  const harness = await Harness.open(
    await openNodeSqliteStorage(dbPath),
    {
      models,
      registry,
      settings: { toolExecution: "sequential" },
      env: async ({ conversationId, read }, envContext) => {
        const sandbox = await read.snapshot(Sandbox, conversationId, envContext);
        if (!sandbox?.path) return undefined;
        // Local cwd today. Production: return RemoteExecutionEnv({ handle: sandbox.path }).
        return new NodeExecutionEnv({ cwd: sandbox.path });
      },
    },
    context,
  );
  console.log(`[${workerLabel}] opened loop storage:`, dbPath);
  return harness;
}

async function createSandboxedConversation(harness, modelRef, label, sandboxPath) {
  await mkdir(sandboxPath, { recursive: true });
  await writeFile(join(sandboxPath, "SEED.txt"), `sandbox=${label}\n`, "utf8");
  const conversation = await harness.createConversation(
    {
      ownership: { kind: "ownerless" },
      agent: { model: modelRef, cwd: sandboxPath },
      init: async (tx, id) => {
        (await tx.doc(Sandbox, id)).path = sandboxPath;
      },
    },
    context,
  );
  console.log(`conversation ${label}: id=${conversation.id} sandbox=${sandboxPath}`);
  return conversation;
}

async function waitSettled(submission, label, timeoutMs = 120000) {
  const settled = await Promise.race([
    submission.wait(context),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout waiting ${label}`)), timeoutMs),
    ),
  ]);
  console.log(`settled ${label}:`, settled.status, settled.type || "", settled.reason || "");
  return settled;
}

async function countTools(conversation) {
  const page = await conversation.entries({}, 50, undefined, context);
  return page.items.filter((e) => ToolResultEntry.is(e)).length;
}


await rm(runDir, { recursive: true, force: true });
await mkdir(join(runDir, "sandboxes"), { recursive: true });

console.log("=== Pi Durable isolation demo ===");
console.log("stack:", which);
console.log("NOTE: API keys are read from env and never printed.");
console.log("");
console.log("Architecture:");
console.log("  Loop worker  → Harness + SQLite (session sticky / resume)");
console.log("  ExecutionEnv → sandbox-a / sandbox-b (cwd isolation; remote = same iface)");
console.log("");

let models;
let modelRef;
let fauxHandle = null;

if (which === "faux") {
  const built = buildModels("faux");
  fauxHandle = built.faux;
  const catalog = await fauxHandle.provider.getModels();
  modelRef = { provider: "faux", modelId: catalog[0].id };
  fauxHandle.setResponses([
    fauxAssistantMessage(
      fauxToolCall("write", { path: "agent-mark.txt", content: "ALICE-OK" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("DONE"),
    fauxAssistantMessage(
      fauxToolCall("write", { path: "agent-mark.txt", content: "BOB-OK" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("DONE"),
    // admitted before crash; may complete on worker-2
    fauxAssistantMessage(
      fauxToolCall("write", { path: "crash-resume.txt", content: "RESUMED" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("DONE"),
    fauxAssistantMessage(
      fauxToolCall("write", { path: "failover.txt", content: "WORKER2" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("DONE"),
  ]);
  models = built.models;
} else {
  const built = buildModels("chat");
  models = built.models;
  modelRef = { provider: built.provider, modelId: built.modelId };
}

console.log("modelRef:", modelRef);

// ========== PHASE 1 ==========
console.log("--- PHASE 1: Worker-1 owns loop + assigns sandboxes ---");
const worker1 = await openLoopWorker("worker-1", models);
worker1.resume();

const alice = await createSandboxedConversation(worker1, modelRef, "A", sandboxA);
const bob = await createSandboxedConversation(worker1, modelRef, "B", sandboxB);
const aliceId = alice.id;
const bobId = bob.id;

const aliceReq = {
  type: "input",
  content:
    which === "faux"
      ? "Leave agent-mark.txt in your cwd."
      : "1) bash ls  2) read SEED.txt  3) write agent-mark.txt with exactly ALICE-OK  4) reply DONE. Use tools.",
  requestId: "sticky-alice-1",
};
const bobReq = {
  type: "input",
  content:
    which === "faux"
      ? "Leave agent-mark.txt in your cwd."
      : "1) bash ls  2) read SEED.txt  3) write agent-mark.txt with exactly BOB-OK  4) reply DONE. Use tools.",
  requestId: "sticky-bob-1",
};

console.log("sticky submit alice requestId=sticky-alice-1");
const aliceSub = await alice.submit(aliceReq, context);
await waitSettled(aliceSub, "alice-1");

console.log("sticky submit bob requestId=sticky-bob-1");
const bobSub = await bob.submit(bobReq, context);
await waitSettled(bobSub, "bob-1");

const aliceAgain = await alice.submit(aliceReq, context);
console.log("alice requestId sticky (same submission id):", aliceAgain.id === aliceSub.id);

const markA = await readText(join(sandboxA, "agent-mark.txt"));
const markB = await readText(join(sandboxB, "agent-mark.txt"));
console.log("sandbox-a agent-mark:", markA);
console.log("sandbox-b agent-mark:", markB);
console.log("files A:", await listFiles(sandboxA));
console.log("files B:", await listFiles(sandboxB));
if (markA !== "ALICE-OK" || markB !== "BOB-OK") {
  console.error("FAIL: sandbox markers wrong — isolation or tool path broken");
  process.exit(1);
}
if ((await readText(join(sandboxA, "agent-mark.txt"))) === "BOB-OK") {
  console.error("FAIL: cross-write into sandbox-a");
  process.exit(1);
}

// ========== PHASE 2 ==========
console.log("");
console.log("--- PHASE 2: Crash loop mid-tool; sandbox files must persist ---");
const crashReq = {
  type: "input",
  content:
    which === "faux"
      ? "Write crash-resume.txt with RESUMED."
      : "Write crash-resume.txt with exactly RESUMED using the write tool, then reply DONE.",
  requestId: "sticky-alice-crash",
};

const crashSubPromise = alice.submit(crashReq, context);
let crashed = false;

if (which === "faux") {
  // Admit sticky submission, then kill loop ASAP so resume happens on worker-2.
  await new Promise((r) => setTimeout(r, 80));
  console.log("[worker-1] close() simulating OOM/redeploy (before/during tool)");
  await worker1.close(context);
  crashed = true;
} else {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const tools = await countTools(alice);
      const page = await alice.entries({}, 30, undefined, context);
      const kinds = [...page.items].reverse().map((e) => e.kind);
      const hasMarker = await exists(join(sandboxA, "crash-resume.txt"));
      if (tools >= 1 && !hasMarker) {
        console.log("[worker-1] mid-flight tools=", tools, "kinds=", kinds.join(","), "-> close()");
        await worker1.close(context);
        crashed = true;
        break;
      }
      if (hasMarker) {
        console.log("[worker-1] finished before crash window; closing to demo reopen");
        await worker1.close(context);
        crashed = true;
        break;
      }
    } catch (e) {
      console.log("[worker-1] poll/close:", String(e.message || e).slice(0, 120));
      crashed = true;
      break;
    }
  }
  if (!crashed) {
    console.log("[worker-1] timeout waiting mid-tool; closing anyway");
    try { await worker1.close(context); } catch { /* ignore */ }
    crashed = true;
  }
}
crashSubPromise.then(() => {}).catch(() => {});

const persistSeed = await readText(join(sandboxA, "SEED.txt"));
const persistMark = await readText(join(sandboxA, "agent-mark.txt"));
console.log("after loop death, sandbox-a still on disk: SEED=", persistSeed, "agent-mark=", persistMark);
if (!persistSeed || persistMark !== "ALICE-OK") {
  console.error("FAIL: sandbox files did not persist across loop crash");
  process.exit(1);
}

// ========== PHASE 3 ==========
console.log("");
console.log("--- PHASE 3: Worker-2 failover (same SQLite, same sandbox cwds) ---");

const alreadyResumed = await exists(join(sandboxA, "crash-resume.txt"));
console.log("sandbox-a crash-resume already present before worker-2:", alreadyResumed);

let models2;
let faux2 = null;
if (which === "faux") {
  // New process = new Models + new faux queue. Queue only the replies still needed.
  const built2 = buildModels("faux");
  faux2 = built2.faux;
  const catalog2 = await faux2.provider.getModels();
  if (catalog2[0].id !== modelRef.modelId) {
    console.log("note: faux model id this process:", catalog2[0].id, "stored:", modelRef.modelId);
  }
  const queue = [];
  if (!alreadyResumed) {
    queue.push(
      fauxAssistantMessage(
        fauxToolCall("write", { path: "crash-resume.txt", content: "RESUMED" }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("DONE"),
    );
  }
  queue.push(
    fauxAssistantMessage(
      fauxToolCall("write", { path: "failover.txt", content: "WORKER2" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("DONE"),
  );
  // Extra pair if steer follow-up is needed
  queue.push(
    fauxAssistantMessage(
      fauxToolCall("write", { path: "crash-resume.txt", content: "RESUMED" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("DONE"),
  );
  faux2.setResponses(queue);
  models2 = built2.models;
} else {
  models2 = buildModels("chat").models;
}

const worker2 = await openLoopWorker("worker-2", models2);
worker2.resume();

const alice2 = await worker2.conversation(aliceId, context);
const bob2 = await worker2.conversation(bobId, context);
console.log("reattached alice=", alice2?.id, "bob=", bob2?.id);

// If faux model ids drifted across processes, pin agent model to this process's faux-1.
if (which === "faux") {
  const catalogNow = await models2.getProvider("faux").getModels();
  const liveId = catalogNow[0].id;
  if (liveId !== modelRef.modelId) {
    console.log("reconfigure agent modelId", modelRef.modelId, "->", liveId);
    await alice2.configure({ model: { provider: "faux", modelId: liveId } }, context);
    await bob2.configure({ model: { provider: "faux", modelId: liveId } }, context);
  }
}

const crashAgain = await alice2.submit(crashReq, context);
console.log("crash requestId sticky / continue id:", crashAgain.id);
await waitSettled(crashAgain, "alice-crash-resume", which === "faux" ? 30000 : 90000);

let crashResume = await readText(join(sandboxA, "crash-resume.txt"));
if (crashResume !== "RESUMED") {
  console.log("follow-up to finish crash-resume.txt...");
  const steer = await alice2.submit(
    {
      type: "input",
      content:
        which === "faux"
          ? "Write crash-resume.txt with RESUMED."
          : "Ensure crash-resume.txt contains exactly RESUMED, then reply DONE.",
      whenBusy: "steer",
      requestId: "sticky-alice-steer",
    },
    context,
  );
  // For faux, need another scripted response if first queue exhausted oddly
  if (which === "faux") {
    // already queued responses above; if sticky returned old submission that completed empty, steer is new
  }
  await waitSettled(steer, "alice-steer", which === "faux" ? 30000 : 90000);
  crashResume = await readText(join(sandboxA, "crash-resume.txt"));
}
console.log("sandbox-a crash-resume.txt:", crashResume);

const failReq = {
  type: "input",
  content:
    which === "faux"
      ? "Write failover.txt with WORKER2."
      : "Write failover.txt with exactly WORKER2 using the write tool, then reply DONE.",
  requestId: "sticky-bob-failover",
};
const failSub = await bob2.submit(failReq, context);
await waitSettled(failSub, "bob-failover", which === "faux" ? 30000 : 90000);
const failover = await readText(join(sandboxB, "failover.txt"));
console.log("sandbox-b failover.txt:", failover);

const aFiles = await listFiles(sandboxA);
const bFiles = await listFiles(sandboxB);
const aHasBob = (await readText(join(sandboxA, "agent-mark.txt"))) === "BOB-OK";
const bHasAlice = (await readText(join(sandboxB, "agent-mark.txt"))) === "ALICE-OK";
console.log("files A final:", aFiles);
console.log("files B final:", bFiles);
console.log("cross-contamination:", { aHasBob, bHasAlice });

await worker2.close(context);

const result = {
  stack: which,
  model: modelRef,
  crashed,
  sandbox_a_mark: markA,
  sandbox_b_mark: markB,
  crash_resume: crashResume,
  failover,
  isolation_ok: markA === "ALICE-OK" && markB === "BOB-OK" && !aHasBob && !bHasAlice,
  loop_sqlite: dbPath,
  sandbox_a: sandboxA,
  sandbox_b: sandboxB,
  alice_id: aliceId,
  bob_id: bobId,
};
console.log("");
console.log("RESULT", JSON.stringify(result, null, 2));

if (!result.isolation_ok || crashResume !== "RESUMED" || failover !== "WORKER2") {
  console.error("DEMO ASSERTIONS FAILED");
  process.exit(1);
}
console.log("DEMO OK — loop/env isolation + sticky resume + failover evidenced.");
process.exit(0);

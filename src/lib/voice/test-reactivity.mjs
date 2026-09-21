// @ts-nocheck -- JavaScript fixture dynamically compiles the TypeScript modules.
// Run in a fresh Node process with --conditions=browser. This executes the real
// Svelte client effects without adding a DOM emulation dependency to the app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileModule } from "svelte/compiler";
import ts from "typescript";
import { effect_root, proxy } from "svelte/internal/client";
import { flushSync as flush_sync } from "svelte";

const data = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const mock = (exports) => data(exports);
async function moduleAt(path, imports) {
  let code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  if (path.includes(".svelte."))
    code = compileModule(code, { filename: path, generate: "client" }).js.code;
  code = code.replace(/from (["'])([^"']+)\1/g, (_, quote, name) => {
    const url =
      imports[name] ??
      (name.startsWith("svelte") ? import.meta.resolve(name) : null);
    assert.ok(url, `missing test dependency: ${name}`);
    return `from ${JSON.stringify(url)}`;
  });
  return data(code);
}
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const phrase = (name, text = name) => ({
  id: name,
  name,
  text,
  language: "zhCn",
  activeAssetId: null,
  updatedAtMs: 1,
});
const status = (phrases = []) => ({
  catalog: { phrases, profiles: [], assets: [], schemaVersion: 1 },
  operation: { kind: "idle" },
});
const settings = proxy({
  voice: {
    state: {
      enabled: true,
      volume: 1,
      queuePolicy: "dropLowPriority",
      rules: [],
      selectedProfileId: null,
    },
  },
});
const demands = proxy({ requests: [phrase("a"), phrase("b")] });
const upserts = [];
const snapshots = [];
let catalog = status();
const initial = deferred();
let getStatus = () => initial.promise;
let upsert = async (name, text, language) => {
  upserts.push(name);
  const p = phrase(name, text);
  catalog.catalog.phrases.push(p);
  return { status: "ok", data: p };
};
globalThis.voiceTest = {
  settings,
  demands,
  snapshots,
  commands: {
    voiceGetStatus: (...args) => getStatus(...args),
    voiceUpsertPhrase: (...args) => upsert(...args),
  },
};
const bindings = mock("export const commands = globalThis.voiceTest.commands;");
const settingsModule = mock(`
  export const SETTINGS = globalThis.voiceTest.settings;
  export const ensureBuffVoiceConfigs = x => x;
  export const ensureDbmVoiceConfigs = x => x;
  export const resolveVoicePriority = x => x;
`);
const storeUrl = await moduleAt("../stores/voice-store.svelte.ts", {
  "$lib/api": mock(
    "export const onVoiceGenerationProgress = async () => {}; export const onVoiceModelDownloadProgress = async () => {};",
  ),
  "$lib/bindings": bindings,
  "$lib/i18n/index.svelte": mock("export const t = x => x;"),
  "$lib/settings-store": settingsModule,
});
const store = await import(storeUrl);
const syncUrl = await moduleAt("./sync.svelte.ts", {
  "$lib/bindings": bindings,
  "$lib/settings-store": settingsModule,
  "$lib/runtime-monitor-sync": mock(
    "export async function saveAndApplyVoiceRuntimeSnapshot(s) { globalThis.voiceTest.snapshots.push(s); }",
  ),
  "$lib/skill-monitor-profile.svelte.js": mock(
    "export const activeProfile = () => null; export const updateActiveProfile = () => {};",
  ),
  "$lib/stores/voice-store.svelte": storeUrl,
  "./phrase-resolver": await moduleAt("./phrase-resolver.ts", {}),
  "./snapshot-sync": await moduleAt("./snapshot-sync.ts", {}),
  "./compile": mock(`
    export const collectBindings = v => v;
    export const phraseRequests = b => b;
    export const compileVoiceRules = (b, index) => b.flatMap(r => index[r.name] ? [{ id: r.name, phraseId: index[r.name].phraseId }] : []);
  `),
  "./subject-types": mock(
    "export const mergeVoiceConfigPatch = (a, b) => ({ ...a, ...b });",
  ),
  "./view": mock(
    "export const buildVoiceBindingView = () => globalThis.voiceTest.demands.requests;",
  ),
});
const sync = await import(syncUrl);
async function settle() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    flush_sync();
  }
}

const destroy = effect_root(() => {
  sync.startVoiceRuntimeSync();
});
flush_sync();
await settle();
assert.deepEqual(
  upserts,
  [],
  "automatic upsert waits for catalog initialization",
);
const preview = sync.upsertManagedPhrase("a", "a", "zhCn");
getStatus = async () => ({ status: "ok", data: structuredClone(catalog) });
initial.resolve({ status: "ok", data: status() });
await settle();
assert.equal(await preview, "a");
assert.deepEqual(
  upserts,
  ["a", "b"],
  "real client effect creates each phrase once and shares preview",
);
assert.deepEqual(Object.keys(sync.currentPhraseIndex()), ["a", "b"]);

// A refresh that captured its catalog before a confirmed upsert cannot erase it.
const slow = deferred();
let refreshes = 0;
getStatus = () =>
  ++refreshes === 1
    ? slow.promise
    : Promise.resolve({ status: "ok", data: structuredClone(catalog) });
const stale = store.refreshVoiceStatus(true);
await sync.upsertManagedPhrase("c", "c", "zhCn");
slow.resolve({ status: "ok", data: status([phrase("a"), phrase("b")]) });
await stale;
await settle();
assert.ok(store.VOICE.status.catalog.phrases.some((p) => p.id === "c"));
assert.equal(
  refreshes,
  2,
  "one coalesced reconciliation follows concurrent edits",
);

demands.requests = [];
await settle();
const older = deferred();
const newer = deferred();
let requests = 0;
getStatus = () => (++requests === 1 ? older.promise : newer.promise);
const oldRefresh = store.refreshVoiceStatus(true);
const newRefresh = store.refreshVoiceStatus(true);
newer.resolve({
  status: "ok",
  data: {
    ...status([phrase("newer")]),
    catalog: {
      ...status().catalog,
      phrases: [phrase("newer")],
      profiles: [{ id: "keep" }],
    },
  },
});
settings.voice.state.selectedProfileId = "keep";
await newRefresh;
older.resolve({ status: "ok", data: status() });
await oldRefresh;
assert.equal(
  settings.voice.state.selectedProfileId,
  "keep",
  "stale catalog cannot clear selected profile",
);
assert.ok(store.VOICE.status.catalog.phrases.some((p) => p.id === "newer"));

let rejected = 0;
upsert = async () => {
  rejected++;
  return {
    status: "error",
    error: { code: "validation", message: "invalid phrase", retriable: false },
  };
};
demands.requests = [phrase("bad")];
await settle();
for (let i = 0; i < 5; i++) {
  settings.voice.state.volume = i / 10;
  await settle();
}
assert.equal(rejected, 1, "permanent failures never loop through real effects");
assert.equal(store.VOICE.phraseError, "invalid phrase");
destroy();
await settle();
console.log("Svelte client effects and catalog refresh races passed");

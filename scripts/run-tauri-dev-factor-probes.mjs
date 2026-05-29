#!/usr/bin/env node

import { spawn } from "node:child_process";

const cliArgs = process.argv.slice(2);
const verboseRequested = cliArgs.includes("--verbose");
const rawServiceProbesRequested = cliArgs.includes("--raw-service-probes");
const rawServiceProbesAllRequested = cliArgs.includes("--raw-service-probes-all");

function argValue(name, fallback) {
  const inline = cliArgs.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = cliArgs.indexOf(name);
  if (index >= 0 && index + 1 < cliArgs.length) {
    return cliArgs[index + 1];
  }
  return fallback;
}

const env = {
  ...process.env,
  RESONANCE_ENABLE_CONTAINER_PROBES: "1",
};

if (!/\b--max-old-space-size=/.test(env.NODE_OPTIONS ?? "")) {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, "--max-old-space-size=8192"].filter(Boolean).join(" ");
}

if (verboseRequested) {
  env.RESONANCE_ENABLE_CONTAINER_PROBES_VERBOSE = "1";
} else if (env.RESONANCE_ENABLE_CONTAINER_PROBES_VERBOSE === undefined) {
  env.RESONANCE_ENABLE_CONTAINER_PROBES_VERBOSE = "0";
}

if (rawServiceProbesRequested || rawServiceProbesAllRequested) {
  env.RESONANCE_ENABLE_RAW_SERVICE_PROBES = "1";
  env.RESONANCE_RAW_SERVICE_PROBE_HEX_LIMIT = argValue(
    "--raw-service-probe-hex-limit",
    rawServiceProbesAllRequested ? "65536" : "4096",
  );
}

if (rawServiceProbesAllRequested) {
  env.RESONANCE_RAW_SERVICE_PROBE_ALL_LIMIT = argValue("--raw-service-probe-limit", "500");
  env.RESONANCE_RAW_SERVICE_PROBE_ALL_MAX_PAYLOAD = argValue(
    "--raw-service-probe-max-payload",
    "262144",
  );
  env.RESONANCE_RAW_SERVICE_PROBE_NEAR_DELTA_LIMIT = argValue(
    "--raw-service-probe-near-delta-limit",
    "150",
  );
}

console.log("Starting tauri dev with seasonal factor container probes enabled.");
console.log("Set RESONANCE_ENABLE_CONTAINER_PROBES_VERBOSE=1 before running for larger raw probe payloads.");
console.log(`Container probe verbose mode: ${env.RESONANCE_ENABLE_CONTAINER_PROBES_VERBOSE}`);
console.log(`Raw service probes: ${env.RESONANCE_ENABLE_RAW_SERVICE_PROBES ?? "0"}`);
console.log(
  `Raw service probe payload hex limit: ${env.RESONANCE_RAW_SERVICE_PROBE_HEX_LIMIT ?? "4096"}`,
);
console.log(`Raw recognized packet sample limit: ${env.RESONANCE_RAW_SERVICE_PROBE_ALL_LIMIT ?? "0"}`);
console.log(
  `Raw recognized packet max payload: ${env.RESONANCE_RAW_SERVICE_PROBE_ALL_MAX_PAYLOAD ?? "262144"}`,
);
console.log(
  `Raw recognized SyncNearDeltaInfo sample limit: ${env.RESONANCE_RAW_SERVICE_PROBE_NEAR_DELTA_LIMIT ?? "150"}`,
);
console.log(`Using NODE_OPTIONS=${env.NODE_OPTIONS}`);

const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec || "cmd.exe" : "npm";
const args = isWindows ? ["/d", "/s", "/c", "npm run tauri dev"] : ["run", "tauri", "dev"];
const displayCommand = isWindows ? "npm run tauri dev" : `${command} ${args.join(" ")}`;

console.log(`Launching: ${displayCommand}`);

const child = spawn(command, args, {
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`tauri dev exited from signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Failed to start tauri dev: ${error.message}`);
  process.exit(1);
});

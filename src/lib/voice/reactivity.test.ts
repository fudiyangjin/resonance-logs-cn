import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("runs real Svelte client effects and guards asynchronous catalog refreshes", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--conditions=browser",
      fileURLToPath(new URL("./test-reactivity.mjs", import.meta.url)),
    ],
    { encoding: "utf8", timeout: 15_000 },
  );
  expect(output).toContain(
    "Svelte client effects and catalog refresh races passed",
  );
});

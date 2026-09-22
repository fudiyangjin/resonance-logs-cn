import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateUpdateManifests,
  verifyUpdaterSignature,
} from "./generate-update-manifests.mjs";

const directories = [];
test("accepts the upstream minisign prehashed test vector", () => {
  const publicKey = Buffer.from(
    "untrusted comment: upstream fixture\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n",
  ).toString("base64");
  const signature = Buffer.from(
    "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1556193335\tfile:test\ny/rUw2y8/hOUYjZU71eHp/Wo1KZ40fGy2VJEDl34XMJM+TX48Ss/17u3IvIfbVR1FkZZSNCisQbuQY+bHwhEBg==\n",
  ).toString("base64");
  verifyUpdaterSignature(Buffer.from("test"), signature, publicKey);
});
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function signedFixture(bytes, algorithm = "ED") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const keyId = randomBytes(8);
  const key = Buffer.concat([
    Buffer.from("Ed"),
    keyId,
    publicKey.export({ type: "spki", format: "der" }).subarray(-32),
  ]);
  const message =
    algorithm === "ED"
      ? createHash("blake2b512").update(bytes).digest()
      : bytes;
  const primary = sign(null, message, privateKey);
  const packet = Buffer.concat([Buffer.from(algorithm), keyId, primary]);
  const comment = "timestamp:1234\tfile:fixture";
  const global = sign(
    null,
    Buffer.concat([primary, Buffer.from(comment)]),
    privateKey,
  );
  return {
    publicKey: Buffer.from(
      `untrusted comment: fixture\n${key.toString("base64")}\n`,
    ).toString("base64"),
    signature: Buffer.from(
      `untrusted comment: fixture\n${packet.toString("base64")}\ntrusted comment: ${comment}\n${global.toString("base64")}\n`,
    ).toString("base64"),
  };
}

function releaseFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), "resonance-updater-test-"));
  directories.push(repoRoot);
  const installerPath = join(repoRoot, "app_1.2.3_x64-setup.exe");
  const bytes = Buffer.from("MZ signed installer fixture");
  const fixture = signedFixture(bytes);
  mkdirSync(join(repoRoot, "src-tauri"));
  const config = {
    version: "1.2.3",
    productName: "app",
    plugins: { updater: { pubkey: fixture.publicKey } },
  };
  writeFileSync(
    join(repoRoot, "src-tauri/tauri.conf.json"),
    JSON.stringify(config),
  );
  writeFileSync(
    join(repoRoot, "package.json"),
    JSON.stringify({ version: "1.2.3" }),
  );
  writeFileSync(
    join(repoRoot, "src-tauri/Cargo.toml"),
    '[package]\nname = "app"\nversion = "1.2.3"\n\n[dependencies]\n',
  );
  for (const locale of ["zh-CN", "en-US", "ja-JP"]) {
    const directory = join(repoRoot, `doc/${locale}/changelog`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "v1.2.3.md"), `notes ${locale}`);
  }
  writeFileSync(installerPath, bytes);
  writeFileSync(`${installerPath}.sig`, fixture.signature);
  return {
    repoRoot,
    installerPath,
    outputDir: join(repoRoot, "out"),
    siteUrl: "https://downloads.example.test",
    repository: "example/resonance",
  };
}

test("verifies both Tauri signature algorithms and rejects corruption or a different key", () => {
  const bytes = Buffer.from("installer");
  for (const algorithm of ["Ed", "ED"]) {
    const fixture = signedFixture(bytes, algorithm);
    verifyUpdaterSignature(bytes, fixture.signature, fixture.publicKey);
    assert.throws(() =>
      verifyUpdaterSignature(
        Buffer.from("tampered"),
        fixture.signature,
        fixture.publicKey,
      ),
    );
    assert.throws(() =>
      verifyUpdaterSignature(
        bytes,
        fixture.signature,
        signedFixture(bytes).publicKey,
      ),
    );
    assert.throws(() =>
      verifyUpdaterSignature(
        bytes,
        "REPLACE_AFTER_TAURI_BUILD",
        fixture.publicKey,
      ),
    );
  }
});

test("routes Chinese downloads domestically and English/Japanese downloads to GitHub with the same signature", () => {
  const fixture = releaseFixture();
  const paths = generateUpdateManifests(fixture);
  assert.equal(paths.length, 3);
  const expected = {
    "latest.json": {
      locale: "zh-CN",
      url: "https://downloads.example.test/resonance-logs/releases/1.2.3/app_1.2.3_x64-setup.exe",
    },
    "latest.en-US.json": {
      locale: "en-US",
      url: "https://github.com/example/resonance/releases/download/1.2.3/app_1.2.3_x64-setup.exe",
    },
    "latest.ja-JP.json": {
      locale: "ja-JP",
      url: "https://github.com/example/resonance/releases/download/1.2.3/app_1.2.3_x64-setup.exe",
    },
  };
  const signature = readFileSync(`${fixture.installerPath}.sig`, "utf8").trim();
  for (const path of paths) {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    const { locale, url } = expected[basename(path)];
    assert.equal(manifest.version, "1.2.3");
    assert.equal(manifest.platforms["windows-x86_64"].url, url);
    assert.equal(manifest.platforms["windows-x86_64"].signature, signature);
    assert.equal(manifest.notes, `notes ${locale}`);
  }
});

test("rejects mismatched versions, missing artifacts and placeholder signatures", () => {
  const fixture = releaseFixture();
  writeFileSync(join(fixture.repoRoot, "package.json"), '{"version":"1.2.4"}');
  assert.throws(() => generateUpdateManifests(fixture), /versions differ/);
  writeFileSync(join(fixture.repoRoot, "package.json"), '{"version":"1.2.3"}');
  writeFileSync(`${fixture.installerPath}.sig`, "REPLACE_AFTER_TAURI_BUILD");
  assert.throws(() => generateUpdateManifests(fixture), /placeholder/);
  rmSync(fixture.installerPath);
  assert.throws(() => generateUpdateManifests(fixture), /ENOENT/);
});

test("requires an explicit production origin and supports a separate release host", () => {
  const fixture = releaseFixture();
  assert.throws(
    () => generateUpdateManifests({ ...fixture, siteUrl: "" }),
    /PUBLIC_SITE_URL/,
  );
  assert.throws(
    () =>
      generateUpdateManifests({
        ...fixture,
        siteUrl: "https://example.test/path",
      }),
    /origin/,
  );
  const paths = generateUpdateManifests({
    ...fixture,
    releasesBase: "https://cdn.example.test/downloads/",
  });
  const manifest = JSON.parse(readFileSync(paths[0], "utf8"));
  assert.equal(
    manifest.platforms["windows-x86_64"].url,
    "https://cdn.example.test/downloads/releases/1.2.3/app_1.2.3_x64-setup.exe",
  );
});

import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function decodeBase64(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error(
      "Missing or invalid updater signature/public key (placeholder values are not allowed)",
    );
  }
  return Buffer.from(value, "base64");
}

/** Verify the Tauri/minisign envelope with Node's native Ed25519 implementation. */
export function verifyUpdaterSignature(bytes, signature, publicKey) {
  const keyLines = decodeBase64(publicKey.trim())
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  const lines = decodeBase64(signature.trim())
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  const key = decodeBase64(keyLines[1] ?? "");
  const signed = decodeBase64(lines[1] ?? "");
  const globalSignature = decodeBase64(lines[3] ?? "");
  if (
    key.length !== 42 ||
    key.subarray(0, 2).toString() !== "Ed" ||
    signed.length !== 74 ||
    globalSignature.length !== 64 ||
    !lines[2]?.startsWith("trusted comment: ") ||
    !key.subarray(2, 10).equals(signed.subarray(2, 10))
  ) {
    throw new Error(
      "Updater signature does not match the configured public key",
    );
  }
  const algorithm = signed.subarray(0, 2).toString();
  if (algorithm !== "ED" && algorithm !== "Ed")
    throw new Error("Unsupported updater signature algorithm");
  const publicKeyObject = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      key.subarray(10),
    ]),
    format: "der",
    type: "spki",
  });
  const message =
    algorithm === "ED"
      ? createHash("blake2b512").update(bytes).digest()
      : bytes;
  const trusted = Buffer.concat([
    signed.subarray(10),
    Buffer.from(lines[2].slice(17)),
  ]);
  if (
    !verify(null, message, publicKeyObject, signed.subarray(10)) ||
    !verify(null, trusted, publicKeyObject, globalSignature)
  ) {
    throw new Error("Installer signature verification failed");
  }
}

export function generateUpdateManifests({
  repoRoot = repositoryRoot,
  installerPath,
  outputDir,
  publishedAt = new Date(),
  siteUrl = process.env.PUBLIC_SITE_URL,
  releasesBase = process.env.PUBLIC_RELEASES_BASE || "/resonance-logs/",
  repository = process.env.PUBLIC_RESONANCE_REPOSITORY ||
    "fudiyangjin/resonance-logs-cn",
}) {
  const config = JSON.parse(
    readFileSync(join(repoRoot, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const cargo = readFileSync(join(repoRoot, "src-tauri/Cargo.toml"), "utf8");
  const cargoVersion = cargo
    .split(/^\[package\]\s*$/m)[1]
    ?.split(/^\[/m)[0]
    ?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const version = config.version;
  if (!version || version !== pkg.version || version !== cargoVersion) {
    throw new Error(
      "Release versions differ between tauri.conf.json, Cargo.toml and package.json",
    );
  }
  const expectedName = `${config.productName}_${version}_x64-setup.exe`;
  if (basename(installerPath) !== expectedName)
    throw new Error(`Expected NSIS installer ${expectedName}`);
  const bytes = readFileSync(installerPath);
  if (bytes.length < 2 || bytes.subarray(0, 2).toString() !== "MZ")
    throw new Error("Not a Windows installer");
  const signature = readFileSync(`${installerPath}.sig`, "utf8").trim();
  verifyUpdaterSignature(bytes, signature, config.plugins.updater.pubkey);
  const releasePath = `${encodeURIComponent(version)}/${encodeURIComponent(expectedName)}`;
  if (!siteUrl)
    throw new Error("Set PUBLIC_SITE_URL before generating release manifests");
  const origin = new URL(siteUrl);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("PUBLIC_SITE_URL must be an HTTP(S) origin");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("Invalid PUBLIC_RESONANCE_REPOSITORY");
  const domesticBase = new URL(releasesBase.replace(/\/?$/, "/"), origin);
  if (
    !["https:", "http:"].includes(domesticBase.protocol) ||
    domesticBase.username ||
    domesticBase.password ||
    domesticBase.search ||
    domesticBase.hash
  )
    throw new Error("Invalid PUBLIC_RELEASES_BASE");
  const domesticUrl = new URL(`releases/${releasePath}`, domesticBase).href;
  const githubUrl = `https://github.com/${repository}/releases/download/${releasePath}`;
  // Prepare everything before writing so missing translations cannot publish a partial release.
  const manifests = ["zh-CN", "en-US", "ja-JP"].map((locale) => ({
    name: locale === "zh-CN" ? "latest.json" : `latest.${locale}.json`,
    body: {
      version,
      notes: readFileSync(
        join(repoRoot, `doc/${locale}/changelog/v${version}.md`),
        "utf8",
      ),
      pub_date: publishedAt.toISOString(),
      platforms: {
        "windows-x86_64": {
          signature,
          url: locale === "zh-CN" ? domesticUrl : githubUrl,
        },
      },
    },
  }));
  mkdirSync(outputDir, { recursive: true });
  for (const { name, body } of manifests) {
    writeFileSync(join(outputDir, name), `${JSON.stringify(body, null, 2)}\n`);
  }
  return manifests.map(({ name }) => join(outputDir, name));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , installerPath, outputDir] = process.argv;
  if (!installerPath || !outputDir)
    throw new Error(
      "Usage: node scripts/generate-update-manifests.mjs <installer.exe> <output-dir>",
    );
  for (const path of generateUpdateManifests({
    installerPath: resolve(installerPath),
    outputDir: resolve(outputDir),
  })) {
    console.log(`Generated ${path}`);
  }
}

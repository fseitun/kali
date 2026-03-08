#!/usr/bin/env node
/**
 * Uploads the Vosk model from public/ to Vercel Blob.
 * Requires BLOB_READ_WRITE_TOKEN (run `vercel env pull` or add to .env.local).
 *
 * Usage:
 *   npm run upload-vosk
 *   node scripts/upload-vosk-model.mjs [path-to-model.zip]
 *
 * Before running: create a public Blob store in Vercel, connect it to this project,
 * then run `vercel env pull` to get BLOB_READ_WRITE_TOKEN.
 */
import { put } from "@vercel/blob";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env and .env.local (vercel env pull writes .env.local; .env is common for local dev)
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", ".env.local"]) {
  const envPath = join(root, name);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const DEFAULT_MODEL = "vosk-model-small-es-0.42.zip";

function getModelPath() {
  const arg = process.argv[2];
  if (arg) {
    const resolved = join(process.cwd(), arg);
    if (!existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }
    return resolved;
  }
  const inPublic = join(PUBLIC_DIR, DEFAULT_MODEL);
  if (!existsSync(inPublic)) {
    console.error(
      `No model found. Either:\n` +
        `  1. Put ${DEFAULT_MODEL} in public/\n` +
        `  2. Or pass path: node scripts/upload-vosk-model.mjs path/to/model.zip\n` +
        `Download from: https://alphacephei.com/vosk/models`,
    );
    process.exit(1);
  }
  return inPublic;
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error(
      "BLOB_READ_WRITE_TOKEN is required.\n" +
        "  1. Create a public Blob store in Vercel (Storage tab)\n" +
        "  2. Connect it to this project\n" +
        "  3. Run: vercel env pull\n" +
        "  4. Then run this script again",
    );
    process.exit(1);
  }

  const filePath = getModelPath();
  const pathname = basename(filePath);
  const body = readFileSync(filePath);

  console.log(`Uploading ${pathname} (${(body.length / 1024 / 1024).toFixed(1)} MB)...`);
  const blob = await put(pathname, body, {
    access: "public",
    multipart: true,
    allowOverwrite: true,
    token,
    onUploadProgress: ({ percentage }) => {
      process.stdout.write(`\r  ${percentage?.toFixed(0) ?? "?"}%`);
    },
  });
  console.log(`\nUploaded. URL:\n  ${blob.url}`);
  console.log("\nSet in Vercel env vars:\n  VITE_VOSK_MODEL_URL=" + blob.url);
}

main().catch((err) => {
  if (err?.message?.includes("Cannot use public access on a private store")) {
    console.error(
      "Your Blob store is private. The Vosk model must be publicly accessible (the browser fetches it directly).\n" +
        "Create a new Blob store in Vercel with Public access, connect it to this project,\n" +
        "copy its token to BLOB_READ_WRITE_TOKEN in .env, then run again.",
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Checks if Vosk model(s) in public/ are the latest available from AlphaCephei.
 * Exits 0 if all up-to-date, 1 if any outdated or unknown.
 */
import { createHash } from "node:crypto";
import { readdirSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_LIST_URL = "https://alphacephei.com/vosk/models/model-list.json";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("md5");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function findLatestForLangType(list, lang, type) {
  const candidates = list.filter(
    (m) => m.lang === lang && m.type === type && m.obsolete !== "true",
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const va = (a.version || "").split(/[.-]/).map(Number);
    const vb = (b.version || "").split(/[.-]/).map(Number);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (va[i] || 0) - (vb[i] || 0);
      if (diff !== 0) return -diff;
    }
    return 0;
  })[0];
}

async function main() {
  const files = readdirSync(PUBLIC_DIR).filter(
    (f) => f.startsWith("vosk-model-") && f.endsWith(".zip"),
  );

  if (files.length === 0) {
    console.log("No vosk-model-*.zip files in public/");
    process.exit(0);
  }

  let resp;
  try {
    resp = await fetch(MODEL_LIST_URL);
  } catch (err) {
    console.error("Failed to fetch model list:", err.message);
    process.exit(1);
  }

  if (!resp.ok) {
    console.error(`Failed to fetch model list: ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }

  const list = await resp.json();
  const byName = Object.fromEntries(list.map((m) => [m.name, m]));
  let hasError = false;

  for (const file of files) {
    const modelName = file.replace(/\.zip$/, "");
    const entry = byName[modelName];

    if (!entry) {
      console.warn(`Unknown model: ${file} (not in AlphaCephei list)`);
      hasError = true;
      continue;
    }

    const obsolete = entry.obsolete === "true";
    const filePath = join(PUBLIC_DIR, file);
    const localMd5 = await md5File(filePath);
    const remoteMd5 = (entry.md5 || "").toLowerCase();
    const md5Match = localMd5 === remoteMd5;

    if (obsolete) {
      const latest = findLatestForLangType(list, entry.lang, entry.type);
      if (latest && latest.name !== modelName) {
        console.warn(
          `Outdated: ${file} (version ${entry.version}). ` +
            `Latest for ${entry.lang_text} ${entry.type}: ${latest.name} (${latest.version})`,
        );
      } else {
        console.warn(`Outdated: ${file} (version ${entry.version}, obsolete)`);
      }
      hasError = true;
    } else if (!md5Match) {
      console.warn(`Integrity mismatch: ${file} (local MD5 ${localMd5} != remote ${remoteMd5})`);
      hasError = true;
    } else {
      console.log(`Up to date: ${file} (${entry.version}, ${entry.size_text})`);
    }
  }

  process.exit(hasError ? 1 : 0);
}

main();

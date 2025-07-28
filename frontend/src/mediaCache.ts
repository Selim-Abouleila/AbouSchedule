import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";

/* ---------- constants ---------- */
const DIR        = FileSystem.cacheDirectory + "media/";
const MAX_CACHE  = 1 * 1024 * 1024 * 1024;           // 200 MB

/* ---------- cache maintenance ---------- */
export async function ensureDir() {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
}

export async function pruneMediaCache() {
  await ensureDir();                             // ↙️ first make sure DIR exists
  const files = await FileSystem.readDirectoryAsync(DIR);

  const stats = await Promise.all(
    files.map(async f => {
      const info = await FileSystem.getInfoAsync(DIR + f);
      if (!info.exists) return { path: DIR + f, mtime: 0, size: 0 };

      return {
        path: DIR + f,
        mtime: info.modificationTime ?? 0,
        size: info.size ?? 0,
      };
    })
  );

  let total = stats.reduce((s, f) => s + f.size, 0);
  if (total <= MAX_CACHE) return;

  stats.sort((a, b) => a.mtime - b.mtime);       // oldest first
  for (const f of stats) {
    await FileSystem.deleteAsync(f.path);
    total -= f.size;
    if (total <= MAX_CACHE) break;
  }
}

/* ---------- helpers for downloading / resolving ---------- */
export async function cachePath(url: string) {
  const name = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    url
  );
  const ext = url.match(/\.\w{3,4}$/)?.[0] ?? "";
  return DIR + name + ext;
}

export async function localUri(url: string) {
  await ensureDir();

  const path = await cachePath(url);
  const info = await FileSystem.getInfoAsync(path);

  if (info.exists) return path;                  // already cached

  await FileSystem.downloadAsync(url, path);     // first download
  return path;
}

/* optional full purge */
export async function clearMediaCache() {
  await FileSystem.deleteAsync(DIR, { idempotent: true });
}

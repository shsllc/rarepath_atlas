/**
 * Small key-value persistence layer behind one interface.
 *
 *   production (Netlify)  → Netlify Blobs (strong consistency)
 *   local development     → JSON files under data/.store/ (gitignored)
 *   tests                 → in-memory (setStore(new MemoryStore()))
 *
 * Keys are path-like ("review/items/<id>"). Values are JSON. Nothing here is a cache: callers
 * store review decisions, audit events, watchlists and shared links that must survive restarts.
 */
import fs from "node:fs";
import path from "node:path";

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  /** Write only if the key does not exist yet. Returns false when it already existed. */
  create<T>(key: string, value: T): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Keys under a prefix, sorted. */
  list(prefix: string): Promise<string[]>;
}

export class MemoryStore implements KVStore {
  private m = new Map<string, string>();
  async get<T>(key: string) {
    const v = this.m.get(key);
    return v === undefined ? null : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T) {
    this.m.set(key, JSON.stringify(value));
  }
  async create<T>(key: string, value: T) {
    if (this.m.has(key)) return false;
    this.m.set(key, JSON.stringify(value));
    return true;
  }
  async delete(key: string) {
    this.m.delete(key);
  }
  async list(prefix: string) {
    return [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

/** Local development store: one JSON file per key under data/.store/. */
export class FileStore implements KVStore {
  constructor(private readonly root = path.join(process.cwd(), "data", ".store")) {}
  private file(key: string) {
    if (key.includes("..")) throw new Error("invalid key");
    return path.join(this.root, `${key}.json`);
  }
  async get<T>(key: string) {
    try {
      return JSON.parse(fs.readFileSync(this.file(key), "utf8")) as T;
    } catch {
      return null;
    }
  }
  async set<T>(key: string, value: T) {
    const f = this.file(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(value, null, 1));
  }
  async create<T>(key: string, value: T) {
    const f = this.file(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try {
      fs.writeFileSync(f, JSON.stringify(value, null, 1), { flag: "wx" });
      return true;
    } catch {
      return false;
    }
  }
  async delete(key: string) {
    fs.rmSync(this.file(key), { force: true });
  }
  async list(prefix: string) {
    const out: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".json")) out.push(path.relative(this.root, p).replace(/\\/g, "/").replace(/\.json$/, ""));
      }
    };
    walk(this.root);
    return out.filter((k) => k.startsWith(prefix)).sort();
  }
}

/** Every storage call is bounded, so a stalled request fails clearly instead of hanging the page. */
const OP_TIMEOUT_MS = 8_000;
async function bounded<T>(op: string, p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();
  try {
    return await Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`store ${op} timed out`)), OP_TIMEOUT_MS)))]);
  } catch (e) {
    console.error(`[store] ${op} failed after ${Date.now() - started} ms: ${(e as Error).message}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Netlify Blobs: used automatically when running on Netlify (the runtime provides the context). */
export class BlobsStore implements KVStore {
  private storePromise: Promise<import("@netlify/blobs").Store>;
  constructor(name = "rarepath") {
    this.storePromise = import("@netlify/blobs").then(({ getStore }) => getStore({ name, consistency: "strong" }));
  }
  async get<T>(key: string) {
    const s = await this.storePromise;
    return ((await bounded("get", s.get(key, { type: "json" }))) as T | null) ?? null;
  }
  async set<T>(key: string, value: T) {
    const s = await this.storePromise;
    await bounded("set", s.setJSON(key, value));
  }
  async create<T>(key: string, value: T) {
    const s = await this.storePromise;
    const r = await bounded("create", s.setJSON(key, value, { onlyIfNew: true }));
    return r.modified;
  }
  async delete(key: string) {
    const s = await this.storePromise;
    await bounded("delete", s.delete(key));
  }
  async list(prefix: string) {
    const s = await this.storePromise;
    const { blobs } = await bounded("list", s.list({ prefix }));
    return blobs.map((b) => b.key).sort();
  }
}

let current: KVStore | null = null;
const onNetlify = () => !!(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.SITE_ID);

export function getStore(): KVStore {
  if (current) return current;
  if (process.env.STORE === "memory" || process.env.VITEST) current = new MemoryStore();
  else if (process.env.STORE === "blobs" || (process.env.STORE !== "file" && onNetlify())) current = new BlobsStore();
  else current = new FileStore();
  return current;
}

/** Test seam. */
export function setStore(s: KVStore | null) {
  current = s;
}

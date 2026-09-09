import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const DATABASE_NAME = "tfro-imis-offline";
const DATABASE_VERSION = 1;
const RESPONSE_STORE = "responses";
const QUEUE_STORE = "mutation-queue";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let client = null;
let syncing = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RESPONSE_STORE)) {
        database.createObjectStore(RESPONSE_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        database.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore(storeName, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try { result = action(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(result?.result);
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}

function requestUrl(input) {
  return typeof input === "string" ? input : input.url;
}

function requestMethod(input, options) {
  return (options?.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
}

function headersFor(input, options) {
  return new Headers(options?.headers || (typeof input !== "string" ? input.headers : undefined));
}

function userScope(headers) {
  const token = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "anonymous";
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).sub || "authenticated";
  } catch {
    return "authenticated";
  }
}

function isCacheableSupabaseUrl(url) {
  return url.startsWith(`${SUPABASE_URL}/rest/v1/`);
}

function isQueueableSupabaseUrl(url) {
  return url.startsWith(`${SUPABASE_URL}/rest/v1/`) || url.startsWith(`${SUPABASE_URL}/storage/v1/`);
}

async function cacheResponse(key, response) {
  if (!response.ok) return;
  const body = await response.clone().text();
  await useStore(RESPONSE_STORE, "readwrite", (store) => store.put({
    key,
    body,
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    savedAt: Date.now(),
  }));
}

async function cachedResponse(key) {
  const entry = await useStore(RESPONSE_STORE, "readonly", (store) => store.get(key));
  if (!entry || Date.now() - entry.savedAt > CACHE_MAX_AGE_MS) return null;
  notify("cached", { savedAt: entry.savedAt });
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

async function serializableBody(input, options) {
  if (options && Object.prototype.hasOwnProperty.call(options, "body")) return options.body;
  if (typeof input !== "string") return input.clone().blob();
  return null;
}

async function queueRequest(input, options, url, method, headers) {
  const safeHeaders = Array.from(headers.entries()).filter(([name]) =>
    !["authorization", "apikey", "content-length", "host"].includes(name.toLowerCase())
  );
  const body = await serializableBody(input, options);
  const requestBody = typeof body === "string" ? body : null;
  let parsedBody = null;
  try { parsedBody = requestBody ? JSON.parse(requestBody) : null; } catch { /* Not JSON. */ }
  const isRestInsert = method === "POST" && url.includes("/rest/v1/") && parsedBody && !url.includes("/rpc/");
  const tempId = isRestInsert && !Array.isArray(parsedBody) && parsedBody.id == null ? -Date.now() : null;
  await useStore(QUEUE_STORE, "readwrite", (store) => store.add({
    url,
    method,
    headers: safeHeaders,
    body,
    tempId,
    createdAt: Date.now(),
  }));
  const pending = await pendingMutationCount();
  notify("queued", { pending });

  let responseBody = "{}";
  if (url.includes("/rest/v1/") && parsedBody) {
    responseBody = JSON.stringify(Array.isArray(parsedBody) ? parsedBody : { ...parsedBody, id: parsedBody.id ?? tempId });
  } else if (url.includes("/storage/v1/object/")) {
    responseBody = JSON.stringify({ Key: new URL(url).pathname.replace(/^\/storage\/v1\/object\//, "") });
  }
  return new Response(responseBody, {
    status: 200,
    headers: { "Content-Type": "application/json", "X-TFRO-Offline-Queued": "true" },
  });
}

function notify(type, detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(`tfro-offline-${type}`, { detail }));
  }
}

export async function offlineFetch(input, options = {}) {
  const url = requestUrl(input);
  const method = requestMethod(input, options);
  const headers = headersFor(input, options);
  const cacheKey = `${userScope(headers)}:${method}:${url}`;

  if (method === "GET" && isCacheableSupabaseUrl(url)) {
    if (!navigator.onLine) {
      const cached = await cachedResponse(cacheKey);
      if (cached) return cached;
      throw new TypeError("This record has not been synchronized to this device yet.");
    }
    try {
      const response = await fetch(input, options);
      await cacheResponse(cacheKey, response);
      return response;
    } catch (error) {
      const cached = await cachedResponse(cacheKey);
      if (cached) return cached;
      throw error;
    }
  }

  if (!["GET", "HEAD"].includes(method) && isQueueableSupabaseUrl(url) && !navigator.onLine) {
    return queueRequest(input, options, url, method, headers);
  }

  return fetch(input, options);
}

export async function pendingMutationCount() {
  return useStore(QUEUE_STORE, "readonly", (store) => store.count());
}

export async function synchronizeOfflineChanges() {
  if (syncing || !navigator.onLine || !client) return;
  syncing = true;
  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) return;
    const database = await openDatabase();
    const entries = await new Promise((resolve, reject) => {
      const transaction = database.transaction(QUEUE_STORE, "readonly");
      const request = transaction.objectStore(QUEUE_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();

    const idMappings = new Map();
    for (const entry of entries) {
      const headers = new Headers(entry.headers);
      headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
      headers.set("authorization", `Bearer ${session.access_token}`);
      let body = entry.body;
      if (typeof body === "string" && idMappings.size) {
        try {
          const replaceIds = (value) => {
            if (Array.isArray(value)) return value.map(replaceIds);
            if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceIds(item)]));
            return idMappings.has(String(value)) ? idMappings.get(String(value)) : value;
          };
          body = JSON.stringify(replaceIds(JSON.parse(body)));
        } catch { /* Non-JSON request bodies do not contain database foreign keys. */ }
      }
      const response = await fetch(entry.url, {
        method: entry.method,
        headers,
        body: ["GET", "HEAD"].includes(entry.method) ? undefined : body,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Synchronization failed with HTTP ${response.status}.`);
      }
      if (entry.tempId != null) {
        try {
          const saved = await response.clone().json();
          const row = Array.isArray(saved) ? saved[0] : saved;
          if (row?.id != null) idMappings.set(String(entry.tempId), row.id);
        } catch { /* Inserts without a representation have no dependent ID. */ }
      }
      await useStore(QUEUE_STORE, "readwrite", (store) => store.delete(entry.id));
    }
    notify("synced", { pending: await pendingMutationCount() });
  } catch (error) {
    console.error("TFRO offline synchronization failed:", error);
    notify("sync-error", { message: error.message, pending: await pendingMutationCount() });
  } finally {
    syncing = false;
  }
}

export function initializeOfflineSync(supabaseClient) {
  client = supabaseClient;
  window.addEventListener("online", () => void synchronizeOfflineChanges());
  navigator.serviceWorker?.register("../service-worker.js").catch((error) =>
    console.warn("Offline application worker could not be registered:", error)
  );
  void pendingMutationCount().then((pending) => {
    if (pending) notify("queued", { pending });
    if (navigator.onLine) void synchronizeOfflineChanges();
  });
}

// IndexedDB (tweet metadata) + Cache Storage (media blobs) helpers.
const TWDB = (function () {
  const DB_NAME = "twitter-offline";
  const DB_VERSION = 1;
  const STORE = "tweets";
  const MEDIA_CACHE = "media-v1";

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function upsertTweets(tweets) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let added = 0;
      tweets.forEach((t) => {
        if (!t || !t.id) return;
        t.savedAt = t.savedAt || Date.now();
        store.put(t);
        added++;
      });
      tx.oncomplete = () => resolve(added);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAllTweets() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function countTweets() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearAll() {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    if ("caches" in window) await caches.delete(MEDIA_CACHE);
  }

  async function isMediaCached(url) {
    if (!("caches" in window)) return false;
    const cache = await caches.open(MEDIA_CACHE);
    const match = await cache.match(url);
    return !!match;
  }

  async function cacheMedia(url) {
    if (!("caches" in window)) return false;
    try {
      const cache = await caches.open(MEDIA_CACHE);
      const existing = await cache.match(url);
      if (existing) return true;
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) return false;
      await cache.put(url, res.clone());
      return true;
    } catch (e) {
      return false;
    }
  }

  async function countCachedMedia() {
    if (!("caches" in window)) return 0;
    try {
      const cache = await caches.open(MEDIA_CACHE);
      const keys = await cache.keys();
      return keys.length;
    } catch (e) {
      return 0;
    }
  }

  async function estimateUsage() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { usage } = await navigator.storage.estimate();
        return usage;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  return {
    upsertTweets,
    getAllTweets,
    countTweets,
    clearAll,
    isMediaCached,
    cacheMedia,
    countCachedMedia,
    estimateUsage,
    MEDIA_CACHE,
  };
})();

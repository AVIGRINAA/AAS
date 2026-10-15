// ─── IndexedDB wrapper ───────────────────────────────────────────────
window.DB = (function () {
  const DB_NAME = 'SupermarketPrices';
  const DB_VERSION = 1;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const d = e.target.result;

        if (!d.objectStoreNames.contains('stores')) {
          const storeStore = d.createObjectStore('stores', { keyPath: 'key' });
          storeStore.createIndex('city', 'city', { unique: false });
          storeStore.createIndex('chainId', 'chainId', { unique: false });
        }

        if (!d.objectStoreNames.contains('prices')) {
          const priceStore = d.createObjectStore('prices', { keyPath: 'key' });
          priceStore.createIndex('itemCode', 'itemCode', { unique: false });
          priceStore.createIndex('itemName', 'itemName', { unique: false });
          priceStore.createIndex('chainId_storeId', 'chainId_storeId', { unique: false });
        }

        if (!d.objectStoreNames.contains('products')) {
          const prodStore = d.createObjectStore('products', { keyPath: 'itemCode' });
          prodStore.createIndex('itemName', 'itemName', { unique: false });
        }

        if (!d.objectStoreNames.contains('meta')) {
          d.createObjectStore('meta', { keyPath: 'chainId' });
        }
      };

      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeName, mode) {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function put(storeName, record) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function bulkPut(storeName, records) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      for (const record of records) {
        store.put(record);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
    });
  }

  function get(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readonly').index(indexName).getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function clear(storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function count(storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readonly').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  return {
    open,
    put,
    bulkPut,
    get,
    getAll,
    getByIndex,
    clear,
    count,
    clearAll: async function () {
      await clear('stores');
      await clear('prices');
      await clear('products');
      await clear('meta');
    },
  };
})();

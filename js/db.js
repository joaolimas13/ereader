// Camada de acesso ao IndexedDB. Sem dependências, promessas simples.
const DB_NAME = 'ereader-db';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) {
        const store = db.createObjectStore('books', { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt');
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

const DB = {
  async addBook(book) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = tx(db, 'books', 'readwrite').add(book);
      req.onsuccess = () => resolve(book.id);
      req.onerror = () => reject(req.error);
    });
  },

  async getBook(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = tx(db, 'books', 'readonly').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllBooks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = tx(db, 'books', 'readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteBook(id) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const req = tx(db, 'books', 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const req = tx(db, 'progress', 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async saveProgress(bookId, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = tx(db, 'progress', 'readwrite').put({ bookId, ...data, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getProgress(bookId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = tx(db, 'progress', 'readonly').get(bookId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getSetting(key, fallback) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = tx(db, 'settings', 'readonly').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
      req.onerror = () => reject(req.error);
    });
  },

  async setSetting(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = tx(db, 'settings', 'readwrite').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

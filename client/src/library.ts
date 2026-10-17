// The export Library — every exported PNG is kept in IndexedDB so nothing a
// designer makes is ever lost. Works the same locally and on the hosted demo.

export interface LibraryItem {
  id: string;
  name: string;
  brand: string;
  preset: string;
  at: number;
  dataUrl: string;
  fav?: boolean;
}

const DB = 'brandwright';
const STORE = 'exports';
const KV = 'kv';
const CHATS = 'chats';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains(KV)) req.result.createObjectStore(KV);
      if (!req.result.objectStoreNames.contains(CHATS)) req.result.createObjectStore(CHATS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// chat threads — every conversation is kept, ChatGPT-style
export interface StoredChat {
  id: string;
  title: string;
  at: number;
  brandId: string;
  msgs: unknown[];
}
function ctx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(CHATS, mode);
        const req = fn(t.objectStore(CHATS));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}
export const saveChat = (c: StoredChat) => ctx('readwrite', (s) => s.put(c)).then(() => c);
export const getChat = (id: string) => ctx<StoredChat | undefined>('readonly', (s) => s.get(id) as IDBRequest<StoredChat | undefined>);
export const listChats = () =>
  ctx<StoredChat[]>('readonly', (s) => s.getAll() as IDBRequest<StoredChat[]>).then((cs) => cs.sort((a, b) => b.at - a.at));
export const removeChat = (id: string) => ctx('readwrite', (s) => s.delete(id));

// simple key-value persistence (session survives refresh)
export function kvSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(KV, 'readwrite');
        t.objectStore(KV).put(value, key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}
export function kvGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(KV, 'readonly').objectStore(KV).get(key);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const saveExport = (item: LibraryItem) => tx('readwrite', (s) => s.put(item)).then(() => item);
export const listExports = () =>
  tx<LibraryItem[]>('readonly', (s) => s.getAll() as IDBRequest<LibraryItem[]>).then((items) => items.sort((a, b) => b.at - a.at));
export const removeExport = (id: string) => tx('readwrite', (s) => s.delete(id));
export async function toggleFav(id: string): Promise<void> {
  const item = await tx<LibraryItem>('readonly', (s) => s.get(id) as IDBRequest<LibraryItem>);
  if (item) await tx('readwrite', (s) => s.put({ ...item, fav: !item.fav }));
}

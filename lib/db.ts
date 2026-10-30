import type { Meal } from "@/lib/types";

const DB_NAME = "warm-table-diary";
const DB_VERSION = 1;
const MEALS = "meals";
const IMAGES = "images";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("这个浏览器不支持本地存储"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MEALS)) {
          db.createObjectStore(MEALS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(IMAGES)) {
          db.createObjectStore(IMAGES);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("无法打开本地数据库"));
    });
  }
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("本地存储操作失败"));
      }),
  );
}

export async function listMeals(): Promise<Meal[]> {
  const meals = await run<Meal[]>(MEALS, "readonly", (store) => store.getAll());
  return meals.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export function putMeal(meal: Meal): Promise<IDBValidKey> {
  return run(MEALS, "readwrite", (store) => store.put(meal));
}

export function deleteMeal(id: string): Promise<undefined> {
  return run(MEALS, "readwrite", (store) => store.delete(id));
}

export function putImage(key: string, blob: Blob): Promise<IDBValidKey> {
  return run(IMAGES, "readwrite", (store) => store.put(blob, key));
}

export function getImage(key: string): Promise<Blob | undefined> {
  return run<Blob | undefined>(IMAGES, "readonly", (store) => store.get(key));
}

export function deleteImage(key: string): Promise<undefined> {
  return run(IMAGES, "readwrite", (store) => store.delete(key));
}

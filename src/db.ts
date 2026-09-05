import type { ExpressionRecord } from "./records";

export const EXPRESSION_DB_NAME = "spoken-english-collector";
const DB_VERSION = 1;
const STORE_NAME = "expressions";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(EXPRESSION_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Could not open local expression storage."));
    };
  });
  return databasePromise;
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local storage transaction was cancelled."));
  });
}

export async function addExpressionRecord(record: ExpressionRecord) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).add(record);
  await transactionComplete(transaction);
}

export async function updateExpressionRecord(record: ExpressionRecord) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(record);
  await transactionComplete(transaction);
}

export async function deleteExpressionRecord(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionComplete(transaction);
}

export async function getAllExpressionRecords() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const request = transaction.objectStore(STORE_NAME).getAll();
  const records = await new Promise<ExpressionRecord[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as ExpressionRecord[]);
    request.onerror = () => reject(request.error ?? new Error("Could not read saved expressions."));
  });
  await transactionComplete(transaction);
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function closeExpressionDatabase() {
  if (!databasePromise) return;
  const database = await databasePromise;
  database.close();
  databasePromise = null;
}

import { DayframeState, emptyState } from "./types";

const DB_NAME = "dayframe";
const DB_VERSION = 1;
const STORE = "app";
const STATE_KEY = "state";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage"));
  });
}

export async function readState(): Promise<DayframeState> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(STATE_KEY);
    request.onsuccess = () => resolve(normalizeState(request.result));
    request.onerror = () => reject(request.error ?? new Error("Could not read local data"));
    transaction.oncomplete = () => db.close();
  });
}

export async function writeState(state: DayframeState): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(state, STATE_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Could not save local data"));
    };
  });
}

export async function eraseState(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not erase local data"));
    request.onblocked = () => reject(new Error("Close other Dayframe tabs and try again"));
  });
}

export function normalizeState(value: unknown): DayframeState {
  if (!value || typeof value !== "object") return { ...emptyState };
  const candidate = value as Partial<DayframeState>;
  if (candidate.version !== 1) return { ...emptyState };
  return {
    version: 1,
    sleepSessions: Array.isArray(candidate.sleepSessions) ? candidate.sleepSessions : [],
    movementDays: Array.isArray(candidate.movementDays) ? candidate.movementDays : [],
    meals: Array.isArray(candidate.meals) ? candidate.meals : [],
  };
}

import { isCustomAvatarOutlineColor } from "./custom-avatar-color.ts";

export const CUSTOM_AVATAR_DB_NAME = "game-rank-test/custom-avatar/v1";
export const CUSTOM_AVATAR_STORE_NAME = "custom-avatar";
export const CUSTOM_AVATAR_RECORD_ID = "self";
export const CUSTOM_AVATAR_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const CUSTOM_AVATAR_MAX_SYNC_BYTES = 96 * 1024;
export const CUSTOM_AVATAR_MAX_SYNC_DATA_URL_LENGTH = Math.ceil((CUSTOM_AVATAR_MAX_SYNC_BYTES * 4) / 3) + 64;
export const CUSTOM_AVATAR_OUTPUT_SIZE = 320;

export type CustomAvatarStoredRecord = {
  blob: Blob;
  mimeType: string;
  outlineColor?: string;
  size: number;
  updatedAt: string;
};

export type CustomAvatarSyncPayload = {
  imageDataUrl: string;
  outlineColor?: string;
  updatedAt: string;
};

type CustomAvatarDbRecord = CustomAvatarStoredRecord & {
  id: typeof CUSTOM_AVATAR_RECORD_ID;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

export function isAllowedCustomAvatarMimeType(type: string) {
  if (type === "") return true;
  return type.startsWith("image/") && type !== "image/svg+xml";
}

function isAllowedCustomAvatarDataUrl(value: string) {
  if (value.length > CUSTOM_AVATAR_MAX_SYNC_DATA_URL_LENGTH) return false;
  return /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/]+=*$/i.test(value);
}

export function getCustomAvatarFileError(file: Pick<File, "size" | "type"> | null | undefined) {
  if (!file) return "请选择图片文件";
  if (file.type === "image/svg+xml") return "请选择普通照片格式，不支持 SVG";
  if (!isAllowedCustomAvatarMimeType(file.type)) return "请选择图片文件";
  if (file.size > CUSTOM_AVATAR_MAX_SOURCE_BYTES) return "图片太大，请换一张小于 12MB 的图片";
  return null;
}

export function resolveCustomAvatarStoredRecord(value: unknown): CustomAvatarStoredRecord | null {
  if (!isRecord(value)) return null;
  if (value.id !== CUSTOM_AVATAR_RECORD_ID) return null;
  if (!isBlob(value.blob)) return null;
  if (typeof value.mimeType !== "string" || !isAllowedCustomAvatarMimeType(value.mimeType)) return null;
  if (typeof value.updatedAt !== "string") return null;
  if (typeof value.size !== "number" || !Number.isFinite(value.size) || value.size < 0 || value.size > CUSTOM_AVATAR_MAX_SOURCE_BYTES) {
    return null;
  }
  const outlineColor = typeof value.outlineColor === "string" && isCustomAvatarOutlineColor(value.outlineColor) ? value.outlineColor : undefined;
  return {
    blob: value.blob,
    mimeType: value.mimeType,
    ...(outlineColor ? { outlineColor } : {}),
    size: value.size,
    updatedAt: value.updatedAt,
  };
}

export function resolveCustomAvatarSyncPayload(value: unknown): CustomAvatarSyncPayload | null {
  if (!isRecord(value)) return null;
  if (typeof value.imageDataUrl !== "string" || !isAllowedCustomAvatarDataUrl(value.imageDataUrl)) return null;
  if (typeof value.updatedAt !== "string") return null;
  const outlineColor = typeof value.outlineColor === "string" && isCustomAvatarOutlineColor(value.outlineColor) ? value.outlineColor : undefined;
  return {
    imageDataUrl: value.imageDataUrl,
    ...(outlineColor ? { outlineColor } : {}),
    updatedAt: value.updatedAt,
  };
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string | null>((resolve) => {
    if (typeof FileReader === "undefined") {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(blob);
  });
}

export async function createCustomAvatarSyncPayload(record: CustomAvatarStoredRecord | null | undefined) {
  if (!record || record.blob.size > CUSTOM_AVATAR_MAX_SYNC_BYTES) return null;
  const imageDataUrl = await readBlobAsDataUrl(record.blob);
  if (!imageDataUrl) return null;
  return resolveCustomAvatarSyncPayload({
    imageDataUrl,
    outlineColor: record.outlineColor,
    updatedAt: record.updatedAt,
  });
}

function getIndexedDB() {
  if (typeof window === "undefined") return null;
  try {
    return window.indexedDB ?? null;
  } catch {
    return null;
  }
}

function openCustomAvatarDb() {
  const indexedDB = getIndexedDB();
  if (!indexedDB) return Promise.resolve<IDBDatabase | null>(null);

  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(CUSTOM_AVATAR_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CUSTOM_AVATAR_STORE_NAME)) {
        db.createObjectStore(CUSTOM_AVATAR_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => resolve(null);
  });
}

function runCustomAvatarStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return new Promise<T | null>((resolve) => {
    void openCustomAvatarDb().then((db) => {
      if (!db) {
        resolve(null);
        return;
      }
      const transaction = db.transaction(CUSTOM_AVATAR_STORE_NAME, mode);
      const store = transaction.objectStore(CUSTOM_AVATAR_STORE_NAME);
      const request = action(store);
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
      transaction.onabort = () => db.close();
    });
  });
}

export async function readPersistedCustomAvatarImage() {
  const value = await runCustomAvatarStore("readonly", (store) => store.get(CUSTOM_AVATAR_RECORD_ID));
  return resolveCustomAvatarStoredRecord(value);
}

export async function writePersistedCustomAvatarImage(blob: Blob, outlineColor?: string | null, updatedAt = new Date().toISOString()) {
  const mimeType = blob.type || "image/png";
  const record = resolveCustomAvatarStoredRecord({
    id: CUSTOM_AVATAR_RECORD_ID,
    blob,
    mimeType,
    outlineColor,
    size: blob.size,
    updatedAt,
  });
  if (!record) return null;

  const dbRecord: CustomAvatarDbRecord = {
    id: CUSTOM_AVATAR_RECORD_ID,
    ...record,
  };
  const value = await runCustomAvatarStore("readwrite", (store) => store.put(dbRecord));
  return value === CUSTOM_AVATAR_RECORD_ID ? record : null;
}

export async function deletePersistedCustomAvatarImage() {
  const value = await runCustomAvatarStore("readwrite", (store) => store.delete(CUSTOM_AVATAR_RECORD_ID));
  return value !== null;
}

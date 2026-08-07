import type { LiveSource, TargetScreen } from "./types";

export type RecordingStorage = "indexeddb" | "memory";

export interface RecordingTimingMetrics {
  clickToRecorderStartMs: number;
  clickToFirstDataMs?: number;
}

export interface RecordingLibraryRecord {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  mimeType: string;
  sizeBytes: number;
  source: LiveSource;
  sourceLabel: string;
  target: TargetScreen;
  targetLabel: string;
  screenIds: string[];
  thumbnailDataUrl?: string;
  timings: RecordingTimingMetrics;
  storage: RecordingStorage;
  blob: Blob;
}

export type NewRecordingLibraryRecord = Omit<RecordingLibraryRecord, "storage">;

export interface RecordingLibraryStoreOptions {
  getIndexedDB?: () => IDBFactory | undefined;
  databaseName?: string;
}

const RECORDING_STORE = "recordings";
const DEFAULT_DATABASE_NAME = "project-lantern-recordings-v1";

export function normalizeRecordingTitle(value: string, fallback = "Lantern Live recording") {
  const title = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return title || fallback;
}

export function sortRecordingLibrary(records: RecordingLibraryRecord[]) {
  return [...records].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function recordingTimingMetrics(clickAt: number, recorderStartedAt: number, firstDataAt?: number): RecordingTimingMetrics {
  return {
    clickToRecorderStartMs: Math.max(0, Math.round(recorderStartedAt - clickAt)),
    clickToFirstDataMs: firstDataAt === undefined ? undefined : Math.max(0, Math.round(firstDataAt - clickAt))
  };
}

export class RecordingLibraryStore {
  private readonly options: RecordingLibraryStoreOptions;
  private readonly memory = new Map<string, RecordingLibraryRecord>();
  private databasePromise?: Promise<IDBDatabase | undefined>;
  private indexedDBUnavailable = false;

  constructor(options: RecordingLibraryStoreOptions = {}) {
    this.options = options;
  }

  async list(): Promise<RecordingLibraryRecord[]> {
    const database = await this.database();
    if (!database) return sortRecordingLibrary([...this.memory.values()]);
    try {
      const records = await readAll(database);
      return sortRecordingLibrary(records.map((record) => ({ ...record, storage: "indexeddb" })));
    } catch {
      this.indexedDBUnavailable = true;
      return sortRecordingLibrary([...this.memory.values()]);
    }
  }

  async save(record: NewRecordingLibraryRecord): Promise<RecordingLibraryRecord> {
    const database = await this.database();
    if (database) {
      const persisted: RecordingLibraryRecord = { ...record, storage: "indexeddb" };
      try {
        await putRecord(database, persisted);
        return persisted;
      } catch {
        this.indexedDBUnavailable = true;
      }
    }
    const fallback: RecordingLibraryRecord = { ...record, storage: "memory" };
    this.memory.set(fallback.id, fallback);
    return fallback;
  }

  async rename(id: string, title: string): Promise<RecordingLibraryRecord | undefined> {
    const normalizedTitle = normalizeRecordingTitle(title);
    const database = await this.database();
    if (database) {
      try {
        const current = await readRecord(database, id);
        if (!current) return undefined;
        const updated = { ...current, title: normalizedTitle, storage: "indexeddb" as const };
        await putRecord(database, updated);
        return updated;
      } catch {
        this.indexedDBUnavailable = true;
      }
    }
    const current = this.memory.get(id);
    if (!current) return undefined;
    const updated = { ...current, title: normalizedTitle, storage: "memory" as const };
    this.memory.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.memory.delete(id);
    const database = await this.database();
    if (!database) return;
    try {
      await deleteRecord(database, id);
    } catch {
      this.indexedDBUnavailable = true;
    }
  }

  private async database() {
    if (this.indexedDBUnavailable) return undefined;
    if (!this.databasePromise) this.databasePromise = this.openDatabase();
    return this.databasePromise;
  }

  private openDatabase(): Promise<IDBDatabase | undefined> {
    const indexedDB = this.options.getIndexedDB?.()
      ?? (typeof window === "undefined" ? undefined : window.indexedDB);
    if (!indexedDB) {
      this.indexedDBUnavailable = true;
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(this.options.databaseName ?? DEFAULT_DATABASE_NAME, 1);
      } catch {
        this.indexedDBUnavailable = true;
        resolve(undefined);
        return;
      }
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(RECORDING_STORE)) {
          request.result.createObjectStore(RECORDING_STORE, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => {
        this.indexedDBUnavailable = true;
        resolve(undefined);
      }, { once: true });
      request.addEventListener("blocked", () => {
        this.indexedDBUnavailable = true;
        resolve(undefined);
      }, { once: true });
    });
  }
}

export const recordingLibraryStore = new RecordingLibraryStore();

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("Recording storage request failed.")), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Recording storage transaction was cancelled.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Recording storage transaction failed.")), { once: true });
  });
}

async function readAll(database: IDBDatabase) {
  const transaction = database.transaction(RECORDING_STORE, "readonly");
  const records = await requestResult(transaction.objectStore(RECORDING_STORE).getAll() as IDBRequest<RecordingLibraryRecord[]>);
  await transactionComplete(transaction);
  return records;
}

async function readRecord(database: IDBDatabase, id: string) {
  const transaction = database.transaction(RECORDING_STORE, "readonly");
  const record = await requestResult(transaction.objectStore(RECORDING_STORE).get(id) as IDBRequest<RecordingLibraryRecord | undefined>);
  await transactionComplete(transaction);
  return record;
}

async function putRecord(database: IDBDatabase, record: RecordingLibraryRecord) {
  const transaction = database.transaction(RECORDING_STORE, "readwrite");
  transaction.objectStore(RECORDING_STORE).put(record);
  await transactionComplete(transaction);
}

async function deleteRecord(database: IDBDatabase, id: string) {
  const transaction = database.transaction(RECORDING_STORE, "readwrite");
  transaction.objectStore(RECORDING_STORE).delete(id);
  await transactionComplete(transaction);
}

export async function captureRecordingThumbnail(blob: Blob, timeoutMs = 2200): Promise<string | undefined> {
  if (typeof document === "undefined" || typeof URL === "undefined") return undefined;
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Thumbnail timed out.")), timeoutMs);
      const finish = () => { window.clearTimeout(timeout); resolve(); };
      video.addEventListener("loadeddata", finish, { once: true });
      video.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("Thumbnail unavailable.")); }, { once: true });
      video.load();
    });
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.fillStyle = "#07111e";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceWidth = video.videoWidth || 16;
    const sourceHeight = video.videoHeight || 9;
    const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", .72);
  } catch {
    return undefined;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export interface DemoRecordingCapture {
  stream: MediaStream;
  stop: () => void;
}

export function createDemoRecordingCapture(title: string, lowerThird: string): DemoRecordingCapture | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: (frameRate?: number) => MediaStream };
  if (typeof canvas.captureStream !== "function") return undefined;
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  let animationFrame = 0;
  let stopped = false;
  const startedAt = performance.now();
  const draw = (now: number) => {
    if (stopped) return;
    const elapsed = (now - startedAt) / 1000;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#07111e");
    gradient.addColorStop(.55, "#123d59");
    gradient.addColorStop(1, "#7f3d45");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < 18; index += 1) {
      const x = ((index * 127) + elapsed * (18 + index)) % (canvas.width + 80) - 40;
      const y = 90 + ((index * 83) % 560) + Math.sin(elapsed + index) * 28;
      context.beginPath();
      context.arc(x, y, 3 + (index % 4), 0, Math.PI * 2);
      context.fillStyle = index % 3 === 0 ? "#f2c65f" : index % 3 === 1 ? "#65dce7" : "#e85c4a";
      context.fill();
    }
    context.fillStyle = "rgba(5,13,23,.68)";
    context.fillRect(72, 466, 850, 150);
    context.fillStyle = "#ffffff";
    context.font = "700 56px sans-serif";
    context.fillText(title || "Lantern Live demo", 104, 535);
    context.fillStyle = "#cce4df";
    context.font = "32px sans-serif";
    context.fillText(lowerThird || "Children's Museum of Stockton", 104, 582);
    context.fillStyle = "#f2c65f";
    context.font = "700 24px sans-serif";
    context.fillText("LOCAL TEST CAPTURE", 80, 86);
    animationFrame = window.requestAnimationFrame(draw);
  };
  animationFrame = window.requestAnimationFrame(draw);
  const stream = canvas.captureStream(30);
  return {
    stream,
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.cancelAnimationFrame(animationFrame);
      stream.getTracks().forEach((track) => track.stop());
    }
  };
}

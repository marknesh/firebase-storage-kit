import { mock } from "bun:test";

import type { FirebaseStorage } from "firebase/storage";

import type { StorageProvider } from "../../src/providers/provider";
import type { FileMetadata } from "../../src/types/metadata";
import type {
  ProviderUploadCallbacks,
  ProviderUploadTask,
  UploadOptions,
} from "../../src/types/provider";

export type UploadBehavior =
  | {
      type: "success";
      downloadURL?: string;
      progress?: { bytesTransferred: number; totalBytes: number }[];
      async?: boolean;
    }
  | { type: "error"; error?: Error; async?: boolean }
  | {
      type: "failThenSucceed";
      failures: number;
      error?: Error;
      async?: boolean;
    }
  | {
      type: "manual";
      onStart?: (
        file: File,
        options: UploadOptions,
        callbacks: ProviderUploadCallbacks,
        task: ProviderUploadTask
      ) => void;
    };

export interface MockProviderOptions {
  uploadBehavior?: UploadBehavior;
  exists?: (path: string) => Promise<boolean>;
  getMetadata?: (path: string) => Promise<FileMetadata>;
  getDownloadURL?: (path: string) => Promise<string>;
  delete?: (path: string) => Promise<void>;
}

export interface MockProviderSpies {
  exists: ReturnType<typeof mock<(path: string) => Promise<boolean>>>;
  getMetadata: ReturnType<typeof mock<(path: string) => Promise<FileMetadata>>>;
  getDownloadURL: ReturnType<typeof mock<(path: string) => Promise<string>>>;
  delete: ReturnType<typeof mock<(path: string) => Promise<void>>>;
  upload: ReturnType<
    typeof mock<
      (
        file: File,
        options: UploadOptions,
        callbacks: ProviderUploadCallbacks
      ) => ProviderUploadTask
    >
  >;
}

export interface MockProviderResult {
  provider: StorageProvider;
  spies: MockProviderSpies;
  tasks: ProviderUploadTask[];
}

const defaultMetadata = (path: string): FileMetadata => ({
  contentType: "application/octet-stream",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  path,
  size: 1024,
  updatedAt: new Date("2024-01-02T00:00:00Z"),
});

const runUploadBehavior = (
  behavior: UploadBehavior,
  file: File,
  options: UploadOptions,
  callbacks: ProviderUploadCallbacks,
  task: ProviderUploadTask,
  failCounts?: Map<string, number>
): void => {
  if (behavior.type === "manual") {
    behavior.onStart?.(file, options, callbacks, task);
    return;
  }

  const run = () => {
    if (behavior.type === "failThenSucceed") {
      const key = `${options.path}:${file.name}`;
      const count = failCounts?.get(key) ?? 0;
      failCounts?.set(key, count + 1);

      if (count < behavior.failures) {
        callbacks.onError(behavior.error ?? new Error("upload failed"));
        return;
      }
    }

    if (behavior.type === "error") {
      callbacks.onError(behavior.error ?? new Error("upload failed"));
      return;
    }

    if (behavior.type !== "success" && behavior.type !== "failThenSucceed") {
      return;
    }

    const ticks =
      behavior.type === "success" && behavior.progress
        ? behavior.progress
        : [
            { bytesTransferred: 0, totalBytes: file.size },
            { bytesTransferred: file.size, totalBytes: file.size },
          ];

    for (const tick of ticks) {
      callbacks.onProgress(tick.bytesTransferred, tick.totalBytes);
    }

    const downloadURL =
      behavior.type === "success" && behavior.downloadURL !== undefined
        ? behavior.downloadURL
        : `https://example.com/${options.path}`;

    callbacks.onSuccess(downloadURL);
  };

  if ("async" in behavior && behavior.async === true) {
    queueMicrotask(run);
  } else {
    run();
  }
};

/** Default async stub when a test does not override provider behavior. */
const doNothingAsync = async (): Promise<void> => {
  await Promise.resolve();
};

/** Default cancel/pause/resume stub — present on the task, but does nothing. */
const doNothing = (): void => {
  void 0;
};

/** Minimal Firebase Storage stub; `firebase/storage` is fully mocked in provider tests. */
export const createTestFirebaseStorage = (): FirebaseStorage =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ref() is mocked; only storage identity matters
  ({
    app: {},
    maxOperationRetryTime: 600_000,
    maxUploadRetryTime: 600_000,
  }) as unknown as FirebaseStorage;

export const createMockProvider = (
  options: MockProviderOptions = {}
): MockProviderResult => {
  const tasks: ProviderUploadTask[] = [];
  const failCounts = new Map<string, number>();
  const uploadBehavior: UploadBehavior = options.uploadBehavior ?? {
    async: true,
    type: "success",
  };

  const spies: MockProviderSpies = {
    delete: mock(options.delete ?? doNothingAsync),
    exists: mock(
      options.exists ??
        (async () => {
          await Promise.resolve();
          return true;
        })
    ),
    getDownloadURL: mock(
      options.getDownloadURL ??
        (async (path) => {
          await Promise.resolve();
          return `https://example.com/${path}`;
        })
    ),
    getMetadata: mock(
      options.getMetadata ??
        (async (path) => {
          await Promise.resolve();
          return defaultMetadata(path);
        })
    ),
    upload: mock((file, uploadOptions, callbacks) => {
      const task: ProviderUploadTask = {
        cancel: mock(doNothing),
        pause: mock(doNothing),
        resume: mock(doNothing),
      };
      tasks.push(task);
      runUploadBehavior(
        uploadBehavior,
        file,
        uploadOptions,
        callbacks,
        task,
        failCounts
      );
      return task;
    }),
  };

  const provider: StorageProvider = {
    delete: spies.delete,
    exists: spies.exists,
    getDownloadURL: spies.getDownloadURL,
    getMetadata: spies.getMetadata,
    upload: spies.upload,
  };

  return { provider, spies, tasks };
};

export const waitForMicrotasks = async (): Promise<void> => {
  await Bun.sleep(0);
};

export const delay = async (ms: number): Promise<void> => {
  await Bun.sleep(ms);
};

export const waitForUploadSettled = async (): Promise<void> => {
  await waitForMicrotasks();
  await waitForMicrotasks();
};

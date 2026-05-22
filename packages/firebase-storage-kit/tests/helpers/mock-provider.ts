import { mock } from "bun:test";

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
      progress?: Array<{ bytesTransferred: number; totalBytes: number }>;
      async?: boolean;
    }
  | { type: "error"; error?: Error; async?: boolean }
  | {
      type: "manual";
      onStart?: (
        file: File,
        options: UploadOptions,
        callbacks: ProviderUploadCallbacks,
        task: ProviderUploadTask,
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
        callbacks: ProviderUploadCallbacks,
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
  path,
  size: 1024,
  contentType: "application/octet-stream",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-02T00:00:00Z"),
});

function runUploadBehavior(
  behavior: UploadBehavior,
  file: File,
  options: UploadOptions,
  callbacks: ProviderUploadCallbacks,
  task: ProviderUploadTask,
): void {
  if (behavior.type === "manual") {
    behavior.onStart?.(file, options, callbacks, task);
    return;
  }

  const run = () => {
    if (behavior.type === "error") {
      callbacks.onError(behavior.error ?? new Error("upload failed"));
      return;
    }

    const ticks = behavior.progress ?? [
      { bytesTransferred: 0, totalBytes: file.size },
      { bytesTransferred: file.size, totalBytes: file.size },
    ];

    for (const tick of ticks) {
      callbacks.onProgress(tick.bytesTransferred, tick.totalBytes);
    }

    callbacks.onSuccess(
      behavior.downloadURL ?? `https://example.com/${options.path}`,
    );
  };

  if (behavior.async) {
    queueMicrotask(run);
  } else {
    run();
  }
}

export function createMockProvider(
  options: MockProviderOptions = {},
): MockProviderResult {
  const tasks: ProviderUploadTask[] = [];
  const uploadBehavior: UploadBehavior = options.uploadBehavior ?? {
    type: "success",
    async: true,
  };

  const spies: MockProviderSpies = {
    exists: mock(
      options.exists ??
        (async () => {
          return true;
        }),
    ),
    getMetadata: mock(
      options.getMetadata ??
        (async (path) => {
          return defaultMetadata(path);
        }),
    ),
    getDownloadURL: mock(
      options.getDownloadURL ??
        (async (path) => {
          return `https://example.com/${path}`;
        }),
    ),
    delete: mock(
      options.delete ??
        (async () => {
          return;
        }),
    ),
    upload: mock((file, uploadOptions, callbacks) => {
      const task: ProviderUploadTask = {
        cancel: mock(() => {}),
        pause: mock(() => {}),
        resume: mock(() => {}),
      };
      tasks.push(task);
      runUploadBehavior(uploadBehavior, file, uploadOptions, callbacks, task);
      return task;
    }),
  };

  const provider: StorageProvider = {
    exists: spies.exists,
    getMetadata: spies.getMetadata,
    getDownloadURL: spies.getDownloadURL,
    delete: spies.delete,
    upload: spies.upload,
  };

  return { provider, spies, tasks };
}

export function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

export async function waitForUploadSettled(): Promise<void> {
  await waitForMicrotasks();
  await waitForMicrotasks();
}

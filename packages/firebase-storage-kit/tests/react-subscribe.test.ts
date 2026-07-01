import { describe, expect, it, mock } from "bun:test";

import { StorageManager } from "../src/core/storage-manager";
import {
  getBatchHandleSnapshot,
  getStorageManagerSnapshot,
  getUploadHandleSnapshot,
  subscribeToBatchHandle,
  subscribeToStorageManager,
  subscribeToUploadHandle,
} from "../src/react/subscribe";
import {
  createMockProvider,
  waitForUploadSettled,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

describe("react subscribe helpers", () => {
  it("subscribeToStorageManager notifies on upload changes", () => {
    const { provider } = createMockProvider({
      uploadBehavior: { async: false, type: "success" },
    });
    const manager = new StorageManager(provider);
    const listener = mock(() => {});

    subscribeToStorageManager(manager, listener);
    expect(listener).not.toHaveBeenCalled();

    manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });
    expect(listener).toHaveBeenCalled();
    expect(getStorageManagerSnapshot(manager).uploads).toHaveLength(1);
  });

  it("subscribeToUploadHandle notifies on progress", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);
    const handle = manager.uploadFile(createTestFile("a.txt"), {
      path: "uploads/a.txt",
    });
    const listener = mock(() => {});

    subscribeToUploadHandle(handle, listener);
    await waitForUploadSettled();

    expect(listener.mock.calls.length).toBeGreaterThan(0);
    expect(getUploadHandleSnapshot(handle).status).toBe("success");
  });

  it("subscribeToBatchHandle notifies on batch change", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles(
      [createTestFile("a.txt"), createTestFile("b.txt")],
      (_file, i) => ({ path: `uploads/${i}.txt` }),
      { concurrency: 1 }
    );
    const listener = mock(() => {});

    subscribeToBatchHandle(batch, listener);
    await waitForUploadSettled();

    expect(listener.mock.calls.length).toBeGreaterThan(0);
    expect(getBatchHandleSnapshot(batch).completedCount).toBe(2);
  });
});

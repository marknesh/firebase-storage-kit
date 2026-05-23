import { describe, expect, it, mock } from "bun:test";

import { StorageManager } from "../src/core/storage-manager";
import {
  createMockProvider,
  waitForUploadSettled,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

describe("StorageManager", () => {
  describe("uploadFile", () => {
    it("returns a handle and tracks upload state through success", async () => {
      const { provider } = createMockProvider({
        uploadBehavior: { type: "success", async: true },
      });
      const manager = new StorageManager(provider);
      const file = createTestFile("photo.jpg", "hello");

      const handle = manager.uploadFile(file, { path: "uploads/photo.jpg" });

      expect(handle.upload.status).toBe("uploading");
      expect(handle.upload.path).toBe("uploads/photo.jpg");
      expect(manager.getState().uploads).toHaveLength(1);
      expect(manager.getState().uploads[0]?.id).toBe(handle.upload.id);
      expect(manager.getState().uploads[0]?.path).toBe("uploads/photo.jpg");

      await waitForUploadSettled();

      expect(handle.upload.status).toBe("success");
      expect(handle.upload.downloadURL).toBe(
        "https://example.com/uploads/photo.jpg",
      );
      expect(handle.upload.progress).toBe(100);
    });
  });

  describe("uploadFiles", () => {
    it("creates a batch linked to child uploads", async () => {
      const { provider } = createMockProvider({
        uploadBehavior: { type: "success", async: true },
      });
      const manager = new StorageManager(provider);
      const files = [
        createTestFile("a.txt"),
        createTestFile("b.txt"),
        createTestFile("c.txt"),
      ];

      const batch = manager.uploadFiles(
        files,
        (file) => ({ path: `uploads/${file.name}` }),
        { concurrency: 2 },
      );

      expect(manager.getState().batches).toHaveLength(1);
      expect(manager.getState().batches[0]?.id).toBe(batch.id);
      expect(manager.getState().uploads).toHaveLength(3);
      expect(
        manager.getState().uploads.every((u) => u.batchId === batch.id),
      ).toBe(true);
      expect(manager.getState().uploads.map((u) => u.path)).toEqual([
        "uploads/a.txt",
        "uploads/b.txt",
        "uploads/c.txt",
      ]);

      await waitForUploadSettled();

      expect(batch.snapshot().completedCount).toBe(3);
      expect(batch.snapshot().failedCount).toBe(0);
    });
  });

  describe("subscribe", () => {
    it("notifies on changes but not on initial subscribe", async () => {
      const { provider } = createMockProvider({
        uploadBehavior: { type: "success", async: true },
      });
      const manager = new StorageManager(provider);
      const listener = mock(() => {});

      const unsubscribe = manager.subscribe(listener);
      expect(listener).not.toHaveBeenCalled();

      manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });
      expect(listener.mock.calls.length).toBeGreaterThan(0);

      const callsBefore = listener.mock.calls.length;
      unsubscribe();

      manager.uploadFile(createTestFile("b.txt"), { path: "uploads/b.txt" });
      await waitForUploadSettled();

      expect(listener.mock.calls.length).toBe(callsBefore);
    });

    it("passes current state to listeners on each change", async () => {
      const { provider } = createMockProvider({
        uploadBehavior: { type: "success", async: true },
      });
      const manager = new StorageManager(provider);
      const states: number[] = [];

      manager.subscribe((state) => {
        states.push(state.uploads.length);
      });

      manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });
      await waitForUploadSettled();

      expect(states).toContain(1);
      expect(states.at(-1)).toBe(1);
    });
  });

  describe("getState", () => {
    it("returns the same cached reference until the next change", () => {
      const { provider } = createMockProvider({
        uploadBehavior: { type: "manual" },
      });
      const manager = new StorageManager(provider);

      manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });

      const first = manager.getState();
      const second = manager.getState();
      expect(first).toBe(second);

      manager.uploadFile(createTestFile("b.txt"), { path: "uploads/b.txt" });

      const third = manager.getState();
      expect(third).not.toBe(first);
      expect(third.uploads).toHaveLength(2);
    });
  });

  describe("query delegation", () => {
    it("delegates exists to the provider", async () => {
      const { provider, spies } = createMockProvider({
        exists: async (path) => path === "uploads/exists.jpg",
      });
      const manager = new StorageManager(provider);

      await expect(manager.exists("uploads/exists.jpg")).resolves.toBe(true);
      await expect(manager.exists("uploads/missing.jpg")).resolves.toBe(false);
      expect(spies.exists).toHaveBeenCalledWith("uploads/exists.jpg");
      expect(spies.exists).toHaveBeenCalledWith("uploads/missing.jpg");
    });

    it("delegates delete to the provider", async () => {
      const { provider, spies } = createMockProvider();
      const manager = new StorageManager(provider);

      await manager.delete("uploads/old.jpg");

      expect(spies.delete).toHaveBeenCalledWith("uploads/old.jpg");
    });

    it("delegates getMetadata to the provider", async () => {
      const metadata = {
        path: "uploads/photo.jpg",
        size: 2048,
        contentType: "image/jpeg",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-02T00:00:00Z"),
      };
      const { provider, spies } = createMockProvider({
        getMetadata: async () => metadata,
      });
      const manager = new StorageManager(provider);

      await expect(manager.getMetadata("uploads/photo.jpg")).resolves.toEqual(
        metadata,
      );
      expect(spies.getMetadata).toHaveBeenCalledWith("uploads/photo.jpg");
    });

    it("delegates getDownloadURL to the provider", async () => {
      const { provider, spies } = createMockProvider({
        getDownloadURL: async (path) => `https://cdn.example/${path}`,
      });
      const manager = new StorageManager(provider);

      await expect(manager.getDownloadURL("uploads/photo.jpg")).resolves.toBe(
        "https://cdn.example/uploads/photo.jpg",
      );
      expect(spies.getDownloadURL).toHaveBeenCalledWith("uploads/photo.jpg");
    });

    it("propagates provider errors", async () => {
      const { provider } = createMockProvider({
        exists: async () => {
          throw new Error("network failure");
        },
      });
      const manager = new StorageManager(provider);

      await expect(manager.exists("uploads/photo.jpg")).rejects.toThrow(
        "network failure",
      );
    });
  });
});

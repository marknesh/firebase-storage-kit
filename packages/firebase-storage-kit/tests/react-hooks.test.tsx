import { beforeAll, describe, expect, it } from "bun:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { StorageManager } from "../src/core/storage-manager";
import {
  StorageManagerProvider,
  useBatch,
  useStorageState,
  useUpload,
} from "../src/react";
import {
  createMockProvider,
  waitForUploadSettled,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

beforeAll(() => {
  GlobalRegistrator.register();
});

describe("react hooks", () => {
  it("useStorageState reflects manager uploads", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);

    const { result } = renderHook(() => useStorageState(manager));

    expect(result.current.uploads).toHaveLength(0);

    act(() => {
      manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });
    });

    expect(result.current.uploads).toHaveLength(1);
    expect(result.current.uploads[0]?.status).toBe("uploading");

    await act(async () => {
      await waitForUploadSettled();
    });

    await waitFor(() => {
      expect(result.current.uploads[0]?.status).toBe("success");
    });
  });

  it("useStorageState reads from StorageManagerProvider", () => {
    const { provider } = createMockProvider({
      uploadBehavior: { async: false, type: "success" },
    });
    const manager = new StorageManager(provider);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <StorageManagerProvider manager={manager}>
        {children}
      </StorageManagerProvider>
    );

    const { result } = renderHook(() => useStorageState(), { wrapper });

    act(() => {
      manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });
    });

    expect(result.current.uploads).toHaveLength(1);
  });

  it("useUpload tracks a single handle", async () => {
    const { provider } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);

    const { result, rerender } = renderHook(
      ({
        handle,
      }: {
        handle: ReturnType<StorageManager["uploadFile"]> | null;
      }) => useUpload(handle),
      {
        initialProps: {
          handle: null as ReturnType<StorageManager["uploadFile"]> | null,
        },
      }
    );

    expect(result.current).toBeNull();

    let handle: ReturnType<StorageManager["uploadFile"]>;
    act(() => {
      handle = manager.uploadFile(createTestFile("a.txt"), {
        path: "uploads/a.txt",
      });
      rerender({ handle });
    });

    expect(result.current?.status).toBe("uploading");

    await act(async () => {
      await waitForUploadSettled();
    });

    await waitFor(() => {
      expect(result.current?.status).toBe("success");
      expect(result.current?.downloadURL).toBeDefined();
    });
  });

  it("useBatch tracks batch snapshot", () => {
    const { provider } = createMockProvider({
      uploadBehavior: { async: false, type: "success" },
    });
    const manager = new StorageManager(provider);

    let batch: ReturnType<StorageManager["uploadFiles"]>;
    const { result, rerender } = renderHook(
      ({ batch: b }: { batch: typeof batch | null }) => useBatch(b),
      { initialProps: { batch: null as typeof batch | null } }
    );

    act(() => {
      batch = manager.uploadFiles(
        [createTestFile("a.txt"), createTestFile("b.txt")],
        (_file, i) => ({ path: `uploads/${i}.txt` }),
        { concurrency: 2 }
      );
      rerender({ batch });
    });

    expect(result.current?.uploads).toHaveLength(2);
    expect(result.current?.completedCount).toBe(2);
  });
});

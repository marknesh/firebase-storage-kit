import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { memo } from "react";

import { StorageManager } from "../src/core/storage-manager";
import {
  StorageManagerProvider,
  useBatch,
  useStorageState,
  useUpload,
} from "../src/react";
import type { UploadItem } from "../src/types/upload";
import {
  createMockProvider,
  waitForMicrotasks,
  waitForUploadSettled,
} from "./helpers/mock-provider";
import { createTestFile } from "./helpers/test-file";

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

describe("react hooks", () => {
  it("memoized children re-render when an upload's progress changes", async () => {
    let reportProgress: ((sent: number, total: number) => void) | undefined;
    const { provider } = createMockProvider({
      uploadBehavior: {
        onStart: (_file, _options, callbacks) => {
          reportProgress = callbacks.onProgress;
        },
        type: "manual",
      },
    });
    const manager = new StorageManager(provider);

    const Row = memo(({ upload }: { upload: UploadItem }) => (
      <span data-testid="progress">{upload.progress}</span>
    ));
    const List = () => {
      const { uploads } = useStorageState(manager);
      return (
        <>
          {uploads.map((u) => (
            <Row key={u.id} upload={u} />
          ))}
        </>
      );
    };

    const view = render(<List />);
    await act(async () => {
      manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });
      await waitForMicrotasks();
    });

    act(() => {
      reportProgress?.(1, 4);
    });

    expect(view.getByTestId("progress").textContent).toBe("25");
    view.unmount();
  });

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

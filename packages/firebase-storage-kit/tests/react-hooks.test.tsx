import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";

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

// One upload that starts and then waits; reportProgress(sent) reports sent of 5 bytes.
const startManualUpload = async () => {
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
  manager.uploadFile(createTestFile("a.txt"), { path: "uploads/a.txt" });
  await waitForMicrotasks();
  return {
    manager,
    reportProgress: (sent: number) => reportProgress?.(sent, 5),
  };
};

const sameStatuses = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((status, i) => status === b[i]);

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

  describe("useStorageState with a selector", () => {
    it("skips re-renders when the selected value is unchanged", async () => {
      const { manager, reportProgress } = await startManualUpload();
      let renders = 0;
      const { result } = renderHook(() => {
        renders += 1;
        return useStorageState((s) => s.uploads.length, { manager });
      });
      expect(result.current).toBe(1);
      const rendersBefore = renders;

      act(() => {
        reportProgress(1);
        reportProgress(2);
        reportProgress(3);
      });
      expect(renders).toBe(rendersBefore);

      act(() => {
        manager.uploadFile(createTestFile("b.txt"), { path: "uploads/b.txt" });
      });
      expect(result.current).toBe(2);
    });

    it("re-renders when the selected value changes", async () => {
      const { manager, reportProgress } = await startManualUpload();
      const { result } = renderHook(() =>
        useStorageState((s) => s.uploads[0]?.progress, { manager })
      );

      act(() => {
        reportProgress(2);
      });

      expect(result.current).toBe(40);
    });

    it("uses isEqual to keep the previous value for equal selections", async () => {
      const { manager, reportProgress } = await startManualUpload();
      let renders = 0;
      const { result } = renderHook(() => {
        renders += 1;
        return useStorageState((s) => s.uploads.map((u) => u.status), {
          isEqual: sameStatuses,
          manager,
        });
      });
      const first = result.current;
      const rendersBefore = renders;

      act(() => {
        reportProgress(1);
        reportProgress(2);
      });

      expect(renders).toBe(rendersBefore);
      expect(result.current).toBe(first);
    });

    it("reads the manager from StorageManagerProvider", async () => {
      const { manager } = await startManualUpload();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <StorageManagerProvider manager={manager}>
          {children}
        </StorageManagerProvider>
      );

      const { result } = renderHook(
        () => useStorageState((s) => s.uploads.length),
        { wrapper }
      );

      expect(result.current).toBe(1);
    });
  });

  it("useStorageState subscribes once, not on every render", () => {
    const { provider } = createMockProvider({
      uploadBehavior: { onStart: () => {}, type: "manual" },
    });
    const manager = new StorageManager(provider);
    const subscribe = spyOn(manager, "subscribe");

    const { rerender } = renderHook(() => useStorageState(manager));
    rerender();
    rerender();

    expect(subscribe).toHaveBeenCalledTimes(1);
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

  it("useBatch re-renders when the batch is paused and resumed", () => {
    const { provider } = createMockProvider({
      uploadBehavior: { onStart: () => {}, type: "manual" },
    });
    const manager = new StorageManager(provider);
    const batch = manager.uploadFiles([createTestFile("a.txt")], (file) => ({
      path: `uploads/${file.name}`,
    }));
    const { result } = renderHook(() => useBatch(batch));
    expect(result.current?.uploads[0]?.status).toBe("uploading");

    act(() => {
      batch.pause();
    });
    expect(result.current?.uploads[0]?.status).toBe("paused");

    act(() => {
      batch.resume();
    });
    expect(result.current?.uploads[0]?.status).toBe("uploading");
  });
});

import { afterEach, describe, expect, it, mock } from "bun:test";

import { FirebaseStorageProvider } from "../src/providers/firebase-provider";
import {
  createTestFirebaseStorage,
  waitForMicrotasks,
} from "./helpers/mock-provider";

interface UploadSnapshot {
  bytesTransferred: number;
  totalBytes: number;
}

type ProgressHandler = (snapshot: UploadSnapshot) => void;

type UploadTaskOnHandler = (
  event: string,
  progress: ProgressHandler,
  error?: (err: Error) => void,
  complete?: () => void | Promise<void>
) => void;

const firebaseMocks = {
  deleteObject: mock(async () => {
    await Promise.resolve();
  }),
  getDownloadURL: mock(async () => {
    await Promise.resolve();
    return "https://cdn.example/file.jpg";
  }),
  getMetadata: mock(async () => {
    await Promise.resolve();
    return {
      contentType: "image/jpeg",
      customMetadata: { owner: "test" },
      size: 2048,
      timeCreated: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-02T00:00:00.000Z",
    };
  }),
  ref: mock((_storage: unknown, path: string) => ({ path })),
  uploadBytesResumable: mock(() => ({
    cancel: mock(() => {}),
    on: mock<UploadTaskOnHandler>((_event, progress, _error, complete) => {
      progress({ bytesTransferred: 10, totalBytes: 100 });
      if (complete) {
        void complete();
      }
    }),
    pause: mock(() => {}),
    resume: mock(() => {}),
  })),
};

void mock.module("firebase/storage", () => ({
  deleteObject: firebaseMocks.deleteObject,
  getDownloadURL: firebaseMocks.getDownloadURL,
  getMetadata: firebaseMocks.getMetadata,
  ref: firebaseMocks.ref,
  uploadBytesResumable: firebaseMocks.uploadBytesResumable,
}));

describe("FirebaseStorageProvider", () => {
  afterEach(() => {
    firebaseMocks.deleteObject.mockClear();
    firebaseMocks.getDownloadURL.mockClear();
    firebaseMocks.getMetadata.mockClear();
    firebaseMocks.ref.mockClear();
    firebaseMocks.uploadBytesResumable.mockClear();
  });

  const storage = createTestFirebaseStorage();
  const provider = new FirebaseStorageProvider(storage);

  describe("exists", () => {
    it("returns true when metadata exists", async () => {
      expect(await provider.exists("uploads/photo.jpg")).toBe(true);
      expect(firebaseMocks.getMetadata).toHaveBeenCalled();
    });

    it("returns false for object-not-found", async () => {
      firebaseMocks.getMetadata.mockImplementationOnce(async () => {
        await Promise.resolve();
        const error = Object.assign(new Error("not found"), {
          code: "storage/object-not-found",
        });
        throw error;
      });

      expect(await provider.exists("uploads/missing.jpg")).toBe(false);
    });

    it("rethrows other errors", async () => {
      firebaseMocks.getMetadata.mockImplementationOnce(async () => {
        await Promise.resolve();
        throw new Error("permission denied");
      });

      let caught: unknown;
      try {
        await provider.exists("uploads/forbidden.jpg");
      } catch (error) {
        caught = error;
      }
      expect(caught).toEqual(new Error("permission denied"));
    });
  });

  describe("delete", () => {
    it("calls deleteObject with the storage ref", async () => {
      await provider.delete("uploads/old.jpg");

      expect(firebaseMocks.ref).toHaveBeenCalledWith(
        storage,
        "uploads/old.jpg"
      );
      expect(firebaseMocks.deleteObject).toHaveBeenCalledWith({
        path: "uploads/old.jpg",
      });
    });
  });

  describe("getMetadata", () => {
    it("maps firebase metadata to FileMetadata", async () => {
      const metadata = await provider.getMetadata("uploads/photo.jpg");

      expect(metadata).toEqual({
        contentType: "image/jpeg",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        customMetadata: { owner: "test" },
        path: "uploads/photo.jpg",
        size: 2048,
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      });
    });
  });

  describe("upload", () => {
    it("wires progress and success through firebase task callbacks", async () => {
      const onProgress = mock(() => {});
      const onSuccess = mock(() => {});
      const onError = mock(() => {});
      const file = new File(["hello"], "hello.txt");

      const task = provider.upload(
        file,
        { path: "uploads/hello.txt" },
        { onError, onProgress, onSuccess }
      );

      await waitForMicrotasks();
      await waitForMicrotasks();

      expect(onProgress).toHaveBeenCalledWith(10, 100);
      expect(onSuccess).toHaveBeenCalledWith("https://cdn.example/file.jpg");
      expect(onError).not.toHaveBeenCalled();
      expect(typeof task.cancel).toBe("function");
      expect(typeof task.pause).toBe("function");
      expect(typeof task.resume).toBe("function");
    });

    it("calls onError when getDownloadURL fails after upload completes", async () => {
      firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => ({
        cancel: mock(() => {}),
        on: mock<UploadTaskOnHandler>((_event, progress, _error, complete) => {
          progress({ bytesTransferred: 100, totalBytes: 100 });
          if (complete) {
            void complete();
          }
        }),
        pause: mock(() => {}),
        resume: mock(() => {}),
      }));
      firebaseMocks.getDownloadURL.mockImplementationOnce(async () => {
        await Promise.resolve();
        throw new Error("url failed");
      });

      const onError = mock(() => {});
      provider.upload(
        new File(["hello"], "hello.txt"),
        { path: "uploads/hello.txt" },
        {
          onError,
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
        }
      );

      await waitForMicrotasks();
      await waitForMicrotasks();

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("delegates cancel to the firebase task", () => {
      const cancel = mock(() => {});

      firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => ({
        cancel,
        on: mock(() => {}),
        pause: mock(() => {}),
        resume: mock(() => {}),
      }));

      const task = provider.upload(
        new File(["hello"], "hello.txt"),
        { path: "uploads/hello.txt" },
        {
          onError: mock(() => {}),
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
        }
      );

      task.cancel();

      expect(cancel).toHaveBeenCalled();
    });

    it("passes customMetadata to uploadBytesResumable", async () => {
      const file = new File(["hello"], "hello.txt");

      provider.upload(
        file,
        {
          customMetadata: { owner: "user-123", source: "web" },
          path: "uploads/hello.txt",
        },
        {
          onError: mock(() => {}),
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
        }
      );

      await Promise.resolve();

      expect(firebaseMocks.uploadBytesResumable).toHaveBeenCalledWith(
        { path: "uploads/hello.txt" },
        file,
        {
          customMetadata: { owner: "user-123", source: "web" },
        }
      );
    });

    it("omits metadata when customMetadata is not provided", async () => {
      const file = new File(["hello"], "hello.txt");

      provider.upload(
        file,
        { path: "uploads/hello.txt" },
        {
          onError: mock(() => {}),
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
        }
      );

      await Promise.resolve();

      expect(firebaseMocks.uploadBytesResumable).toHaveBeenCalledWith(
        { path: "uploads/hello.txt" },
        file,
        undefined
      );
    });

    it("delegates pause and resume to the firebase task", () => {
      const pause = mock(() => {});
      const resume = mock(() => {});

      firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => ({
        cancel: mock(() => {}),
        on: mock(() => {}),
        pause,
        resume,
      }));

      const task = provider.upload(
        new File(["hello"], "hello.txt"),
        { path: "uploads/hello.txt" },
        {
          onError: mock(() => {}),
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
        }
      );

      task.pause?.();
      task.resume?.();

      expect(pause).toHaveBeenCalled();
      expect(resume).toHaveBeenCalled();
    });
  });
});

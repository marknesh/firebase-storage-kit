import { afterEach, describe, expect, it, mock } from "bun:test";

import { FirebaseStorageProvider } from "../src/providers/firebase-provider";

type UploadSnapshot = {
  bytesTransferred: number;
  totalBytes: number;
};

type ProgressHandler = (snapshot: UploadSnapshot) => void;

type UploadTaskOnHandler = (
  event: string,
  progress: ProgressHandler,
  error?: (err: Error) => void,
  complete?: () => void | Promise<void>,
) => void;

const firebaseMocks = {
  deleteObject: mock(async () => {}),
  getDownloadURL: mock(async () => "https://cdn.example/file.jpg"),
  getMetadata: mock(async () => ({
    size: 2048,
    contentType: "image/jpeg",
    timeCreated: "2024-01-01T00:00:00.000Z",
    updated: "2024-01-02T00:00:00.000Z",
    customMetadata: { owner: "test" },
  })),
  ref: mock((_storage: unknown, path: string) => ({ path })),
  uploadBytesResumable: mock(() => ({
    on: mock<UploadTaskOnHandler>((_event, progress, _error, complete) => {
      progress({ bytesTransferred: 10, totalBytes: 100 });
      if (complete) {
        void complete();
      }
    }),
    cancel: mock(() => {}),
    pause: mock(() => {}),
    resume: mock(() => {}),
  })),
};

mock.module("firebase/storage", () => ({
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

  const storage = {} as import("firebase/storage").FirebaseStorage;
  const provider = new FirebaseStorageProvider(storage);

  describe("exists", () => {
    it("returns true when metadata exists", async () => {
      await expect(provider.exists("uploads/photo.jpg")).resolves.toBe(true);
      expect(firebaseMocks.getMetadata).toHaveBeenCalled();
    });

    it("returns false for object-not-found", async () => {
      firebaseMocks.getMetadata.mockImplementationOnce(async () => {
        const error = new Error("not found") as Error & { code: string };
        error.code = "storage/object-not-found";
        throw error;
      });

      await expect(provider.exists("uploads/missing.jpg")).resolves.toBe(false);
    });

    it("rethrows other errors", async () => {
      firebaseMocks.getMetadata.mockImplementationOnce(async () => {
        throw new Error("permission denied");
      });

      await expect(provider.exists("uploads/forbidden.jpg")).rejects.toThrow(
        "permission denied",
      );
    });
  });

  describe("delete", () => {
    it("calls deleteObject with the storage ref", async () => {
      await provider.delete("uploads/old.jpg");

      expect(firebaseMocks.ref).toHaveBeenCalledWith(
        storage,
        "uploads/old.jpg",
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
        path: "uploads/photo.jpg",
        size: 2048,
        contentType: "image/jpeg",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
        customMetadata: { owner: "test" },
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
        { onProgress, onSuccess, onError },
      );

      await Promise.resolve();

      expect(onProgress).toHaveBeenCalledWith(10, 100);
      expect(onSuccess).toHaveBeenCalledWith("https://cdn.example/file.jpg");
      expect(onError).not.toHaveBeenCalled();
      expect(task.cancel).toBeDefined();
      expect(task.pause).toBeDefined();
      expect(task.resume).toBeDefined();
    });

    it("calls onError when getDownloadURL fails after upload completes", async () => {
      firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => ({
        on: mock<UploadTaskOnHandler>((_event, progress, _error, complete) => {
          progress({ bytesTransferred: 100, totalBytes: 100 });
          if (complete) {
            void complete();
          }
        }),
        cancel: mock(() => {}),
        pause: mock(() => {}),
        resume: mock(() => {}),
      }));
      firebaseMocks.getDownloadURL.mockImplementationOnce(async () => {
        throw new Error("url failed");
      });

      const onError = mock(() => {});
      provider.upload(
        new File(["hello"], "hello.txt"),
        { path: "uploads/hello.txt" },
        {
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
          onError,
        },
      );

      await Promise.resolve();

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("delegates cancel to the firebase task", () => {
      const cancel = mock(() => {});

      firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => ({
        on: mock(() => {}),
        cancel,
        pause: mock(() => {}),
        resume: mock(() => {}),
      }));

      const task = provider.upload(
        new File(["hello"], "hello.txt"),
        { path: "uploads/hello.txt" },
        {
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
          onError: mock(() => {}),
        },
      );

      task.cancel();

      expect(cancel).toHaveBeenCalled();
    });

    it("delegates pause and resume to the firebase task", () => {
      const pause = mock(() => {});
      const resume = mock(() => {});

      firebaseMocks.uploadBytesResumable.mockImplementationOnce(() => ({
        on: mock(() => {}),
        cancel: mock(() => {}),
        pause,
        resume,
      }));

      const task = provider.upload(
        new File(["hello"], "hello.txt"),
        { path: "uploads/hello.txt" },
        {
          onProgress: mock(() => {}),
          onSuccess: mock(() => {}),
          onError: mock(() => {}),
        },
      );

      task.pause?.();
      task.resume?.();

      expect(pause).toHaveBeenCalled();
      expect(resume).toHaveBeenCalled();
    });
  });
});

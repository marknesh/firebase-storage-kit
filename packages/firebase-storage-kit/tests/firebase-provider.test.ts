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
  list: mock(
    async (): Promise<{
      items: { fullPath: string; name: string }[];
      nextPageToken?: string;
      prefixes: { fullPath: string }[];
    }> => {
      await Promise.resolve();
      return {
        items: [{ fullPath: "images/photo.jpg", name: "photo.jpg" }],
        nextPageToken: "token-2",
        prefixes: [{ fullPath: "images/thumbnails/" }],
      };
    }
  ),
  listAll: mock(async () => {
    await Promise.resolve();
    return {
      items: [{ fullPath: "images/photo.jpg", name: "photo.jpg" }],
      prefixes: [{ fullPath: "images/thumbnails/" }],
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
  list: firebaseMocks.list,
  listAll: firebaseMocks.listAll,
  ref: firebaseMocks.ref,
  uploadBytesResumable: firebaseMocks.uploadBytesResumable,
}));

describe("FirebaseStorageProvider", () => {
  afterEach(() => {
    firebaseMocks.deleteObject.mockClear();
    firebaseMocks.getDownloadURL.mockClear();
    firebaseMocks.getMetadata.mockClear();
    firebaseMocks.list.mockClear();
    firebaseMocks.listAll.mockClear();
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

  describe("list", () => {
    it("maps firebase list result and forwards options", async () => {
      const result = await provider.list("images/", {
        maxResults: 100,
        pageToken: "token-1",
      });

      expect(firebaseMocks.ref).toHaveBeenCalledWith(storage, "images/");
      expect(firebaseMocks.list).toHaveBeenCalledWith(
        { path: "images/" },
        { maxResults: 100, pageToken: "token-1" }
      );
      expect(result).toEqual({
        items: [{ name: "photo.jpg", path: "images/photo.jpg" }],
        nextPageToken: "token-2",
        prefixes: ["images/thumbnails/"],
      });
    });

    it("omits nextPageToken when firebase does not return one", async () => {
      firebaseMocks.list.mockImplementationOnce(async () => {
        await Promise.resolve();
        return {
          items: [],
          prefixes: [],
        };
      });

      const result = await provider.list("images/");

      expect(result.nextPageToken).toBeUndefined();
    });
  });

  describe("listAll", () => {
    it("maps firebase listAll result", async () => {
      const result = await provider.listAll("images/");

      expect(firebaseMocks.ref).toHaveBeenCalledWith(storage, "images/");
      expect(firebaseMocks.listAll).toHaveBeenCalledWith({ path: "images/" });
      expect(result).toEqual({
        items: [{ name: "photo.jpg", path: "images/photo.jpg" }],
        prefixes: ["images/thumbnails/"],
      });
      expect(result.nextPageToken).toBeUndefined();
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

    it("passes contentType to uploadBytesResumable", async () => {
      const file = new File(["hello"], "hello.txt");

      provider.upload(
        file,
        {
          contentType: "image/jpeg",
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
          contentType: "image/jpeg",
        }
      );
    });

    it("passes contentType and customMetadata together", async () => {
      const file = new File(["hello"], "hello.txt");

      provider.upload(
        file,
        {
          contentType: "image/jpeg",
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
          contentType: "image/jpeg",
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

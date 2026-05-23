import { describe, expect, it, mock } from "bun:test";

import { UploadHandle } from "../src/core/upload-handle";
import type { UploadItem } from "../src/types/upload";

function createHandle(upload?: Partial<UploadItem>): UploadHandle {
  const item: UploadItem = {
    id: "upload-1",
    file: new File(["hello"], "hello.txt"),
    path: "uploads/hello.txt",
    progress: 0,
    bytesTransferred: 0,
    totalBytes: 5,
    status: "queued",
    ...upload,
  };
  return new UploadHandle(item, mock(() => {}));
}

describe("UploadHandle", () => {
  describe("progress", () => {
    it("updates progress and emits progress events", () => {
      const handle = createHandle({ status: "uploading" });
      const onProgress = mock(() => {});

      handle.on("progress", onProgress);
      handle._reportProgress(2, 5);

      expect(handle.upload.bytesTransferred).toBe(2);
      expect(handle.upload.totalBytes).toBe(5);
      expect(handle.upload.progress).toBe(40);
      expect(onProgress).toHaveBeenCalledWith(handle.upload);
    });

    it("keeps progress at 0 when totalBytes is 0", () => {
      const handle = createHandle({ status: "uploading", totalBytes: 0 });

      handle._reportProgress(0, 0);

      expect(handle.upload.progress).toBe(0);
    });
  });

  describe("success", () => {
    it("sets downloadURL, progress, and emits success", () => {
      const handle = createHandle({ status: "uploading" });
      const onSuccess = mock(() => {});

      handle.on("success", onSuccess);
      handle._reportSuccess("https://example.com/file.txt");

      expect(handle.upload.status).toBe("success");
      expect(handle.upload.downloadURL).toBe("https://example.com/file.txt");
      expect(handle.upload.progress).toBe(100);
      expect(onSuccess).toHaveBeenCalledWith(handle.upload);
    });
  });

  describe("error", () => {
    it("sets error and emits error", () => {
      const handle = createHandle({ status: "uploading" });
      const onError = mock(() => {});
      const error = new Error("upload failed");

      handle.on("error", onError);
      handle._reportError(error);

      expect(handle.upload.status).toBe("error");
      expect(handle.upload.error).toBe(error);
      expect(onError).toHaveBeenCalledWith(handle.upload);
    });
  });

  describe("cancel", () => {
    it("calls task.cancel and emits canceled", () => {
      const handle = createHandle({ status: "uploading" });
      const cancel = mock(() => {});
      handle._attachTask({ cancel });
      const onCanceled = mock(() => {});

      handle.on("canceled", onCanceled);
      handle.cancel();

      expect(cancel).toHaveBeenCalled();
      expect(handle.upload.status).toBe("canceled");
      expect(onCanceled).toHaveBeenCalledWith(handle.upload);
    });
  });

  describe("pause and resume", () => {
    it("pauses only while uploading", () => {
      const handle = createHandle({ status: "uploading" });
      const pause = mock(() => {});
      const resume = mock(() => {});
      handle._attachTask({ cancel: mock(() => {}), pause, resume });

      handle.pause();
      expect(pause).toHaveBeenCalled();
      expect(handle.upload.status).toBe("paused");

      handle.pause();
      expect(pause).toHaveBeenCalledTimes(1);
    });

    it("resumes only while paused", () => {
      const handle = createHandle({ status: "paused" });
      const resume = mock(() => {});
      handle._attachTask({ cancel: mock(() => {}), resume });

      handle.resume();
      expect(resume).toHaveBeenCalled();
      expect(handle.upload.status).toBe("uploading");

      handle.resume();
      expect(resume).toHaveBeenCalledTimes(1);
    });

    it("does not pause or resume after success", () => {
      const handle = createHandle({ status: "uploading" });
      const pause = mock(() => {});
      const resume = mock(() => {});
      handle._attachTask({ cancel: mock(() => {}), pause, resume });

      handle._reportSuccess("https://example.com/file.txt");
      handle.pause();
      handle.resume();

      expect(pause).not.toHaveBeenCalled();
      expect(resume).not.toHaveBeenCalled();
    });

    it("does not pause or resume after cancel", () => {
      const handle = createHandle({ status: "uploading" });
      const pause = mock(() => {});
      const resume = mock(() => {});
      handle._attachTask({ cancel: mock(() => {}), pause, resume });

      handle.cancel();
      handle.pause();
      handle.resume();

      expect(pause).not.toHaveBeenCalled();
      expect(resume).not.toHaveBeenCalled();
    });
  });

  describe("terminal guard", () => {
    it("ignores late progress and error after success", () => {
      const handle = createHandle({ status: "uploading" });
      const onProgress = mock(() => {});
      const onError = mock(() => {});

      handle.on("progress", onProgress);
      handle.on("error", onError);
      handle._reportSuccess("https://example.com/file.txt");
      handle._reportProgress(1, 5);
      handle._reportError(new Error("late error"));

      expect(onProgress).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(handle.upload.progress).toBe(100);
      expect(handle.upload.status).toBe("success");
    });
  });
});

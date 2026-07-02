import { describe, expect, it, mock, spyOn } from "bun:test";

import { StorageManager } from "../src/core/storage-manager";
import * as validation from "../src/core/validation";
import {
  getFileExtension,
  validateImageDimensionLimits,
  validateUpload,
  validateUploadSync,
  ValidationError,
} from "../src/core/validation";
import {
  createMockProvider,
  waitForMicrotasks,
  waitForUploadSettled,
} from "./helpers/mock-provider";

const createTypedFile = (name: string, content: string, type: string): File =>
  new File([content], name, { type });

describe("validation utilities", () => {
  it("getFileExtension returns a lowercase extension with dot", () => {
    expect(getFileExtension("photo.JPG")).toBe(".jpg");
    expect(getFileExtension("no-extension")).toBe("");
  });

  it("validateUploadSync rejects oversized files", () => {
    const file = createTypedFile(
      "big.bin",
      "x".repeat(20),
      "application/octet-stream"
    );
    const error = validateUploadSync(file, { maxSizeBytes: 10 });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error?.message).toContain("exceeds maximum");
  });

  it("validateUploadSync rejects disallowed MIME types", () => {
    const file = createTypedFile("doc.pdf", "pdf", "application/pdf");
    const error = validateUploadSync(file, {
      allowedMimeTypes: ["image/jpeg", "image/png"],
    });
    expect(error?.name).toBe("ValidationError");
    expect(error?.message).toContain("application/pdf");
  });

  it("validateUploadSync rejects disallowed extensions", () => {
    const file = createTypedFile("photo.gif", "gif", "image/gif");
    const error = validateUploadSync(file, {
      allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
    });
    expect(error?.message).toContain(".gif");
  });

  it("validateUploadSync accepts matching rules", () => {
    const file = createTypedFile("photo.jpg", "jpg", "image/jpeg");
    expect(
      validateUploadSync(file, {
        allowedExtensions: [".jpg"],
        allowedMimeTypes: ["image/jpeg"],
        maxSizeBytes: 1024,
      })
    ).toBeNull();
  });

  it("validateImageDimensionLimits rejects oversized dimensions", () => {
    const error = validateImageDimensionLimits(
      { height: 5000, width: 3000 },
      { maxImageHeight: 4096, maxImageWidth: 4096 }
    );
    expect(error?.message).toContain("height");
  });
});

describe("image dimension validation", () => {
  it("validateImageDimensions uses readImageDimensions", async () => {
    const readImageDimensions = spyOn(
      validation,
      "readImageDimensions"
    ).mockResolvedValue({ height: 1, width: 1 });

    const file = createTypedFile("photo.png", "png", "image/png");
    const error = await validation.validateImageDimensions(file, {
      maxImageHeight: 4096,
      maxImageWidth: 4096,
    });

    expect(error).toBeNull();
    expect(readImageDimensions).toHaveBeenCalledWith(file);
    readImageDimensions.mockRestore();
  });

  it("validateUpload runs sync and async checks together", async () => {
    const readImageDimensions = spyOn(
      validation,
      "readImageDimensions"
    ).mockResolvedValue({ height: 100, width: 100 });

    const file = createTypedFile("photo.png", "png", "image/png");
    expect(
      await validateUpload(file, {
        allowedExtensions: [".png"],
        allowedMimeTypes: ["image/png"],
        maxImageHeight: 4096,
        maxImageWidth: 4096,
        maxSizeBytes: 1024,
      })
    ).toBeNull();

    readImageDimensions.mockRestore();
  });
});

describe("upload validation integration", () => {
  it("rejects invalid files before the provider upload starts", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);
    const file = createTypedFile("big.pdf", "x".repeat(100), "application/pdf");
    const onError = mock(() => {});

    const handle = manager.uploadFile(file, {
      path: `uploads/${file.name}`,
      validate: {
        allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        maxSizeBytes: 10,
      },
    });

    handle.on("error", onError);

    await waitForMicrotasks();

    expect(handle.upload.status).toBe("error");
    expect(handle.upload.error?.name).toBe("ValidationError");
    expect(spies.upload).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it("uploads when validation passes", async () => {
    const { provider, spies } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);
    const file = createTypedFile("photo.jpg", "jpg", "image/jpeg");

    const handle = manager.uploadFile(file, {
      path: `uploads/${file.name}`,
      validate: {
        allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        maxSizeBytes: 10 * 1024 * 1024,
      },
    });

    await waitForUploadSettled();

    expect(handle.upload.status).toBe("success");
    expect(spies.upload).toHaveBeenCalled();
  });

  it("validates image dimensions before upload", async () => {
    const readImageDimensions = spyOn(
      validation,
      "readImageDimensions"
    ).mockResolvedValue({ height: 5000, width: 3000 });

    const { provider, spies } = createMockProvider({
      uploadBehavior: { async: true, type: "success" },
    });
    const manager = new StorageManager(provider);
    const file = createTypedFile("photo.png", "png", "image/png");

    const handle = manager.uploadFile(file, {
      path: `uploads/${file.name}`,
      validate: {
        allowedExtensions: [".png"],
        allowedMimeTypes: ["image/png"],
        maxImageHeight: 4096,
        maxImageWidth: 4096,
      },
    });

    await waitForUploadSettled();

    expect(handle.upload.status).toBe("error");
    expect(handle.upload.error?.name).toBe("ValidationError");
    expect(handle.upload.error?.message).toContain("height");
    expect(spies.upload).not.toHaveBeenCalled();

    readImageDimensions.mockRestore();
  });
});

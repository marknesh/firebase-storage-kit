import type { UploadValidationOptions } from "../types/provider";

export const VALIDATION_ERROR_CODES = {
  extensionNotAllowed: "validation/extension-not-allowed",
  fileTooLarge: "validation/file-too-large",
  imageDimensionUnavailable: "validation/image-dimension-unavailable",
  imageDimensionsUnreadable: "validation/image-dimensions-unreadable",
  imageHeightTooLarge: "validation/image-height-too-large",
  imageWidthTooLarge: "validation/image-width-too-large",
  mimeTypeNotAllowed: "validation/mime-type-not-allowed",
} as const;

export type ValidationErrorCode =
  (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];

export class ValidationError extends Error {
  override readonly name = "ValidationError";
  readonly code: ValidationErrorCode;

  constructor(message: string, code: ValidationErrorCode) {
    super(message);
    this.code = code;
  }
}

export interface ImageDimensions {
  width: number;
  height: number;
}

const normalizeExtension = (extension: string): string => {
  const lower = extension.toLowerCase();
  return lower.startsWith(".") ? lower : `.${lower}`;
};

export const getFileExtension = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) {
    return "";
  }
  return fileName.slice(dot).toLowerCase();
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
};

const isImageFile = (file: File): boolean => file.type.startsWith("image/");

export const needsImageDimensionValidation = (
  options: UploadValidationOptions
): boolean =>
  options.maxImageWidth !== undefined || options.maxImageHeight !== undefined;

/** Synchronous checks: size, MIME type, and extension. */
export const validateUploadSync = (
  file: File,
  options: UploadValidationOptions
): ValidationError | null => {
  if (options.maxSizeBytes !== undefined && file.size > options.maxSizeBytes) {
    return new ValidationError(
      `File size ${formatBytes(file.size)} exceeds maximum of ${formatBytes(options.maxSizeBytes)}`,
      VALIDATION_ERROR_CODES.fileTooLarge
    );
  }

  if (options.allowedMimeTypes !== undefined) {
    const allowed = options.allowedMimeTypes.map((type) => type.toLowerCase());
    const mime = file.type.toLowerCase();
    if (!allowed.includes(mime)) {
      return new ValidationError(
        `File type ${file.type || "(unknown)"} is not allowed`,
        VALIDATION_ERROR_CODES.mimeTypeNotAllowed
      );
    }
  }

  if (options.allowedExtensions !== undefined) {
    const extension = getFileExtension(file.name);
    const allowed = options.allowedExtensions.map(normalizeExtension);
    if (!allowed.includes(extension)) {
      return new ValidationError(
        `File extension ${extension || "(none)"} is not allowed`,
        VALIDATION_ERROR_CODES.extensionNotAllowed
      );
    }
  }

  return null;
};

export const readImageDimensions = async (
  file: File
): Promise<ImageDimensions> => {
  if (typeof createImageBitmap === "undefined") {
    throw new ValidationError(
      "Image dimension validation is not available",
      VALIDATION_ERROR_CODES.imageDimensionUnavailable
    );
  }

  const bitmap = await createImageBitmap(file);
  const dimensions = {
    height: bitmap.height,
    width: bitmap.width,
  };
  bitmap.close();
  return dimensions;
};

/** Checks width/height against configured limits. */
export const validateImageDimensionLimits = (
  dimensions: ImageDimensions,
  options: UploadValidationOptions
): ValidationError | null => {
  if (
    options.maxImageWidth !== undefined &&
    dimensions.width > options.maxImageWidth
  ) {
    return new ValidationError(
      `Image width ${dimensions.width}px exceeds maximum of ${options.maxImageWidth}px`,
      VALIDATION_ERROR_CODES.imageWidthTooLarge
    );
  }

  if (
    options.maxImageHeight !== undefined &&
    dimensions.height > options.maxImageHeight
  ) {
    return new ValidationError(
      `Image height ${dimensions.height}px exceeds maximum of ${options.maxImageHeight}px`,
      VALIDATION_ERROR_CODES.imageHeightTooLarge
    );
  }

  return null;
};

/** Async image dimension checks. Skipped for non-image files. */
export const validateImageDimensions = async (
  file: File,
  options: UploadValidationOptions
): Promise<ValidationError | null> => {
  if (!needsImageDimensionValidation(options)) {
    return null;
  }

  if (!isImageFile(file)) {
    return null;
  }

  let dimensions: ImageDimensions;
  try {
    dimensions = await readImageDimensions(file);
  } catch (error) {
    if (error instanceof ValidationError) {
      return error;
    }
    return new ValidationError(
      "Unable to read image dimensions",
      VALIDATION_ERROR_CODES.imageDimensionsUnreadable
    );
  }

  return validateImageDimensionLimits(dimensions, options);
};

/** Runs all upload validation rules. Returns the first error, if any. */
export const validateUpload = async (
  file: File,
  options: UploadValidationOptions | undefined
): Promise<ValidationError | null> => {
  if (!options) {
    return null;
  }

  const syncError = validateUploadSync(file, options);
  if (syncError) {
    return syncError;
  }

  return await validateImageDimensions(file, options);
};

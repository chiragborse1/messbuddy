export const DEFAULT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const DEFAULT_MAX_IMAGE_SIZE_MB = 5;

export type UploadValidationCode =
  | "missing_file"
  | "invalid_type"
  | "file_too_large";

export type UploadValidationResult =
  | { ok: true; file: File }
  | { ok: false; code: UploadValidationCode; error: string };

export interface ImageValidationOptions {
  allowedMimeTypes?: readonly string[];
  maxSizeMB?: number;
}

const formatMimeTypes = (mimeTypes: readonly string[]) =>
  mimeTypes
    .map((mimeType) => mimeType.split("/")[1]?.toUpperCase() ?? mimeType)
    .join(", ");

export const validateImageFile = (
  file: File | null | undefined,
  options: ImageValidationOptions = {},
): UploadValidationResult => {
  const allowedMimeTypes = options.allowedMimeTypes ?? DEFAULT_IMAGE_MIME_TYPES;
  const maxSizeMB = options.maxSizeMB ?? DEFAULT_MAX_IMAGE_SIZE_MB;

  if (!file) {
    return {
      ok: false,
      code: "missing_file",
      error: "Please select an image file.",
    };
  }

  if (!allowedMimeTypes.includes(file.type)) {
    return {
      ok: false,
      code: "invalid_type",
      error: `Please select a ${formatMimeTypes(allowedMimeTypes)} image.`,
    };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      ok: false,
      code: "file_too_large",
      error: `Image must be ${maxSizeMB} MB or smaller.`,
    };
  }

  return { ok: true, file };
};

export const getImageValidationError = (
  file: File | null | undefined,
  options: ImageValidationOptions = {},
) => {
  const result = validateImageFile(file, options);
  if (result.ok === false) return result.error;
  return null;
};

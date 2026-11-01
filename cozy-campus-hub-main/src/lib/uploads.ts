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
export const compressImageFile = async (
  file: File,
  options: { maxWidth?: number; maxHeight?: number; quality?: number; mimeType?: string } = {},
): Promise<File> => {
  const maxWidth = options.maxWidth ?? 1280;
  const maxHeight = options.maxHeight ?? 1280;
  const quality = options.quality ?? 0.8;
  const mimeType = options.mimeType ?? "image/jpeg";

  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const ext = mimeType === "image/png" ? "png" : "jpg";
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, `.${ext}`), { type: mimeType }));
        },
        mimeType,
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
};

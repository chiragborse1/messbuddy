import { describe, expect, it } from "vitest";
import { getImageValidationError, validateImageFile } from "./uploads";

describe("uploads", () => {
  it("accepts supported image files", () => {
    const file = new File(["receipt"], "receipt.png", { type: "image/png" });
    const result = validateImageFile(file);

    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.file).toBe(file);
  });

  it("rejects unsupported MIME types", () => {
    const file = new File(["not-image"], "receipt.pdf", {
      type: "application/pdf",
    });
    const result = validateImageFile(file);

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("invalid_type");
      expect(result.error).toContain("JPEG");
    }
  });

  it("rejects images larger than the configured limit", () => {
    const file = new File(["xx"], "receipt.jpg", { type: "image/jpeg" });
    const result = validateImageFile(file, { maxSizeMB: 0.000001 });

    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("file_too_large");
  });

  it("can return a string error for callers that do not need details", () => {
    const file = new File(["avatar"], "avatar.gif", { type: "image/gif" });

    expect(getImageValidationError(file)).toContain("image");
    expect(
      getImageValidationError(
        new File(["avatar"], "avatar.webp", { type: "image/webp" }),
      ),
    ).toBeNull();
  });
});

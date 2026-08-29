import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";

const HTTP_URL_REGEX = /^https?:\/\//i;

type StorageCtx = {
  storage: {
    getUrl(storageId: Id<"_storage">): Promise<string | null>;
  };
};

export function isHttpUrl(value: string): boolean {
  return HTTP_URL_REGEX.test(value);
}

/**
 * Resolves a stored image reference — either an external http(s) URL or a
 * Convex file-storage ID — into a URL the client can render. Returns null
 * for missing or unreadable files so callers fall back to initials.
 */
export async function resolveImageUrl(
  ctx: StorageCtx,
  image: string | null | undefined,
): Promise<string | null> {
  if (!image) return null;
  if (isHttpUrl(image)) return image;
  try {
    return await ctx.storage.getUrl(image as Id<"_storage">);
  } catch {
    return null;
  }
}

/**
 * Validates an image reference coming from the client: either an http(s)
 * URL or the storage ID of a previously uploaded file. Returns the value
 * to persist verbatim (the URL, or the storage ID — it is resolved to a
 * signed URL at read time, so expiring URLs are never stored).
 */
export async function assertImageRef(
  ctx: StorageCtx,
  value: string,
): Promise<string> {
  const ref = value.trim();
  if (ref.length === 0) {
    throw new ConvexError("Invalid image reference");
  }
  if (isHttpUrl(ref)) {
    if (ref.length > 2048) {
      throw new ConvexError("Image URL must be at most 2048 characters");
    }
    return ref;
  }
  let url: string | null;
  try {
    url = await ctx.storage.getUrl(ref as Id<"_storage">);
  } catch {
    throw new ConvexError("Invalid image reference");
  }
  if (url === null) {
    throw new ConvexError("Uploaded image not found");
  }
  return ref;
}

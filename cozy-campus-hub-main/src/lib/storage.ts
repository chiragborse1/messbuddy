import { supabase } from "@/lib/supabase";

const SIGNED_URL_TTL_SECONDS = 60 * 15;
const SIGNED_URL_REFRESH_BUFFER_MS = 30 * 1000;

type SignedUrlCacheEntry = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

export const getStorageObjectPath = (value: string | null | undefined, bucket: string) => {
  const rawValue = value?.trim();
  if (!rawValue) return null;

  if (!/^https?:\/\//i.test(rawValue)) {
    const prefix = `${bucket}/`;
    return rawValue.startsWith(prefix) ? rawValue.slice(prefix.length) : rawValue.replace(/^\/+/, "");
  }

  try {
    const url = new URL(rawValue);
    const decodedPath = decodeURIComponent(url.pathname);
    const storagePrefixes = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];

    for (const prefix of storagePrefixes) {
      const index = decodedPath.indexOf(prefix);
      if (index >= 0) {
        return decodedPath.slice(index + prefix.length);
      }
    }
  } catch {
    return null;
  }

  return null;
};

export const getSignedStorageUrl = async (
  bucket: string,
  pathOrUrl: string | null | undefined,
) => {
  const rawValue = pathOrUrl?.trim();
  if (!rawValue) return null;

  const objectPath = getStorageObjectPath(rawValue, bucket);
  if (!objectPath) return rawValue;

  const cacheKey = `${bucket}:${objectPath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + SIGNED_URL_REFRESH_BUFFER_MS) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    if (/^https?:\/\//i.test(rawValue)) return rawValue;

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return publicData.publicUrl;
  }

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  });

  return data.signedUrl;
};

export const getPaymentReceiptPath = (value: string | null | undefined) =>
  getStorageObjectPath(value, "payment_receipts");

export const getPaymentReceiptUrl = (value: string | null | undefined) =>
  getSignedStorageUrl("payment_receipts", value);

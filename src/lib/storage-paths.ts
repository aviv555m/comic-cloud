export type StorageBucket = 'book-files' | 'book-covers';

export interface StorageReference {
  bucket: StorageBucket;
  relativePath: string;
  fullPath: string;
}

export function parseStorageReference(
  value: string | null | undefined,
  preferredBucket?: StorageBucket
): StorageReference | null {
  if (!value) return null;
  const source = String(value);

  const buckets: StorageBucket[] = preferredBucket
    ? [preferredBucket]
    : ['book-files', 'book-covers'];

  for (const bucket of buckets) {
    if (source.includes('/local-file-route/')) {
      const encoded = source.split('/local-file-route/').pop()?.split('?')[0];
      if (!encoded) continue;
      const decoded = decodeURIComponent(encoded);
      if (decoded.startsWith(`${bucket}/`)) {
        const relativePath = decoded.slice(`${bucket}/`.length);
        return { bucket, relativePath, fullPath: decoded };
      }
    }

    if (source.includes('/uploads/')) {
      const decoded = decodeURIComponent(source.split('/uploads/').pop()?.split('?')[0] || '');
      if (decoded.startsWith(`${bucket}/`)) {
        const relativePath = decoded.slice(`${bucket}/`.length);
        return { bucket, relativePath, fullPath: decoded };
      }
    }

    if (source.includes(`${bucket}/`)) {
      const suffix = decodeURIComponent(source.split(`${bucket}/`).pop()?.split('?')[0] || '');
      if (!suffix) continue;
      return { bucket, relativePath: suffix, fullPath: `${bucket}/${suffix}` };
    }
  }

  return null;
}

/**
 * Canonical public media URL construction shared by every projection that
 * renders Media object keys, and the only place client-visible URLs are built
 * from object keys. Object keys are never exposed directly.
 */

export type PublicMediaRenditionUrlInfo = {
  objectKey: string;
  width: number;
  height: number;
};

export function publicMediaUrl(origin: string, objectKey: string): string {
  return `${origin.replace(/\/$/u, '')}/${objectKey
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

/**
 * Resolves the widest rendition as the canonical full-view URL, mirroring the
 * picker and description image projections. Returns `null` when no rendition is
 * available for a ready item.
 */
export function widestRenditionUrl(
  origin: string,
  renditions: readonly PublicMediaRenditionUrlInfo[],
): string | null {
  if (renditions.length === 0) return null;
  const widest = renditions.reduce((current, rendition) =>
    rendition.width >= current.width ? rendition : current,
  );
  return publicMediaUrl(origin, widest.objectKey);
}
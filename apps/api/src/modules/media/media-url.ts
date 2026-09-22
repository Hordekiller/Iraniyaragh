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

export type PublicMediaRenditionProjection = {
  url: string;
  width: number;
  height: number;
};

/**
 * Resolves the widest rendition as the canonical full-view projection. URL,
 * width and height all originate from that single chosen rendition, so the
 * rendered dimensions always describe the artifact the URL points to. This is
 * the shared projection behind the media picker and the description image
 * rewrite. Returns `null` when no rendition is available for a ready item.
 */
export function widestRenditionProjection(
  origin: string,
  renditions: readonly PublicMediaRenditionUrlInfo[],
): PublicMediaRenditionProjection | null {
  if (renditions.length === 0) return null;
  const widest = renditions.reduce((current, rendition) =>
    rendition.width >= current.width ? rendition : current,
  );
  return {
    url: publicMediaUrl(origin, widest.objectKey),
    width: widest.width,
    height: widest.height,
  };
}

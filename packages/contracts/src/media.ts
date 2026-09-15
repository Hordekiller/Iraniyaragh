import type { ApiSuccess } from "./api";

export const PRODUCT_MEDIA_ERROR_CODES = ["MEDIA_LIMIT_EXCEEDED", "MEDIA_TYPE_UNSUPPORTED", "MEDIA_TOO_LARGE", "MEDIA_DIMENSIONS_INVALID", "MEDIA_UPLOAD_EXPIRED", "MEDIA_CHECKSUM_MISMATCH", "MEDIA_NOT_READY", "MEDIA_PROCESSING_FAILED", "MEDIA_POSITION_CONFLICT", "MEDIA_PRIMARY_REQUIRED", "MEDIA_POSTER_REQUIRED"] as const;

export type ProductMediaErrorCode = (typeof PRODUCT_MEDIA_ERROR_CODES)[number];
export type ProductMediaKind = "IMAGE" | "VIDEO";
export type ProductMediaRole = "PRIMARY" | "GALLERY" | "VIDEO_POSTER";
export type ProductMediaState = "PENDING_UPLOAD" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED";

export type ProductMediaUploadRequest = {
  kind: ProductMediaKind;
  role: ProductMediaRole;
  position: number;
  originalFilename: string;
  declaredMime: "image/jpeg" | "image/png" | "image/webp" | "video/mp4";
  bytes: number;
  productVersion: number;
};

export type ProductMediaUploadIntent = {
  mediaId: string;
  uploadUrl: string;
  method: "PUT";
  requiredHeaders: Record<string, string>;
  expiresAt: string;
  version: number;
};

export type ProductMediaUploadResponse = ApiSuccess<{
  upload: ProductMediaUploadIntent;
}>;

export type ProductMediaConfirmRequest = {
  checksumSha256?: string;
};

export type ProductMediaMetadataRequest = {
  expectedVersion: number;
  altText?: string | null;
  caption?: string | null;
  posterMediaId?: string | null;
};

export type ProductMediaReorderRequest = {
  expectedProductVersion: number;
  items: Array<{ mediaId: string; expectedVersion: number; position: number }>;
};

export type ProductMediaArchiveRequest = {
  expectedVersion: number;
};

export type ProductMediaPrimaryRequest = {
  expectedProductVersion: number;
  expectedVersion: number;
};

export type AdminProductMedia = {
  id: string;
  productId: string;
  kind: ProductMediaKind;
  state: ProductMediaState;
  role: ProductMediaRole;
  position: number;
  altText: string | null;
  caption: string | null;
  originalFilename: string;
  declaredMime: string;
  declaredBytes: string;
  detectedMime: string | null;
  bytes: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasAudio: boolean | null;
  posterMediaId: string | null;
  checksumSha256: string | null;
  failureCode: string | null;
  version: number;
  uploadExpiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductMediaResponse = ApiSuccess<{
  media: AdminProductMedia;
}>;
export type ProductMediaConfirmResponse = AdminProductMediaResponse;
export type AdminProductMediaListResponse = ApiSuccess<{
  items: AdminProductMedia[];
}>;

export type PublicProductMediaImage = {
  id: string;
  kind: "IMAGE";
  position: number;
  role: ProductMediaRole;
  alt: string;
  caption: string | null;
  width: number;
  height: number;
  sources: Array<{ url: string; width: number; height: number; type: string }>;
};

export type PublicProductMedia =
  | PublicProductMediaImage
  | {
      id: string;
      kind: "VIDEO";
      position: number;
      caption: string | null;
      description: string;
      durationMs: number;
      width: number;
      height: number;
      hasAudio: boolean;
      poster: PublicProductMediaImage;
      sources: Array<{
        url: string;
        type: "video/mp4";
        width: number;
        height: number;
      }>;
      captions: Array<{
        url: string;
        kind: "captions";
        srclang: "fa";
        label: string;
      }>;
    };

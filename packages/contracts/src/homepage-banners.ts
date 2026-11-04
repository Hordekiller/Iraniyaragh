import type { ApiSuccess } from './api';

export const HOMEPAGE_BANNER_SLOTS = 4;

/** Admin-authored banner. Images reference READY product media by id; URLs are resolved server-side. */
export type HomepageBannerInput = {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string;
  /** Same-site path (`/…`) or an https URL. */
  href: string;
  desktopMediaId: string;
  mobileMediaId: string | null;
  imageAlt: string;
  enabled: boolean;
  publishAt: string | null;
  unpublishAt: string | null;
};
export type HomepageBannerImage = { url: string; width: number; height: number };
export type HomepageBannerAdmin = HomepageBannerInput & {
  desktopImage: HomepageBannerImage | null;
  mobileImage: HomepageBannerImage | null;
};
export type HomepageBannerPublic = {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string;
  href: string;
  imageAlt: string;
  desktopImage: HomepageBannerImage;
  mobileImage: HomepageBannerImage | null;
};
export type HomepageBannersAdminConfig = { version: number; banners: HomepageBannerAdmin[]; updatedAt: string | null };
export type HomepageBannersPublicConfig = { banners: HomepageBannerPublic[] };
export type HomepageBannersUpdate = { expectedVersion: number; banners: HomepageBannerInput[] };
export type HomepageBannerMediaOption = { id: string; url: string; width: number; height: number; alt: string; productName: string };
export type HomepageBannersPublicResponse = ApiSuccess<HomepageBannersPublicConfig>;
export type HomepageBannersAdminResponse = ApiSuccess<{ config: HomepageBannersAdminConfig }>;
export type HomepageBannerMediaOptionsResponse = ApiSuccess<{ items: HomepageBannerMediaOption[] }>;

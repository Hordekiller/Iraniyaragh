import type { HomepageBannerMediaOptionsResponse, HomepageBannersAdminResponse, HomepageBannersUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export async function readHomepageHero(signal?: AbortSignal) {
  const [config, media] = await Promise.all([
    apiFetch<HomepageBannersAdminResponse['data']>('/catalog/homepage-hero/admin', { token: getAccessToken(), signal }),
    apiFetch<HomepageBannerMediaOptionsResponse['data']>('/catalog/homepage-hero/admin/media-options', { token: getAccessToken(), signal }),
  ]);
  return { config: config.data.config, media: media.data.items };
}

export async function saveHomepageHero(body: HomepageBannersUpdate, key: string, signal?: AbortSignal) {
  return (await apiFetch<HomepageBannersAdminResponse['data']>('/catalog/homepage-hero/admin', {
    token: getAccessToken(), signal, method: 'PUT', body, headers: { 'Idempotency-Key': key },
  })).data.config;
}

'use client';

import { HomepageMediaPage } from './HomepageBannersPage';
import { readHomepageHero, saveHomepageHero } from '@/lib/settings/homepage-hero-api';

export function HomepageHeroPage() {
  return <HomepageMediaPage kind="hero" read={readHomepageHero} save={saveHomepageHero} />;
}

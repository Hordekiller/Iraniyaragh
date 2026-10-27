import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { ProductStatus } from '@prisma/client';

@Injectable()
export class DiscoveryService {
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('PUBLIC_SITE_URL') || this.config.get<string>('WEB_BASE_URL') || 'https://iraniyaragh.com';
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async getRobotsTxt(): Promise<string> {
    return `User-agent: *
Allow: /

# Private areas
Disallow: /account/
Disallow: /cart
Disallow: /checkout
Disallow: /orders/
Disallow: /payment
Disallow: /payment-return
Disallow: /credit
Disallow: /invoices

Sitemap: ${this.baseUrl}/sitemap.xml
`;
  }

  async getSitemapIndex(): Promise<string> {
    const now = new Date().toISOString();
    const urls = [
      { loc: `${this.baseUrl}/sitemap-pages.xml`, lastmod: now },
      { loc: `${this.baseUrl}/sitemap-categories.xml`, lastmod: now },
      { loc: `${this.baseUrl}/sitemap-products.xml`, lastmod: now },
    ];
    const entries = urls
      .map(
        (url) => `  <sitemap>
    <loc>${this.escapeXml(url.loc)}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </sitemap>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;
  }

  async getPagesSitemap(): Promise<string> {
    const urls = [
      { loc: `${this.baseUrl}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${this.baseUrl}/bestsellers`, changefreq: 'daily', priority: '0.9' },
      { loc: `${this.baseUrl}/search`, changefreq: 'weekly', priority: '0.6' },
      { loc: `${this.baseUrl}/privacy`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${this.baseUrl}/terms`, changefreq: 'yearly', priority: '0.3' },
    ];
    const entries = urls
      .map(
        (url) => `  <url>
    <loc>${this.escapeXml(url.loc)}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
  }

  async getCategoriesSitemap(): Promise<string> {
    const categories = await this.prisma.category.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    const entries = categories
      .map(
        (cat) => `  <url>
    <loc>${this.escapeXml(`${this.baseUrl}/category/${cat.slug}`)}</loc>
    <lastmod>${cat.updatedAt.toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
  }

  async getProductsSitemap(): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE },
      select: {
        slug: true,
        updatedAt: true,
        name: true,
        description: true,
        media: {
          where: { state: 'READY', kind: 'IMAGE', altText: { not: null } },
          select: { id: true, altText: true, renditions: { select: { objectKey: true, width: true } } },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const entries = products
      .map((product) => {
        const images = product.media
          .map((media) => {
            const rendition = media.renditions.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            if (!rendition) return '';
            const imageUrl = `${this.baseUrl.replace(/\/$/, '')}/${rendition.objectKey.split('/').map((p) => encodeURIComponent(p)).join('/')}`;
            return `    <image:image>
      <image:loc>${this.escapeXml(imageUrl)}</image:loc>
      ${media.altText ? `<image:title>${this.escapeXml(media.altText)}</image:title>` : ''}
      <image:caption>${this.escapeXml(media.altText || product.name)}</image:caption>
    </image:image>`;
          })
          .filter(Boolean)
          .join('\n');
        return `  <url>
    <loc>${this.escapeXml(`${this.baseUrl}/product/${product.slug}`)}</loc>
    <lastmod>${product.updatedAt.toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
${images}
  </url>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries}
</urlset>
`;
  }
}

import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';

@ApiExcludeController()
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async robots() {
    return this.discovery.getRobotsTxt();
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async sitemapIndex() {
    return this.discovery.getSitemapIndex();
  }

  @Get('sitemap-pages.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async pagesSitemap() {
    return this.discovery.getPagesSitemap();
  }

  @Get('sitemap-categories.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async categoriesSitemap() {
    return this.discovery.getCategoriesSitemap();
  }

  @Get('sitemap-products.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  async productsSitemap() {
    return this.discovery.getProductsSitemap();
  }
}

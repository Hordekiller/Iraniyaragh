import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { DiscoveryService, type DiscoveryArtifact } from './discovery.service';
import { DiscoveryRateLimitService } from './discovery-rate-limit.service';

@ApiExcludeController()
@Controller({ path: 'discovery', version: '1' })
export class DiscoveryController {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService, @Inject(DiscoveryRateLimitService) private readonly limiter: DiscoveryRateLimitService) {}

  @Get('robots.txt')
  async robots(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.serve(request, response, () => Promise.resolve(this.discovery.robots()));
  }

  @Get('sitemap.xml')
  async index(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.serve(request, response, () => this.discovery.index());
  }

  @Get('sitemaps/:filename')
  async shard(@Param('filename') filename: string, @Req() request: Request, @Res() response: Response): Promise<void> {
    await this.serve(request, response, () => this.discovery.shard(filename));
  }

  @Get('catalog/:kind/:slug')
  async catalogPolicy(@Param('kind') kind: string, @Param('slug') slug: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return this.discovery.catalogPolicy(kind, slug);
  }

  private async serve(request: Request, response: Response, generate: () => Promise<DiscoveryArtifact>): Promise<void> {
    // Errors must never inherit a public cache policy or advertise an incomplete XML document.
    response.setHeader('Cache-Control', 'no-store');
    if (!this.discovery.production) response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    try { await this.limiter.enforce(); } catch (error) {
      response.setHeader('Retry-After', '60');
      throw error;
    }
    const artifact = await generate();
    // Re-read current eligibility before every response (including 304). No stale archive URLs.
    // A persistent cache/stale-if-error needs transactional lifecycle invalidation first.
    response.setHeader('Cache-Control', request.headers.authorization ? 'no-store' : 'public, no-cache, must-revalidate');
    response.setHeader('Content-Type', artifact.contentType);
    response.setHeader('ETag', artifact.etag);
    const unchanged = request.headers['if-none-match']?.split(',').some(value => {
      const candidate = value.trim();
      return candidate === '*' || candidate === artifact.etag || candidate === `W/${artifact.etag}`;
    });
    if (unchanged) { response.status(304).end(); return; }
    response.status(200).send(artifact.body);
  }
}

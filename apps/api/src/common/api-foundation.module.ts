import { Inject, MiddlewareConsumer, Module, type NestModule, type OnModuleInit } from '@nestjs/common';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { RequestIdMiddleware } from './request-id.middleware';
import { PrivateApiCacheMiddleware } from './private-api-cache.middleware';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class ApiFoundationModule implements NestModule, OnModuleInit {
  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    // Do not generate implicit weak ETags for auth/private/error responses.
    // PublicCatalogCacheInterceptor still sets its explicit strong ETags and
    // handles public conditional requests according to the catalog contract.
    this.adapterHost.httpAdapter?.getInstance().disable('etag');
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, PrivateApiCacheMiddleware).forRoutes('*');
  }
}

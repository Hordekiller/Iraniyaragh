import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import { REDIS_CLIENT, type RedisClient } from './redis.client';
import { provideRedisClient } from './redis.provider';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        provideRedisClient(config.getOrThrow('REDIS_URL', { infer: true })),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onModuleDestroy(): Promise<void> {
    const status = this.client?.status;
    if (status === 'ready' || status === 'connect') {
      await this.client.quit();
    }
  }
}

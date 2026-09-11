import 'reflect-metadata';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsAdminController } from './notifications.admin.controller';
import { NotificationsModule } from './notifications.module';
import { EnvironmentSmsSettingsStore } from './environment-sms-settings.store';
import { SMS_SETTINGS_STORE } from './sms-settings.port';

@Module({
  imports: [NotificationsModule],
  providers: [PrismaService],
})
class NotificationsHarness {}

describe('NotificationsModule bootstrap', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(NotificationsHarness, { abortOnError: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts up and resolves the token-injected store (no injection regression)', () => {
    expect(app.get(NotificationsAdminController)).toBeInstanceOf(NotificationsAdminController);
    expect(app.get(SMS_SETTINGS_STORE)).toBeInstanceOf(EnvironmentSmsSettingsStore);
  });

  it('fails closed with a truthful environment projection in local mode', async () => {
    const store = app.get(SMS_SETTINGS_STORE);
    const snapshot = await store.read();
    expect(snapshot.settings.environment).toBe('development');
    expect(snapshot.secretBackend).toBe('read_only');
  });
});

import 'reflect-metadata';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsAdminController } from './notifications.admin.controller';
import { NotificationsModule } from './notifications.module';
import { DisconnectedSmsSettingsStore } from './sms-settings.disconnected';
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
    expect(app.get(SMS_SETTINGS_STORE)).toBeInstanceOf(DisconnectedSmsSettingsStore);
  });

  it('fails closed with the placeholder store until #114 provides the adapter', async () => {
    const store = app.get(SMS_SETTINGS_STORE);
    const snapshot = await store.read();
    expect(snapshot.settings.environment).toBe('unknown');
    expect(snapshot.secretBackend).toBe('read_only');
  });
});
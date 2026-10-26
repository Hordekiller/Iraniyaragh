import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { ReportsModule } from './reports.module';
import { ReportExportRenderer } from './report-export.renderer';
import { ReportExportArtifactStore } from './report-export-artifact.store';
import { ReportExportJobService } from './report-export-job.service';

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class DatabaseHarness {}
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), DatabaseHarness, ReportsModule],
})
class WorkerHarness {}

it('resolves the exact providers requested by the shared PDF/report worker', async () => {
  const app = await NestFactory.createApplicationContext(WorkerHarness, {
    logger: false,
    abortOnError: false,
  });
  try {
    for (const provider of [ReportExportRenderer, ReportExportArtifactStore, ReportExportJobService]) {
      expect(app.get(provider)).toBeInstanceOf(provider);
    }
  } finally {
    await app.close();
  }
});

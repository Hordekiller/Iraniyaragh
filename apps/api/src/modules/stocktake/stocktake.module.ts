import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StocktakeController } from './stocktake.controller';
import { StocktakeService } from './stocktake.service';

@Module({ imports: [AuditModule], controllers: [StocktakeController], providers: [StocktakeService] })
export class StocktakeModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from './ledger-entry.entity';
@Module({ imports: [TypeOrmModule.forFeature([LedgerEntry])], exports: [TypeOrmModule] })
export class LedgerModule {}

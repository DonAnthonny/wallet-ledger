import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './wallet.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { LedgerEntry } from '../ledger/ledger-entry.entity';
import { IdempotencyRecord } from '../idempotency/idempotency.entity';
import { User } from '../users/user.entity';
@Module({ imports: [TypeOrmModule.forFeature([Wallet, LedgerEntry, IdempotencyRecord, User])], controllers: [WalletController], providers: [WalletService], exports: [WalletService] })
export class WalletModule {}

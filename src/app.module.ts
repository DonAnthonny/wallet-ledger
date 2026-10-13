import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from './config/env.validation';
import { User } from './modules/users/user.entity';
import { Wallet } from './modules/wallets/wallet.entity';
import { LedgerEntry } from './modules/ledger/ledger-entry.entity';
import { IdempotencyRecord } from './modules/idempotency/idempotency.entity';
import { AuthModule } from './modules/auth/auth.module';
import { WalletModule } from './modules/wallets/wallet.module';
import { HealthModule } from './modules/health/health.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate: validateEnvironment }),
    TypeOrmModule.forRoot({ type: 'postgres', host: process.env.DATABASE_HOST ?? 'localhost', port: Number(process.env.DATABASE_PORT ?? 5432), username: process.env.DATABASE_USER ?? 'wallet', password: process.env.DATABASE_PASSWORD ?? 'wallet_dev_password', database: process.env.DATABASE_NAME ?? 'wallet_ledger', entities: [User, Wallet, LedgerEntry, IdempotencyRecord], autoLoadEntities: true, synchronize: false, retryAttempts: 10, retryDelay: 2000 }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule, WalletModule, HealthModule,
  ],
}) export class AppModule {}

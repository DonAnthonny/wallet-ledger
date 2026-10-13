import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { User } from '../modules/users/user.entity';
import { Wallet } from '../modules/wallets/wallet.entity';
import { LedgerEntry } from '../modules/ledger/ledger-entry.entity';
import { IdempotencyRecord } from '../modules/idempotency/idempotency.entity';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'wallet',
  password: process.env.DATABASE_PASSWORD ?? 'wallet_dev_password',
  database: process.env.DATABASE_NAME ?? 'wallet_ledger',

  entities: [User, Wallet, LedgerEntry, IdempotencyRecord],

  migrations: [`${__dirname}/migrations/*{.ts,.js}`],

  synchronize: false,
});

export default AppDataSource;

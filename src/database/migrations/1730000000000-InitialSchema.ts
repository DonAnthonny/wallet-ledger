import { MigrationInterface, QueryRunner } from 'typeorm';
export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM('USER','ADMIN')`);
    await queryRunner.query(`CREATE TYPE "ledger_entries_operation_enum" AS ENUM('DEPOSIT','WITHDRAW','TRANSFER')`);
    await queryRunner.query(`CREATE TYPE "ledger_entries_status_enum" AS ENUM('PENDING','SUCCESS','FAILED')`);
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" varchar(320) NOT NULL, "password_hash" varchar(100) NOT NULL, "role" "users_role_enum" NOT NULL DEFAULT 'USER', "refresh_token_hash" varchar(100), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_users" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email")`);
    await queryRunner.query(`CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "balance" bigint NOT NULL DEFAULT 0, "currency" varchar(3) NOT NULL DEFAULT 'USD', "version" integer NOT NULL DEFAULT 1, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_wallets" PRIMARY KEY ("id"), CONSTRAINT "CHK_wallet_balance_nonnegative" CHECK ("balance" >= 0), CONSTRAINT "FK_wallet_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wallet_user" ON "wallets" ("user_id")`);
    await queryRunner.query(`CREATE TABLE "ledger_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "operation_group_id" uuid NOT NULL, "operation" "ledger_entries_operation_enum" NOT NULL, "status" "ledger_entries_status_enum" NOT NULL DEFAULT 'SUCCESS', "source_wallet_id" uuid, "destination_wallet_id" uuid, "amount" bigint NOT NULL, "currency" varchar(3) NOT NULL, "reference_id" varchar(128), "idempotency_key" varchar(128), "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("id"), CONSTRAINT "FK_ledger_source" FOREIGN KEY ("source_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT, CONSTRAINT "FK_ledger_destination" FOREIGN KEY ("destination_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ledger_reference" ON "ledger_entries" ("reference_id") WHERE "reference_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_created_at" ON "ledger_entries" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_source_created" ON "ledger_entries" ("source_wallet_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_destination_created" ON "ledger_entries" ("destination_wallet_id", "created_at")`);
    await queryRunner.query(`CREATE TABLE "idempotency_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "key" varchar(128) NOT NULL, "request_hash" varchar(64) NOT NULL, "status" varchar(20) NOT NULL DEFAULT 'PROCESSING', "response_status" integer, "response_body" jsonb, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_idempotency_records" PRIMARY KEY ("id"), CONSTRAINT "FK_idempotency_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_idempotency_user_key" ON "idempotency_records" ("user_id", "key")`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_records"`); await queryRunner.query(`DROP TABLE "ledger_entries"`); await queryRunner.query(`DROP TABLE "wallets"`); await queryRunner.query(`DROP TABLE "users"`); await queryRunner.query(`DROP TYPE "ledger_entries_status_enum"`); await queryRunner.query(`DROP TYPE "ledger_entries_operation_enum"`); await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}

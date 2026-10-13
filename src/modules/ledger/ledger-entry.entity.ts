import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
export enum LedgerOperation { DEPOSIT = 'DEPOSIT', WITHDRAW = 'WITHDRAW', TRANSFER = 'TRANSFER' }
export enum LedgerStatus { PENDING = 'PENDING', SUCCESS = 'SUCCESS', FAILED = 'FAILED' }
@Entity('ledger_entries')
@Index('IDX_ledger_created_at', ['createdAt'])
@Index('IDX_ledger_source_created', ['sourceWalletId', 'createdAt'])
@Index('IDX_ledger_destination_created', ['destinationWalletId', 'createdAt'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'operation_group_id', type: 'uuid' }) operationGroupId: string;
  @Column({ type: 'enum', enum: LedgerOperation }) operation: LedgerOperation;
  @Column({ type: 'enum', enum: LedgerStatus, default: LedgerStatus.SUCCESS }) status: LedgerStatus;
  @Column({ name: 'source_wallet_id', type: 'uuid', nullable: true }) sourceWalletId: string | null;
  @Column({ name: 'destination_wallet_id', type: 'uuid', nullable: true }) destinationWalletId: string | null;
  @Column({ type: 'bigint', transformer: { to: (v: string | bigint) => v.toString(), from: (v: string) => v } }) amount: string;
  @Column({ type: 'varchar', length: 3 }) currency: string;
  @Column({ name: 'reference_id', type: 'varchar', length: 128, nullable: true, unique: true }) referenceId: string | null;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true }) idempotencyKey: string | null;
  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

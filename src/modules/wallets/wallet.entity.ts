import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
@Entity('wallets')
@Check('CHK_wallet_balance_nonnegative', 'balance >= 0')
export class Wallet {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  // Amounts are stored as integer minor units (e.g. cents), never floating point.
  @Column({ type: 'bigint', default: '0', transformer: { to: (v: string | bigint) => v.toString(), from: (v: string) => v } }) balance: string;
  @Column({ type: 'varchar', length: 3, default: 'USD' }) currency: string;
  @Column({ type: 'integer', default: 1 }) version: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

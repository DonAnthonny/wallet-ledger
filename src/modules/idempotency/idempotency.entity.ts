import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
@Entity('idempotency_records')
@Index('UQ_idempotency_user_key', ['userId', 'key'], { unique: true })
export class IdempotencyRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ name: 'key', type: 'varchar', length: 128 }) key: string;
  @Column({ name: 'request_hash', type: 'varchar', length: 64 }) requestHash: string;
  @Column({ type: 'varchar', length: 20, default: 'PROCESSING' }) status: 'PROCESSING' | 'COMPLETED';
  @Column({ name: 'response_status', type: 'integer', nullable: true }) responseStatus: number | null;
  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: Record<string, any> | null; @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

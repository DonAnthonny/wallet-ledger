import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Wallet } from './wallet.entity';
import { User } from '../users/user.entity';
import { LedgerEntry, LedgerOperation, LedgerStatus } from '../ledger/ledger-entry.entity';
import { IdempotencyRecord } from '../idempotency/idempotency.entity';

@Injectable()
export class WalletService {
  constructor(private readonly dataSource: DataSource) {}
  private positiveAmount(amount: string): bigint {
    if (!/^[1-9]\d{0,17}$/.test(amount)) throw new BadRequestException('Amount must be a positive integer in minor currency units');
    return BigInt(amount);
  }
  async getMyWallet(userId: string) {
    const wallet = await this.dataSource.getRepository(Wallet).findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }
  async deposit(userId: string, amount: string, referenceId: string) {
    this.positiveAmount(amount);
    if (!referenceId?.trim()) throw new BadRequestException('referenceId is required');
    return this.dataSource.transaction(async manager => {
      const wallet = await this.lockWallet(manager, userId);
      const duplicate = await manager.getRepository(LedgerEntry).findOne({ where: { referenceId } });
      if (duplicate) throw new ConflictException('referenceId has already been used');
      wallet.balance = (BigInt(wallet.balance) + BigInt(amount)).toString();
      await manager.getRepository(Wallet).save(wallet);
      const entry = manager.getRepository(LedgerEntry).create({ operationGroupId: randomUUID(), operation: LedgerOperation.DEPOSIT, status: LedgerStatus.SUCCESS, sourceWalletId: null, destinationWalletId: wallet.id, amount, currency: wallet.currency, referenceId, idempotencyKey: null, metadata: { initiatedBy: userId } });
      await manager.getRepository(LedgerEntry).save(entry);
      return { transactionId: entry.id, status: entry.status, amount: entry.amount, currency: entry.currency, balance: wallet.balance, referenceId };
    });
  }
  async withdraw(userId: string, amount: string, key: string) {
    this.positiveAmount(amount);
    return this.idempotent(userId, key, { type: 'WITHDRAW', amount }, async manager => {
      const wallet = await this.lockWallet(manager, userId);
      if (BigInt(wallet.balance) < BigInt(amount)) throw new BadRequestException('Insufficient funds');
      wallet.balance = (BigInt(wallet.balance) - BigInt(amount)).toString();
      await manager.getRepository(Wallet).save(wallet);
      const entry = await manager.getRepository(LedgerEntry).save(manager.getRepository(LedgerEntry).create({ operationGroupId: randomUUID(), operation: LedgerOperation.WITHDRAW, status: LedgerStatus.SUCCESS, sourceWalletId: wallet.id, destinationWalletId: null, amount, currency: wallet.currency, referenceId: null, idempotencyKey: key, metadata: { initiatedBy: userId } }));
      return { transactionId: entry.id, status: entry.status, amount, currency: wallet.currency, balance: wallet.balance };
    });
  }
  async transfer(userId: string, destinationUserId: string, amount: string, key: string) {
    this.positiveAmount(amount);
    if (userId === destinationUserId) throw new BadRequestException('Cannot transfer to the same user');
    return this.idempotent(userId, key, { type: 'TRANSFER', amount, destinationUserId }, async manager => {
      const users = await manager.getRepository(User).findBy([{ id: userId }, { id: destinationUserId }]);
      if (users.length !== 2) throw new NotFoundException('Sender or recipient user not found');
      const wallets = await manager.getRepository(Wallet).findBy([{ userId }, { userId: destinationUserId }]);
      if (wallets.length !== 2) throw new NotFoundException('Sender or recipient wallet not found');
      // Always acquire row locks in deterministic wallet-id order to reduce deadlocks.
      const orderedIds = wallets.map(w => w.id).sort();
      const locked: Wallet[] = [];
      for (const id of orderedIds) locked.push(await manager.getRepository(Wallet).createQueryBuilder('wallet').setLock('pessimistic_write').where('wallet.id = :id', { id }).getOneOrFail());
      const sender = locked.find(w => w.userId === userId)!;
      const recipient = locked.find(w => w.userId === destinationUserId)!;
      if (sender.currency !== recipient.currency) throw new BadRequestException('Wallet currencies do not match');
      if (BigInt(sender.balance) < BigInt(amount)) throw new BadRequestException('Insufficient funds');
      sender.balance = (BigInt(sender.balance) - BigInt(amount)).toString();
      recipient.balance = (BigInt(recipient.balance) + BigInt(amount)).toString();
      await manager.getRepository(Wallet).save([sender, recipient]);
      const groupId = randomUUID();
      const entry = await manager.getRepository(LedgerEntry).save(manager.getRepository(LedgerEntry).create({ operationGroupId: groupId, operation: LedgerOperation.TRANSFER, status: LedgerStatus.SUCCESS, sourceWalletId: sender.id, destinationWalletId: recipient.id, amount, currency: sender.currency, referenceId: null, idempotencyKey: key, metadata: { initiatedBy: userId } }));
      return { transactionId: entry.id, status: entry.status, amount, currency: sender.currency, senderBalance: sender.balance, recipientBalance: recipient.balance };
    });
  }
  async history(userId: string, query: { page?: number; limit?: number; from?: string; to?: string; operation?: string; status?: string }) {
    const wallet = await this.dataSource.getRepository(Wallet).findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const qb = this.dataSource.getRepository(LedgerEntry).createQueryBuilder('entry')
      .where('(entry.sourceWalletId = :walletId OR entry.destinationWalletId = :walletId)', { walletId: wallet.id });
    if (query.from) qb.andWhere('entry.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('entry.createdAt <= :to', { to: new Date(query.to) });
    if (query.operation) qb.andWhere('entry.operation = :operation', { operation: query.operation });
    if (query.status) qb.andWhere('entry.status = :status', { status: query.status });
    qb.orderBy('entry.createdAt', 'DESC').addOrderBy('entry.id', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
  private async lockWallet(manager: EntityManager, userId: string) {
    const wallet = await manager.getRepository(Wallet).createQueryBuilder('wallet').setLock('pessimistic_write').where('wallet.userId = :userId', { userId }).getOne();
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }
  private async idempotent<T>(userId: string, key: string, payload: Record<string, unknown>, operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (!key || key.length > 128) throw new BadRequestException('Idempotency-Key header is required (max 128 chars)');
    const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    try {
      return await this.dataSource.transaction(async manager => {
        const repo = manager.getRepository(IdempotencyRecord);
        const record = repo.create({ userId, key, requestHash, status: 'PROCESSING', responseStatus: null, responseBody: null });
await repo.insert({
  ...record,
  responseBody: record.responseBody ?? null,
});        const result = await operation(manager);
        await repo.update({ userId, key }, { status: 'COMPLETED', responseStatus: 200, responseBody: result as any });
        return result;
      });
    } catch (error: any) {
      if (error?.code !== '23505') throw error;
      const existing = await this.dataSource.getRepository(IdempotencyRecord).findOne({ where: { userId, key } });
      if (!existing) throw error;
      if (existing.requestHash !== requestHash) throw new ConflictException('Idempotency key was already used with a different request');
      if (existing.status === 'COMPLETED' && existing.responseBody) return existing.responseBody as T;
      // Concurrent insert waits for the first transaction; a committed PROCESSING row is not expected.
      throw new ConflictException('An operation with this idempotency key is in progress; retry shortly');
    }
  }
}

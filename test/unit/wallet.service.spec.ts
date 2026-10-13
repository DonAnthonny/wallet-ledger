import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { WalletService } from '../../src/modules/wallets/wallet.service';
import { Wallet } from '../../src/modules/wallets/wallet.entity';
import { User } from '../../src/modules/users/user.entity';
import {
  LedgerEntry,
  LedgerOperation,
  LedgerStatus,
} from '../../src/modules/ledger/ledger-entry.entity';
import { IdempotencyRecord } from '../../src/modules/idempotency/idempotency.entity';

describe('WalletService', () => {
  let service: WalletService;

  let dataSource: any;
  let manager: any;

  let walletRepo: any;
  let userRepo: any;
  let ledgerRepo: any;
  let idempotencyRepo: any;

  const makeWallet = (
    overrides: Partial<Wallet> = {},
  ): Wallet =>
    ({
      id: 'wallet-1',
      userId: 'user-1',
      balance: '1000',
      currency: 'IRR',
      ...overrides,
    }) as Wallet;

  const makeEntry = (overrides: Partial<LedgerEntry> = {}) =>
    ({
      id: 'transaction-1',
      operationGroupId: 'group-1',
      operation: LedgerOperation.DEPOSIT,
      status: LedgerStatus.SUCCESS,
      sourceWalletId: null,
      destinationWalletId: 'wallet-1',
      amount: '250',
      currency: 'IRR',
      referenceId: 'deposit-ref-1',
      idempotencyKey: null,
      metadata: { initiatedBy: 'user-1' },
      ...overrides,
    }) as LedgerEntry;

  beforeEach(() => {
    const wallet = makeWallet();
    const recipient = makeWallet({
      id: 'wallet-2',
      userId: 'user-2',
      balance: '200',
    });

    const walletsByUser: Record<string, Wallet> = {
      'user-1': wallet,
      'user-2': recipient,
    };

    const walletsById: Record<string, Wallet> = {
      'wallet-1': wallet,
      'wallet-2': recipient,
    };

    const walletQueryBuilder: any = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockImplementation(function (
        this: any,
        _condition: string,
        parameters: Record<string, unknown>,
      ) {
        this.parameters = parameters;
        return this;
      }),
      getOne: jest.fn().mockImplementation(async () => {
        return walletsByUser[walletQueryBuilder.parameters?.userId as string] ?? null;
      }),
      getOneOrFail: jest.fn().mockImplementation(async () => {
        const found = walletsById[
          walletQueryBuilder.parameters?.id as string
        ];

        if (!found) {
          throw new Error('Wallet not found');
        }

        return found;
      }),
    };

    const historyQueryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    walletRepo = {
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        return walletsByUser[where.userId] ?? null;
      }),
      findBy: jest.fn().mockImplementation(async () => [
        wallet,
        recipient,
      ]),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        walletQueryBuilder.parameters = undefined;
        return walletQueryBuilder;
      }),
      save: jest.fn().mockImplementation(async (value) => {
        if (Array.isArray(value)) {
          return value;
        }

        if (value?.operation === LedgerOperation.DEPOSIT) {
          return {
            ...value,
            id: 'transaction-1',
          };
        }

        return {
          ...value,
          id: value?.id ?? 'transaction-1',
        };
      }),
    };

    userRepo = {
      findBy: jest.fn().mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]),
    };


ledgerRepo = {
  findOne: jest.fn().mockResolvedValue(null),

  create: jest.fn().mockImplementation((value) => ({
    ...value,
    id:
      value?.operation === LedgerOperation.DEPOSIT
        ? 'transaction-1'
        : value?.id,
  })),

  save: jest.fn().mockImplementation(async (value) => {
    if (Array.isArray(value)) {
      return value;
    }

    return {
      ...value,
      id: value?.id ?? 'transaction-1',
    };
  }),

  createQueryBuilder: jest.fn().mockReturnValue(historyQueryBuilder),
};


    idempotencyRepo = {
      create: jest.fn().mockImplementation((value) => value),
      insert: jest.fn().mockResolvedValue({ identifiers: [] }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const repositories = new Map<any, any>([
      [Wallet, walletRepo],
      [User, userRepo],
      [LedgerEntry, ledgerRepo],
      [IdempotencyRecord, idempotencyRepo],
    ]);

    manager = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
    };

    dataSource = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(manager)),
    };

    service = new WalletService(dataSource);
  });

  describe('positiveAmount', () => {
    it.each([
      '0',
      '-1',
      '1.2',
      '1e3',
      'abc',
      '',
      ' 100 ',
      '1000000000000000000',
    ])('rejects invalid amount: %s', (amount) => {
      expect(() => (service as any).positiveAmount(amount)).toThrow(
        BadRequestException,
      );
    });

    it('accepts a positive integer amount in minor currency units', () => {
      expect((service as any).positiveAmount('1250')).toBe(1250n);
    });
  });

  describe('getMyWallet', () => {
    it('returns the wallet belonging to the user', async () => {
      const result = await service.getMyWallet('user-1');

      expect(result).toMatchObject({
        id: 'wallet-1',
        userId: 'user-1',
        balance: '1000',
      });

      expect(walletRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('throws NotFoundException when the wallet does not exist', async () => {
      walletRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getMyWallet('missing-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deposit', () => {
    it('rejects an invalid amount before opening a transaction', async () => {
      await expect(
        service.deposit('user-1', '0', 'deposit-ref-1'),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a blank reference ID', async () => {
      await expect(
        service.deposit('user-1', '100', '   '),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a duplicate reference ID', async () => {
      ledgerRepo.findOne.mockResolvedValueOnce(makeEntry());

      await expect(
        service.deposit('user-1', '250', 'deposit-ref-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('credits the wallet and creates a successful ledger entry', async () => {
      const wallet = makeWallet();

      walletRepo.createQueryBuilder.mockImplementation(() => {
        const qb: any = {
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(wallet),
        };

        return qb;
      });

      const result = await service.deposit(
        'user-1',
        '250',
        'deposit-ref-2',
      );

      expect(wallet.balance).toBe('1250');
      expect(walletRepo.save).toHaveBeenCalledWith(wallet);

      expect(ledgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: LedgerOperation.DEPOSIT,
          status: LedgerStatus.SUCCESS,
          amount: '250',
          referenceId: 'deposit-ref-2',
          destinationWalletId: 'wallet-1',
        }),
      );

      expect(result).toMatchObject({
        transactionId: 'transaction-1',
        status: LedgerStatus.SUCCESS,
        amount: '250',
        currency: 'IRR',
        balance: '1250',
        referenceId: 'deposit-ref-2',
      });
    });

    it('throws when the wallet does not exist', async () => {
      walletRepo.createQueryBuilder.mockImplementation(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }));

      await expect(
        service.deposit('missing-user', '100', 'deposit-ref-3'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('withdraw', () => {
    it('rejects an invalid amount', async () => {
      await expect(
        service.withdraw('user-1', '1.5', 'withdraw-key-1'),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects an empty idempotency key', async () => {
      await expect(
        service.withdraw('user-1', '100', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an idempotency key longer than 128 characters', async () => {
      await expect(
        service.withdraw('user-1', '100', 'k'.repeat(129)),
      ).rejects.toThrow(BadRequestException);
    });

    it('debits the wallet and records the completed operation', async () => {
      const wallet = makeWallet({ balance: '1000' });

      walletRepo.createQueryBuilder.mockImplementation(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(wallet),
      }));

      const result = await service.withdraw(
        'user-1',
        '300',
        'withdraw-key-1',
      );

      expect(wallet.balance).toBe('700');
      expect(walletRepo.save).toHaveBeenCalledWith(wallet);

      expect(ledgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: LedgerOperation.WITHDRAW,
          status: LedgerStatus.SUCCESS,
          amount: '300',
          sourceWalletId: 'wallet-1',
          idempotencyKey: 'withdraw-key-1',
        }),
      );

      expect(idempotencyRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          key: 'withdraw-key-1',
          status: 'PROCESSING',
        }),
      );

      expect(idempotencyRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1', key: 'withdraw-key-1' },
        expect.objectContaining({
          status: 'COMPLETED',
          responseStatus: 200,
        }),
      );

      expect(result).toMatchObject({
        transactionId: 'transaction-1',
        status: LedgerStatus.SUCCESS,
        amount: '300',
        balance: '700',
      });
    });

    it('rejects withdrawal when funds are insufficient', async () => {
      const wallet = makeWallet({ balance: '100' });

      walletRepo.createQueryBuilder.mockImplementation(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(wallet),
      }));

      await expect(
        service.withdraw('user-1', '101', 'withdraw-key-2'),
      ).rejects.toThrow(BadRequestException);

      expect(wallet.balance).toBe('100');
      expect(walletRepo.save).not.toHaveBeenCalled();
      expect(ledgerRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('transfer', () => {
    it('rejects transferring to the same user', async () => {
      await expect(
        service.transfer('user-1', 'user-1', '100', 'transfer-key-1'),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid amount', async () => {
      await expect(
        service.transfer('user-1', 'user-2', '0', 'transfer-key-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the sender has insufficient funds', async () => {
      const sender = makeWallet({
        id: 'wallet-1',
        userId: 'user-1',
        balance: '100',
      });

      const recipient = makeWallet({
        id: 'wallet-2',
        userId: 'user-2',
        balance: '200',
      });

      walletRepo.findBy.mockResolvedValueOnce([sender, recipient]);

      walletRepo.createQueryBuilder.mockImplementation(() => {
        let walletId = '';

        const qb: any = {
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockImplementation(
            (_condition: string, params: { id: string }) => {
              walletId = params.id;
              return qb;
            },
          ),
          getOneOrFail: jest.fn().mockImplementation(async () => {
            return walletId === 'wallet-1' ? sender : recipient;
          }),
        };

        return qb;
      });

      await expect(
        service.transfer('user-1', 'user-2', '101', 'transfer-key-3'),
      ).rejects.toThrow(BadRequestException);

      expect(sender.balance).toBe('100');
      expect(recipient.balance).toBe('200');
      expect(walletRepo.save).not.toHaveBeenCalled();
    });

    it('transfers funds between wallets and creates a ledger entry', async () => {
      const sender = makeWallet({
        id: 'wallet-1',
        userId: 'user-1',
        balance: '1000',
      });

      const recipient = makeWallet({
        id: 'wallet-2',
        userId: 'user-2',
        balance: '200',
      });

      walletRepo.findBy.mockResolvedValueOnce([sender, recipient]);

      walletRepo.createQueryBuilder.mockImplementation(() => {
        let walletId = '';

        const qb: any = {
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockImplementation(
            (_condition: string, params: { id: string }) => {
              walletId = params.id;
              return qb;
            },
          ),
          getOneOrFail: jest.fn().mockImplementation(async () => {
            return walletId === 'wallet-1' ? sender : recipient;
          }),
        };

        return qb;
      });

      const result = await service.transfer(
        'user-1',
        'user-2',
        '300',
        'transfer-key-4',
      );

      expect(sender.balance).toBe('700');
      expect(recipient.balance).toBe('500');

      expect(walletRepo.save).toHaveBeenCalledWith([sender, recipient]);

      expect(ledgerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: LedgerOperation.TRANSFER,
          status: LedgerStatus.SUCCESS,
          sourceWalletId: 'wallet-1',
          destinationWalletId: 'wallet-2',
          amount: '300',
          idempotencyKey: 'transfer-key-4',
        }),
      );

      expect(result).toMatchObject({
        transactionId: 'transaction-1',
        status: LedgerStatus.SUCCESS,
        amount: '300',
        senderBalance: '700',
        recipientBalance: '500',
      });
    });

    it('rejects transfers between wallets with different currencies', async () => {
      const sender = makeWallet({
        id: 'wallet-1',
        userId: 'user-1',
        currency: 'IRR',
      });

      const recipient = makeWallet({
        id: 'wallet-2',
        userId: 'user-2',
        currency: 'USD',
      });

      walletRepo.findBy.mockResolvedValueOnce([sender, recipient]);

      walletRepo.createQueryBuilder.mockImplementation(() => {
        let walletId = '';

        const qb: any = {
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockImplementation(
            (_condition: string, params: { id: string }) => {
              walletId = params.id;
              return qb;
            },
          ),
          getOneOrFail: jest.fn().mockImplementation(async () => {
            return walletId === 'wallet-1' ? sender : recipient;
          }),
        };

        return qb;
      });

      await expect(
        service.transfer('user-1', 'user-2', '100', 'transfer-key-5'),
      ).rejects.toThrow(BadRequestException);

      expect(walletRepo.save).not.toHaveBeenCalled();
    });

    it('rejects when the sender or recipient does not exist', async () => {
      userRepo.findBy.mockResolvedValueOnce([{ id: 'user-1' }]);

      await expect(
        service.transfer('user-1', 'missing-user', '100', 'transfer-key-6'),
      ).rejects.toThrow(NotFoundException);

      expect(walletRepo.save).not.toHaveBeenCalled();
    });
  });
});

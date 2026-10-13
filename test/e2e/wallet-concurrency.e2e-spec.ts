
import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { Wallet } from '../../src/modules/wallets/wallet.entity';
import { LedgerEntry, LedgerOperation } from '../../src/modules/ledger/ledger-entry.entity';
jest.setTimeout(60_000);

type RegisterResponse = {
    accessToken: string;
    refreshToken?: string;
    user: {
        id: string;
        email: string;
    };
};

type ApiResponse<T = Record<string, unknown>> = {
    status: number;
    body: T;
};

type WalletSnapshot = {
    id: string;
    balance: string;
    currency: string;
};

describe('Wallet concurrency E2E', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let walletRepository: Repository<Wallet>;
    let ledgerRepository: Repository<LedgerEntry>;
    let baseUrl: string;

    const testPassword = 'E2E-Test-Password-123!';

    beforeAll(async () => {
        const moduleFixture: TestingModule =
            await Test.createTestingModule({
                imports: [AppModule],
            }).compile();

        app = moduleFixture.createNestApplication();

        app.setGlobalPrefix('api/v1');

        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                forbidNonWhitelisted: true,
            }),
        );

        await app.init();

        dataSource = app.get(DataSource);
        walletRepository = dataSource.getRepository(Wallet);
        ledgerRepository = dataSource.getRepository(LedgerEntry);

        await app.listen(0, '127.0.0.1');

        const address = app.getHttpServer().address() as AddressInfo;

        baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    async function apiRequest<T = Record<string, unknown>>(
        path: string,
        options: {
            method?: 'GET' | 'POST';
            token?: string;
            idempotencyKey?: string;
            body?: unknown;
        } = {},
    ): Promise<ApiResponse<T>> {
        const headers: Record<string, string> = {
            Accept: 'application/json',
        };

        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        if (options.token) {
            headers.Authorization = `Bearer ${options.token}`;
        }

        if (options.idempotencyKey) {
            headers['Idempotency-Key'] = options.idempotencyKey;
        }

        const response = await fetch(`${baseUrl}${path}`, {
            method: options.method ?? 'GET',
            headers,
            body:
                options.body === undefined
                    ? undefined
                    : JSON.stringify(options.body),
        });

        const text = await response.text();

        let body: T;

        try {
            body = text ? (JSON.parse(text) as T) : ({} as T);
        } catch {
            body = { message: text } as T;
        }

        return {
            status: response.status,
            body,
        };
    }

    async function registerUser(): Promise<{
        token: string;
        userId: string;
        walletId: string;
    }> {
        const email = `e2e-${randomUUID()}@example.com`;

        const response = await apiRequest<RegisterResponse>(
            '/auth/register',
            {
                method: 'POST',
                body: {
                    email,
                    password: testPassword,
                },
            },
        );

        expect(response.status).toBe(201);
        expect(response.body.accessToken).toBeDefined();
        expect(response.body.user?.id).toBeDefined();

        const wallet = await walletRepository.findOne({
            where: {
                userId: response.body.user.id,
            },
        });

        expect(wallet).not.toBeNull();

        return {
            token: response.body.accessToken,
            userId: response.body.user.id,
            walletId: wallet!.id,
        };
    }

    async function deposit(
        token: string,
        amount: number,
        referenceId: string = `e2e-deposit-${randomUUID()}`,
    ): Promise<ApiResponse> {
        return apiRequest('/wallet/deposit', {
            method: 'POST',
            token,
            body: {
                amount: String(amount),
                referenceId,
            }
        });
    }

    async function withdraw(
        token: string,
        amount: number,
        idempotencyKey: string,
    ): Promise<ApiResponse> {
        return apiRequest('/wallet/withdraw', {
            method: 'POST',
            token,
            idempotencyKey,
            body: {
                amount: String(amount),
            }
        });
    }

    async function getWallet(walletId: string): Promise<WalletSnapshot> {
        const wallet = await walletRepository.findOne({
            where: {
                id: walletId,
            },
        });

        expect(wallet).not.toBeNull();

        return {
            id: wallet!.id,
            balance: String(wallet!.balance),
            currency: wallet!.currency,
        };
    }

    async function countEntries(
        walletId: string,
        operation: LedgerOperation,
    ): Promise<number> {
        return ledgerRepository.count({
            where: [
                {
                    sourceWalletId: walletId,
                    operation,
                },
                {
                    destinationWalletId: walletId,
                    operation,
                },
            ],
        });
    }

    describe('Concurrent withdrawals', () => {
        it('must never allow the wallet balance to become negative', async () => {
            const user = await registerUser();

            const depositResponse = await deposit(user.token, 1000);
            expect(depositResponse.status).toBe(201);

            const requests = Array.from({ length: 10 }, (_, index) =>
                withdraw(
                    user.token,
                    200,
                    `concurrent-withdraw-${randomUUID()}-${index}`,
                ),
            );

            const responses = await Promise.all(requests);

            const successful = responses.filter(
                (response) => response.status === 201,
            );

            const failed = responses.filter(
                (response) => response.status !== 201,
            );

            expect(successful).toHaveLength(5);
            expect(failed).toHaveLength(5);

            const wallet = await getWallet(user.walletId);

            expect(Number(wallet.balance)).toBe(0);
            expect(Number(wallet.balance)).toBeGreaterThanOrEqual(0);

            const withdrawalCount = await countEntries(
                user.walletId,
                LedgerOperation.WITHDRAW,
            );

            expect(withdrawalCount).toBe(5);
        });
    });

    describe('Idempotency', () => {
        it('must process concurrent requests with the same key only once', async () => {
            const user = await registerUser();

            const depositResponse = await deposit(user.token, 500);

            expect(depositResponse.status).toBe(201);

            const idempotencyKey = `same-key-${randomUUID()}`;

            const responses = await Promise.all(
                Array.from({ length: 8 }, () =>
                    withdraw(user.token, 100, idempotencyKey),
                ),
            );

            const successful = responses.filter(
                (response) => response.status === 201,
            );

            expect(successful).toHaveLength(8);

            const transactionIds = successful.map(
                (response) => response.body.transactionId,
            );

            expect(
                transactionIds.every((id) => id === transactionIds[0]),
            ).toBe(true);

            const wallet = await getWallet(user.walletId);

            expect(Number(wallet.balance)).toBe(400);

            const withdrawalCount = await countEntries(
                user.walletId,
                LedgerOperation.WITHDRAW,
            );

            expect(withdrawalCount).toBe(1);
        });

        it('must reject reuse of a key with a different request payload', async () => {
            const user = await registerUser();

            const depositResponse = await deposit(user.token, 1000);

            expect(depositResponse.status).toBe(201);

            const idempotencyKey = `payload-check-${randomUUID()}`;

            const firstResponse = await withdraw(
                user.token,
                100,
                idempotencyKey,
            );

            expect(firstResponse.status).toBe(201);

            const secondResponse = await withdraw(
                user.token,
                200,
                idempotencyKey,
            );

            expect(secondResponse.status).toBe(409);

            const wallet = await getWallet(user.walletId);

            expect(Number(wallet.balance)).toBe(900);

            const withdrawalCount = await countEntries(
                user.walletId,
                LedgerOperation.WITHDRAW,
            );

            expect(withdrawalCount).toBe(1);
        });
    });

    describe('Concurrent deposits', () => {
        it('must not credit the same reference ID more than once', async () => {
            const user = await registerUser();

            const referenceId = `same-reference-${randomUUID()}`;

            const responses = await Promise.all(
                Array.from({ length: 8 }, () =>
                    deposit(user.token, 100, referenceId),
                ),
            );

            const successful = responses.filter(
                (response) => response.status === 201,
            );

            expect(successful).toHaveLength(1);

            const wallet = await getWallet(user.walletId);

            expect(Number(wallet.balance)).toBe(100);

            const matchingEntries = await ledgerRepository.count({
                where: {
                    referenceId,
                },
            });

            expect(matchingEntries).toBe(1);
        });
    });
});

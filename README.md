# Wallet & Ledger Core API

NestJS + TypeScript + PostgreSQL + TypeORM reference implementation for a transactional wallet service.

## Architecture

- **HTTP**: controllers, DTO validation, Swagger, request ID interceptor, global exception filter.
- **Application**: `AuthService` and `WalletService` coordinate use cases.
- **Persistence**: TypeORM entities and explicit PostgreSQL transactions. Business use cases do not rely on ORM `synchronize`.
- **Data integrity**: integer minor-unit amounts (`BIGINT`), foreign keys, unique indexes, a database non-negative-balance check, pessimistic write locks and idempotency records.

## Requirements

Docker and Docker Compose. No local Node/PostgreSQL installation is required to run the API container.

## Run

```bash
cp .env.example .env
# Replace both JWT secrets with long random values before exposing the service.
docker compose up --build -d
```

API: http://localhost:3000/api/v1
Swagger: http://localhost:3000/docs
Health: http://localhost:3000/api/v1/health

The container runs compiled TypeORM migrations before starting the API. `synchronize` is intentionally disabled. For production, run migrations as a dedicated release job rather than coupling them to every API replica, and never enable `synchronize`.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | No | Register and create default wallet atomically |
| POST | `/api/v1/auth/login` | No | Issue access and refresh JWTs |
| POST | `/api/v1/auth/refresh` | Refresh token body | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Bearer | Revoke stored refresh token |
| GET | `/api/v1/wallet` | Bearer | Current wallet and balance |
| POST | `/api/v1/wallet/deposit` | Bearer | Simulated deposit with unique reference |
| POST | `/api/v1/wallet/withdraw` | Bearer + `Idempotency-Key` | Withdraw exactly once per key |
| POST | `/api/v1/wallet/transfer` | Bearer + `Idempotency-Key` | Atomic transfer |
| GET | `/api/v1/wallet/transactions` | Bearer | Filtered, offset-paginated history |

Amounts are integer **minor units**. For example, `"1250"` means 12.50 units when the currency's minor unit is 1/100. Currency is currently `USD` by default; configure your business currency before production use.

### Examples

Register:
```bash
curl -X POST http://localhost:3000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"user@example.com","password":"StrongPass!123"}'
```

Withdraw:
```bash
curl -X POST http://localhost:3000/api/v1/wallet/withdraw \
  -H 'Authorization: Bearer ACCESS_TOKEN' -H 'Idempotency-Key: withdraw-order-1001' \
  -H 'Content-Type: application/json' -d '{"amount":"500"}'
```

Transfer:
```bash
curl -X POST http://localhost:3000/api/v1/wallet/transfer \
  -H 'Authorization: Bearer ACCESS_TOKEN' -H 'Idempotency-Key: transfer-order-1002' \
  -H 'Content-Type: application/json' \
  -d '{"destinationUserId":"RECIPIENT_UUID","amount":"250"}'
```

## Consistency and concurrency

1. Each balance mutation runs in one database transaction with its ledger entry.
2. Wallet rows are selected `FOR UPDATE` before checking/updating balances.
3. Transfers lock both wallet rows in sorted wallet-ID order to reduce deadlocks.
4. `wallets.balance >= 0` is enforced by a database check constraint as defense in depth.
5. `Idempotency-Key` is unique per user; the request body is hashed so reusing a key for a different payload returns `409 Conflict`.
6. `referenceId` on simulated deposits is unique. In production, a deposit must also be authenticated against a trusted payment-provider webhook; this endpoint is intentionally a simulation.

## Tests

```bash
npm run test:unit
npm run test:e2e
npm test
npm run typecheck
npm run build
```

Unit tests are included for amount validation. Before treating this repository as production-ready or submitting it as a fully tested assessment, add/run PostgreSQL-backed integration and E2E tests for the five-parallel-withdrawal scenario, transfer rollback, concurrent same-key requests, refresh rotation, ledger filtering and migrations. A real concurrency test must use PostgreSQL (not SQLite or mocked repositories).

## Deliberate scope notes

- The app currently exposes `USER` and `ADMIN` role values; role decorators/guards are available, but admin-only ledger reporting endpoints are not included yet.
- Throttler module is registered with a global policy configuration; route-level `ThrottlerGuard` wiring can be enabled in deployment policy.
- Event/outbox delivery and Redis are omitted in favor of correctness-first database idempotency. For durable async events, add a transactional outbox written in the same transaction as ledger entries and a separate worker.
- This is an assessment baseline, not a certified banking system. Add reconciliation, immutable double-entry postings, provider verification, key rotation, observability, backups, and threat-model review before real-money use.

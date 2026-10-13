
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';

import {
  AmountDto,
  DepositDto,
  LedgerQueryDto,
  TransferDto,
} from './dto/money.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Get()
  @ApiOperation({
    summary: 'Get authenticated user wallet and balance',
    description:
      'Returns the authenticated user wallet, including its current balance and currency.',
  })
  @ApiOkResponse({
    description: 'Wallet retrieved successfully.',
    schema: {
      example: {
        id: '650e8400-e29b-41d4-a716-446655440000',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        balance: '1000',
        currency: 'USD',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired access token.',
  })
  @ApiNotFoundResponse({
    description: 'Wallet not found for the authenticated user.',
  })
  getMine(@CurrentUser() user: any) {
    return this.wallets.getMyWallet(user.id);
  }

  @Post('deposit')
  @ApiOperation({
    summary: 'Deposit funds into the authenticated user wallet',
    description:
      'Simulates a deposit. The referenceId must be unique. Amount is a positive integer string in minor currency units.',
  })
  @ApiCreatedResponse({
    description: 'Deposit completed successfully.',
    schema: {
      example: {
        transactionId: '650e8400-e29b-41d4-a716-446655440000',
        status: 'SUCCESS',
        amount: '1000',
        currency: 'USD',
        balance: '2000',
        referenceId: 'payment-ref-2026-000001',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid amount or missing/blank referenceId.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired access token.',
  })
  @ApiNotFoundResponse({
    description: 'Wallet not found.',
  })
  @ApiConflictResponse({
    description: 'The referenceId has already been used.',
  })
  deposit(
    @CurrentUser() user: any,
    @Body() dto: DepositDto,
  ) {
    return this.wallets.deposit(
      user.id,
      dto.amount,
      dto.referenceId,
    );
  }

  @Post('withdraw')
  @ApiOperation({
    summary: 'Withdraw funds exactly once per idempotency key',
    description:
      'Withdraws funds from the authenticated user wallet. Retrying with the same key and same payload returns the original result. Reusing a key with a different payload is rejected.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key for this logical withdrawal operation.',
    required: true,
    schema: {
      type: 'string',
      maxLength: 128,
    },
    example: 'withdraw-2026-000001',
  })
  @ApiCreatedResponse({
    description: 'Withdrawal completed, or a previously completed result was replayed.',
    schema: {
      example: {
        transactionId: '650e8400-e29b-41d4-a716-446655440000',
        status: 'SUCCESS',
        amount: '200',
        currency: 'USD',
        balance: '800',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid amount, missing idempotency key, or insufficient funds.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired access token.',
  })
  @ApiNotFoundResponse({
    description: 'Wallet not found.',
  })
  @ApiConflictResponse({
    description:
      'The idempotency key was used with a different payload, or another operation with this key is in progress.',
  })
  withdraw(
    @CurrentUser() user: any,
    @Body() dto: AmountDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.wallets.withdraw(user.id, dto.amount, key);
  }

  @Post('transfer')
  @ApiOperation({
    summary: 'Atomically transfer funds between users',
    description:
      'Transfers funds from the authenticated user to the destination user. Both wallet balances and the ledger entry are updated in one database transaction.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key for this logical transfer operation.',
    required: true,
    schema: {
      type: 'string',
      maxLength: 128,
    },
    example: 'transfer-2026-000001',
  })
  @ApiCreatedResponse({
    description: 'Transfer completed, or a previously completed result was replayed.',
    schema: {
      example: {
        transactionId: '650e8400-e29b-41d4-a716-446655440000',
        status: 'SUCCESS',
        amount: '250',
        currency: 'USD',
        senderBalance: '750',
        recipientBalance: '1250',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid amount, missing idempotency key, same sender and recipient, currency mismatch, or insufficient funds.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired access token.',
  })
  @ApiNotFoundResponse({
    description: 'Sender, recipient, or a wallet was not found.',
  })
  @ApiConflictResponse({
    description:
      'The idempotency key was used with a different payload, or another operation with this key is in progress.',
  })
  transfer(
    @CurrentUser() user: any,
    @Body() dto: TransferDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.wallets.transfer(
      user.id,
      dto.destinationUserId,
      dto.amount,
      key,
    );
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Get paginated transaction history',
    description:
      'Returns ledger entries associated with the authenticated user wallet. Results are ordered by creation time, newest first.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number, starting from 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Number of records per page; maximum 100.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-10-01T00:00:00.000Z',
    description: 'Optional start date/time filter.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-10-31T23:59:59.999Z',
    description: 'Optional end date/time filter.',
  })
  @ApiQuery({
    name: 'operation',
    required: false,
    type: String,
    enum: ['DEPOSIT', 'WITHDRAW', 'TRANSFER'],
    example: 'DEPOSIT',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    example: 'SUCCESS',
  })
  @ApiOkResponse({
    description: 'Transaction history retrieved successfully.',
    schema: {
      example: {
        data: [
          {
            id: '650e8400-e29b-41d4-a716-446655440000',
            operation: 'DEPOSIT',
            status: 'SUCCESS',
            amount: '1000',
            currency: 'USD',
            createdAt: '2026-10-13T10:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, or expired access token.',
  })
  @ApiNotFoundResponse({
    description: 'Wallet not found.',
  })
  history(
    @CurrentUser() user: any,
    @Query() query: LedgerQueryDto,
  ) {
    return this.wallets.history(user.id, query);
  }
}

import { PaymentProviderKind } from '@lowisko/shared';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../common/errors/error-response.dto';
import { Public } from '../../../auth/decorators/auth.decorators';
import { PaymentStatusDto } from '../dto/payment.dto';
import { PaymentsService } from '../payments.service';

const error = { type: ErrorResponseDto };

/**
 * `urlStatus` of Przelewy24 (T-14). Public: the checksum, our merchant and the following
 * `transaction/verify` prove the origin, not the caller's address (docs/07-security.md).
 * P24 retries until it gets 200, so a repeated notification answers 200 and changes nothing.
 * The body is the provider's format, so the adapter validates it (Zod), not a class-validator DTO.
 */
@ApiTags('payments')
@Public()
@Controller('payments/p24')
export class P24PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('notification')
  @HttpCode(200)
  @ApiOperation({ summary: 'Notification of a paid transaction from Przelewy24 (urlStatus)' })
  @ApiBody({
    description:
      'P24 transaction result: merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement, sign',
    schema: { type: 'object' },
  })
  @ApiOkResponse({
    type: PaymentStatusDto,
    description: 'Status after the call; a payment that is no longer PENDING does not change',
  })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (not a genuine notification), PAYMENT_AMOUNT_MISMATCH',
  })
  @ApiNotFoundResponse({
    ...error,
    description: 'NOT_FOUND (unknown sessionId, or the provider is not p24)',
  })
  async notify(@Body() body: unknown): Promise<PaymentStatusDto> {
    return {
      status: await this.payments.processProviderNotification(PaymentProviderKind.P24, body),
    };
  }
}

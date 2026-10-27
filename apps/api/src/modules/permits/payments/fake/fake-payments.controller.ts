import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../../common/errors/error-response.dto';
import { Public } from '../../../auth/decorators/auth.decorators';
import { CompleteFakePaymentDto, PaymentStatusDto } from '../dto/payment.dto';
import { PaymentsService } from '../payments.service';

const error = { type: ErrorResponseDto };

@ApiTags('payments')
@Public()
@Controller('payments/fake')
export class FakePaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':sessionId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pay or refuse on the fake payment page (only with PAYMENTS_PROVIDER=fake)',
  })
  @ApiOkResponse({
    type: PaymentStatusDto,
    description: 'Status after the call; a payment that is no longer PENDING does not change',
  })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED, PAYMENT_AMOUNT_MISMATCH' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also when the provider is not fake)' })
  async complete(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CompleteFakePaymentDto,
  ): Promise<PaymentStatusDto> {
    return { status: await this.payments.completeFake(sessionId, dto.outcome, dto.amountGrosze) };
  }
}

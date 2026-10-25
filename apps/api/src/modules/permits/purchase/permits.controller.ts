import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import { PurchasePermitDto, PurchasePermitResultDto } from '../dto/permit.dto';
import { PermitPurchaseService } from './permit-purchase.service';

const error = { type: ErrorResponseDto };

@ApiTags('permits')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('permits')
export class PermitsController {
  constructor(private readonly purchases: PermitPurchaseService) {}

  @Post()
  @ApiOperation({
    summary: 'Buy a permit: PENDING_PAYMENT and the payment page (a free one is PAID at once)',
  })
  @ApiCreatedResponse({ type: PurchasePermitResultDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (also validFrom more than 365 days ahead)',
  })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (permit type)' })
  @ApiUnprocessableEntityResponse({
    ...error,
    description: 'PERMIT_START_IN_PAST, DISCOUNT_NOT_ELIGIBLE, PERMIT_TYPE_INACTIVE',
  })
  purchase(
    @CurrentUser() user: AuthUser,
    @Body() dto: PurchasePermitDto,
  ): Promise<PurchasePermitResultDto> {
    return this.purchases.purchase(user.id, dto);
  }
}

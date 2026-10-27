import { PaymentStatus } from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, Min, ValidateIf } from 'class-validator';

export const FAKE_PAYMENT_OUTCOMES = ['PAID', 'REJECTED'] as const;
export type FakePaymentOutcome = (typeof FAKE_PAYMENT_OUTCOMES)[number];

export class CompleteFakePaymentDto {
  @ApiProperty({ enum: FAKE_PAYMENT_OUTCOMES, enumName: 'FakePaymentOutcome' })
  @IsIn(FAKE_PAYMENT_OUTCOMES)
  outcome!: FakePaymentOutcome;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Amount the fake bank notifies, whole grosze; defaults to the payment amount',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  amountGrosze?: number;
}

export class PaymentStatusDto {
  @ApiProperty({ enum: Object.values(PaymentStatus), enumName: 'PaymentStatus' })
  status!: PaymentStatus;
}

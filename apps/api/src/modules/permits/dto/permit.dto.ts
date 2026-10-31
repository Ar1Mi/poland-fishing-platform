import { DiscountKind, EffectivePermitStatus } from '@lowisko/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsDateOnly } from '../../users/dto/profile.dto';

export class PurchasePermitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  permitTypeId!: string;

  @ApiProperty({
    format: 'date',
    example: '2026-10-06',
    description: 'First valid day: from today (Europe/Warsaw) to 365 days ahead',
  })
  @IsDateOnly()
  validFrom!: string;
}

export class MyPermitTypeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Dzienne' })
  name!: string;

  @ApiProperty({ example: 1 })
  durationDays!: number;

  @ApiProperty({ enum: Object.values(DiscountKind), enumName: 'DiscountKind' })
  discountKind!: DiscountKind;
}

export class PermitOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'PZW Okręg Mazowiecki' })
  name!: string;
}

export class PermitWaterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;
}

/** A permit as its owner sees it, with the QR token while it is valid or scheduled (T-15). */
export class MyPermitDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ZW-2026-000123' })
  number!: string;

  @ApiProperty({
    enum: Object.values(EffectivePermitStatus),
    enumName: 'EffectivePermitStatus',
    description: 'Stored status; a PAID permit as SCHEDULED, ACTIVE or EXPIRED (ADR-0005)',
  })
  status!: EffectivePermitStatus;

  @ApiProperty({ format: 'date', example: '2026-10-06' })
  validFrom!: string;

  @ApiProperty({ format: 'date', example: '2026-10-06', description: 'Last valid day, inclusive' })
  validTo!: string;

  @ApiProperty({ example: 2500, description: 'Whole grosze; the price at the time of purchase' })
  pricePaidGrosze!: number;

  @ApiProperty({ type: MyPermitTypeDto })
  permitType!: MyPermitTypeDto;

  @ApiProperty({ type: PermitOrganizationDto })
  organization!: PermitOrganizationDto;

  @ApiProperty({
    type: [PermitWaterDto],
    description: 'Waters of the permit type, which the permit covers (BR-01); by name',
  })
  waters!: PermitWaterDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'JWS for the QR code `${WEB_URL}/verify/<qrToken>` (ADR-0006), expires at the end of ' +
      'validTo; only while the status is SCHEDULED or ACTIVE, otherwise null',
  })
  qrToken!: string | null;
}

export class PurchasePermitResultDto {
  @ApiProperty({ type: MyPermitDto })
  permit!: MyPermitDto;

  @ApiProperty({
    format: 'uri',
    description:
      'Where to send the browser: the payment page, or for a free permit (already PAID) ' +
      'straight to /payment/return',
  })
  paymentUrl!: string;
}

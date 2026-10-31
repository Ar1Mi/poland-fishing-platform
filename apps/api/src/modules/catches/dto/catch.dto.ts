import {
  CATCH_LENGTH_MAX_CM,
  CATCH_SYNC_MAX_ITEMS,
  CATCH_WEIGHT_MAX_G,
  CatchErrorCode,
  CatchSyncStatus,
} from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNumber,
  IsRFC3339,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IfPresent } from '../../users/dto/profile.dto';

/** Validates a value that is neither omitted nor `null`. */
const IfSet = (): PropertyDecorator =>
  ValidateIf((_, value) => value !== undefined && value !== null);

/**
 * An instant with its offset: RFC 3339 needs the offset, strict ISO 8601 an existing day (RFC 3339
 * alone lets `02-30` roll over into March).
 */
const IsInstant = (): PropertyDecorator => (target, key) => {
  IsRFC3339({ message: `${String(key)} must be a date-time with an offset` })(target, key);
  IsISO8601({ strict: true, strictSeparator: true })(target, key);
};

const nullable = { nullable: true, required: false };

const caughtAtApi = {
  format: 'date-time',
  example: '2026-10-06T15:20:00Z',
  description: 'With an offset (RFC 3339); at most 5 minutes ahead of the server (BR-10)',
};
const lengthCmApi = { minimum: 1, maximum: CATCH_LENGTH_MAX_CM, example: 42 };
const weightGApi = {
  ...nullable,
  type: Number,
  minimum: 1,
  maximum: CATCH_WEIGHT_MAX_G,
  example: 900,
  description: 'Grams; a kept fish needs it while a daily weight limit applies (BR-11)',
};

/** Either both coordinates or neither. */
const hasPosition = (item: SyncCatchItemDto): boolean =>
  (item.lat ?? null) !== null || (item.lng ?? null) !== null;

/** One catch of `POST /catches/sync`, as the device recorded it. */
export class SyncCatchItemDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Generated on the device; the same clientId again returns the stored result',
  })
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({
    ...nullable,
    type: String,
    format: 'uuid',
    description: 'My platform permit; exactly one of permitId and externalPermitId',
  })
  @IfSet()
  @IsUUID()
  permitId?: string | null;

  @ApiPropertyOptional({
    ...nullable,
    type: String,
    format: 'uuid',
    description: 'My external permit (FR-26); exactly one of permitId and externalPermitId',
  })
  @IfSet()
  @IsUUID()
  externalPermitId?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fishingWaterId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  speciesId!: string;

  @ApiProperty(caughtAtApi)
  @IsInstant()
  caughtAt!: string;

  @ApiProperty(lengthCmApi)
  @IsInt()
  @Min(1)
  @Max(CATCH_LENGTH_MAX_CM)
  lengthCm!: number;

  @ApiPropertyOptional(weightGApi)
  @IfSet()
  @IsInt()
  @Min(1)
  @Max(CATCH_WEIGHT_MAX_G)
  weightG?: number | null;

  @ApiProperty({ description: 'Kept (counts towards the daily limits) or released' })
  @IsBoolean()
  kept!: boolean;

  @ApiPropertyOptional({ ...nullable, type: Number, minimum: -90, maximum: 90, example: 52.1 })
  @ValidateIf(hasPosition)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @ApiPropertyOptional({ ...nullable, type: Number, minimum: -180, maximum: 180, example: 21 })
  @ValidateIf(hasPosition)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;
}

export class SyncCatchesDto {
  @ApiProperty({ type: [SyncCatchItemDto], minItems: 1, maxItems: CATCH_SYNC_MAX_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CATCH_SYNC_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => SyncCatchItemDto)
  items!: SyncCatchItemDto[];
}

export class RuleViolationDto {
  @ApiProperty({ enum: Object.values(CatchErrorCode), enumName: 'CatchErrorCode' })
  code!: CatchErrorCode;

  @ApiProperty({ example: 'BR-04', description: 'The rule of docs/02-business-rules.md' })
  ruleId!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { limit: 2, alreadyKept: 2 },
    description: 'Per code, see docs/02-business-rules.md → «Уточнения (T-17)»',
  })
  details?: Record<string, unknown>;
}

const statusApi = {
  enum: Object.values(CatchSyncStatus),
  enumName: 'CatchSyncStatus',
  description: 'REJECTED: the catch broke a rule; it is stored with the violations',
};

export class SyncCatchResultDto {
  @ApiProperty({ format: 'uuid' })
  clientId!: string;

  @ApiProperty({ format: 'uuid', description: 'The stored catch, accepted or rejected' })
  id!: string;

  @ApiProperty(statusApi)
  status!: CatchSyncStatus;

  @ApiProperty({ type: [RuleViolationDto], description: 'Empty when ACCEPTED' })
  violations!: RuleViolationDto[];
}

export class SyncCatchesResultDto {
  @ApiProperty({ type: [SyncCatchResultDto], description: 'One per item, in the order sent' })
  results!: SyncCatchResultDto[];
}

export class CatchWaterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;
}

/** A catch of my register. */
export class CatchDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  permitId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  externalPermitId!: string | null;

  @ApiProperty({ type: CatchWaterDto })
  water!: CatchWaterDto;

  @ApiProperty({ format: 'uuid' })
  speciesId!: string;

  @ApiProperty({ format: 'date-time' })
  caughtAt!: string;

  @ApiProperty({ example: 42 })
  lengthCm!: number;

  @ApiProperty({ type: Number, nullable: true, example: 900 })
  weightG!: number | null;

  @ApiProperty()
  kept!: boolean;

  @ApiProperty({ type: Number, nullable: true })
  lat!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  lng!: number | null;

  @ApiProperty(statusApi)
  status!: CatchSyncStatus;

  @ApiProperty({ type: [RuleViolationDto], description: 'Empty when ACCEPTED' })
  violations!: RuleViolationDto[];

  @ApiProperty({
    format: 'date-time',
    description: 'Edit and delete are possible before this instant (BR-07)',
  })
  editableUntil!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class MyCatchesQueryDto {
  @ApiPropertyOptional({
    type: Number,
    example: 2026,
    description: 'Calendar year of caughtAt in Europe/Warsaw; the current one by default',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IfPresent()
  @IsInt()
  @Min(2000)
  @Max(2100)
  season?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only catches on this platform permit' })
  @IfPresent()
  @IsUUID()
  permitId?: string;
}

/**
 * Changes of a catch within the BR-07 window; omitted fields stay. The catch is checked again.
 * The permit does not change (delete the catch and record it again), nor does the position.
 */
export class UpdateCatchDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IfPresent()
  @IsUUID()
  speciesId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IfPresent()
  @IsUUID()
  fishingWaterId?: string;

  @ApiPropertyOptional({
    ...caughtAtApi,
    description: `${caughtAtApi.description}; the window must be open for it too`,
  })
  @IfPresent()
  @IsInstant()
  caughtAt?: string;

  @ApiPropertyOptional(lengthCmApi)
  @IfPresent()
  @IsInt()
  @Min(1)
  @Max(CATCH_LENGTH_MAX_CM)
  lengthCm?: number;

  @ApiPropertyOptional({ ...weightGApi, description: `${weightGApi.description}; null removes it` })
  @IfSet()
  @IsInt()
  @Min(1)
  @Max(CATCH_WEIGHT_MAX_G)
  weightG?: number | null;

  @ApiPropertyOptional()
  @IfPresent()
  @IsBoolean()
  kept?: boolean;
}

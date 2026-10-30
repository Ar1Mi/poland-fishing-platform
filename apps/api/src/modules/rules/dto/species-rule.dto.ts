import {
  LIMIT_PARAMETERS,
  type LimitParameter,
  RULE_DAILY_COUNT_MAX,
  RULE_DAILY_WEIGHT_MAX_G,
  RULE_MIN_LENGTH_MAX_CM,
  isRuleMonthDay,
} from '@lowisko/shared';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min, ValidateBy, ValidateIf } from 'class-validator';

/** Validates a value that is neither omitted nor `null` (null clears the restriction). */
const IfSet = (): PropertyDecorator =>
  ValidateIf((_, value) => value !== undefined && value !== null);

const IsRuleMonthDay = (): PropertyDecorator =>
  ValidateBy({
    name: 'isRuleMonthDay',
    validator: {
      validate: (value) => typeof value === 'string' && isRuleMonthDay(value),
      defaultMessage: (args) =>
        `${args?.property ?? 'value'} must be an existing MM-DD (02-29 is not one)`,
    },
  });

const nullable = { nullable: true, required: false };

// Each parameter's rules once, for every body that carries rule parameters.
const parameter = {
  minLengthCm: {
    api: { ...nullable, type: Number, minimum: 1, maximum: RULE_MIN_LENGTH_MAX_CM, example: 50 },
    rules: () => applyDecorators(IfSet(), IsInt(), Min(1), Max(RULE_MIN_LENGTH_MAX_CM)),
  },
  closedFrom: {
    api: { ...nullable, type: String, example: '01-01', description: 'MM-DD, with closedTo' },
    rules: () => applyDecorators(IfSet(), IsRuleMonthDay()),
  },
  closedTo: {
    api: {
      ...nullable,
      type: String,
      example: '04-30',
      description: 'MM-DD, inclusive; before closedFrom wraps over New Year',
    },
    rules: () => applyDecorators(IfSet(), IsRuleMonthDay()),
  },
  dailyLimitCount: {
    api: {
      ...nullable,
      type: Number,
      minimum: 0,
      maximum: RULE_DAILY_COUNT_MAX,
      example: 2,
      description: '0: none may be kept (no-kill)',
    },
    rules: () => applyDecorators(IfSet(), IsInt(), Min(0), Max(RULE_DAILY_COUNT_MAX)),
  },
  dailyLimitWeightG: {
    api: {
      ...nullable,
      type: Number,
      minimum: 0,
      maximum: RULE_DAILY_WEIGHT_MAX_G,
      example: 5000,
      description: '0: none may be kept (no-kill)',
    },
    rules: () => applyDecorators(IfSet(), IsInt(), Min(0), Max(RULE_DAILY_WEIGHT_MAX_G)),
  },
};

/**
 * Parameters of a rule. Omitted or `null` is «no restriction» on create; on update omitted
 * keeps the value and `null` removes it. The result must restrict something and a closed
 * period needs both days (`ruleParametersSchema`).
 */
export class UpdateSpeciesRuleDto {
  @ApiPropertyOptional(parameter.minLengthCm.api)
  @parameter.minLengthCm.rules()
  minLengthCm?: number | null;

  @ApiPropertyOptional(parameter.closedFrom.api)
  @parameter.closedFrom.rules()
  closedFrom?: string | null;

  @ApiPropertyOptional(parameter.closedTo.api)
  @parameter.closedTo.rules()
  closedTo?: string | null;

  @ApiPropertyOptional(parameter.dailyLimitCount.api)
  @parameter.dailyLimitCount.rules()
  dailyLimitCount?: number | null;

  @ApiPropertyOptional(parameter.dailyLimitWeightG.api)
  @parameter.dailyLimitWeightG.rules()
  dailyLimitWeightG?: number | null;
}

/** A general rule (from the rozporządzenie): one per species. */
export class CreateGeneralRuleDto extends UpdateSpeciesRuleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  speciesId!: string;
}

/** A rule of the organization, or of one of its connected waters. */
export class CreateOrgRuleDto extends CreateGeneralRuleDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'A water connected to the organization; omitted or null: the whole organization',
  })
  @IfSet()
  @IsUUID()
  fishingWaterId?: string | null;
}

export class RuleWaterDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Zalew Zegrzyński' })
  name!: string;
}

/** A stored rule of one level; the species name comes from `GET /species`. */
export class SpeciesRuleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  speciesId!: string;

  @ApiProperty({
    type: RuleWaterDto,
    nullable: true,
    description: 'The water of a water rule; null: the whole organization (or a general rule)',
  })
  water!: RuleWaterDto | null;

  @ApiProperty({ type: Number, nullable: true })
  minLengthCm!: number | null;

  @ApiProperty({ type: String, nullable: true, example: '01-01' })
  closedFrom!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '04-30' })
  closedTo!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  dailyLimitCount!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  dailyLimitWeightG!: number | null;

  @ApiProperty({
    enum: LIMIT_PARAMETERS,
    enumName: 'LimitParameter',
    isArray: true,
    description:
      'Parameters that do not apply: a higher level is stricter (always empty for a general rule)',
  })
  ineffective!: LimitParameter[];

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ClosedPeriodDto {
  @ApiProperty({ example: '01-01' })
  from!: string;

  @ApiProperty({ example: '04-30' })
  to!: string;
}

/** The strictest value of every level that applies to the water, per species (ADR-0008). */
export class EffectiveRuleDto {
  @ApiProperty({ format: 'uuid' })
  speciesId!: string;

  @ApiProperty({ type: Number, nullable: true })
  minLengthCm!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  dailyLimitCount!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  dailyLimitWeightG!: number | null;

  @ApiProperty({
    type: ClosedPeriodDto,
    isArray: true,
    description: 'Keeping a fish is closed on a day in any of them; ordered by start',
  })
  closedPeriods!: ClosedPeriodDto[];
}

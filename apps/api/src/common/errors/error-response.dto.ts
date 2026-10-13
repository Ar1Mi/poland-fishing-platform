import { ErrorCode } from '@lowisko/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Body of every API error (docs/05-api.md → «Общие правила»). */
export class ErrorResponseDto {
  @ApiProperty({ enum: Object.values(ErrorCode), enumName: 'ErrorCode' })
  code!: ErrorCode;

  @ApiProperty({ description: 'Developer-facing text; the UI translates `code` instead.' })
  message!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;
}

import { ErrorCode, parseBbox } from '@lowisko/shared';
import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { Public } from '../auth/decorators/auth.decorators';
import { SuperAdmin } from '../organizations/decorators/org-access.decorators';
import { WaterImportReportDto } from './dto/water-import.dto';
import { ListWatersQueryDto, WaterDetailDto, WaterListDto } from './dto/water.dto';
import { WaterImportService } from './import/water-import.service';
import { WatersService } from './waters.service';

const error = { type: ErrorResponseDto };

@ApiTags('waters')
@Public()
@Controller('waters')
export class WatersController {
  constructor(private readonly waters: WatersService) {}

  @Get()
  @ApiOperation({
    summary: 'Catalogue for the map and the list (not paginated, capped; see `truncated`)',
  })
  @ApiOkResponse({ type: WaterListDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  list(@Query() query: ListWatersQueryDto): Promise<WaterListDto> {
    const { bbox, ...filters } = query;
    // The DTO has already checked that bbox parses.
    return this.waters.list({
      ...filters,
      bbox: bbox ? (parseBbox(bbox) ?? undefined) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Water card: owner (organization or użytkownik rybacki) and links' })
  @ApiOkResponse({ type: WaterDetailDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WaterDetailDto> {
    return this.waters.get(id);
  }
}

/** Upload limit of the import: about 5000 rows; bigger files go through the CLI. */
export const WATER_IMPORT_MAX_BYTES = 1024 * 1024;

@ApiTags('admin')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'FORBIDDEN (not a super admin)' })
@SuperAdmin()
@Controller('admin/waters')
export class AdminWatersController {
  constructor(private readonly importer: WaterImportService) {}

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: WATER_IMPORT_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Import catalogue CSV: upsert by source + sourceRef, geocoding empty lat/lng',
    description:
      'Synchronous: rows that need geocoding take about 1 s each (Nominatim limit) unless ' +
      'cached. Bad rows are reported in `failed`, the others are imported.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'UTF-8 CSV' } },
    },
  })
  @ApiOkResponse({ type: WaterImportReportDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (no file, not a CSV, wrong header, too many rows)',
  })
  @ApiPayloadTooLargeResponse({ ...error, description: 'VALIDATION_FAILED (file over 1 MB)' })
  import(@UploadedFile() file: { buffer: Buffer } | undefined): Promise<WaterImportReportDto> {
    if (!file) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { file: 'is required' },
        'CSV file is required',
      );
    }
    return this.importer.import(file.buffer);
  }
}

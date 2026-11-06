import {
  ErrorCode,
  OrgRole,
  parseBbox,
  WATER_PHOTO_MAX_BYTES,
  WATER_PHOTO_MIME_TYPES,
} from '@lowisko/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser, Public } from '../auth/decorators/auth.decorators';
import { Roles, SuperAdmin } from '../organizations/decorators/org-access.decorators';
import { WaterImportReportDto } from './dto/water-import.dto';
import {
  ListWatersQueryDto,
  OrgWaterDto,
  UpdateWaterProfileDto,
  WaterDetailDto,
  WaterListDto,
} from './dto/water.dto';
import { WaterImportService } from './import/water-import.service';
import { WaterProfileService } from './profile/water-profile.service';
import { WatersService } from './waters.service';

const error = { type: ErrorResponseDto };

const badId = { ...error, description: 'VALIDATION_FAILED (id is not a UUID)' };

/** One multipart field `file`, as for the other uploads. */
const photoUpload = FileInterceptor('file', {
  limits: { fileSize: WATER_PHOTO_MAX_BYTES, files: 1, fields: 0, parts: 1 },
});

@ApiTags('waters')
@Public()
@Controller('waters')
export class WatersController {
  constructor(
    private readonly waters: WatersService,
    private readonly profiles: WaterProfileService,
  ) {}

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

  @Get(':id/photo')
  @ApiOperation({ summary: 'Photo of the water card (FR-05); `v` only changes the URL' })
  @ApiProduces(...WATER_PHOTO_MIME_TYPES)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (water, its photo or the file)' })
  async photo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { stream, size, type, fileName } = await this.profiles.readPhoto(id);
    // Only on success (`@Header` would mark a 404 as cacheable too): a new photo is a new URL
    // (`?v=<photoVersion>`), so the image may be kept.
    response.setHeader('Cache-Control', 'public, max-age=86400');
    // An image tag shows it anyway; opened directly, an uploaded file is never our page.
    return new StreamableFile(stream, {
      type,
      length: size,
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN' })
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId/waters')
export class OrgWatersController {
  constructor(
    private readonly waters: WatersService,
    private readonly profiles: WaterProfileService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Waters connected to the organization, by name' })
  @ApiOkResponse({ type: OrgWaterDto, isArray: true })
  list(@Param('orgId') orgId: string): Promise<OrgWaterDto[]> {
    return this.waters.listConnected(orgId);
  }

  @Get(':id')
  // The edit form must see the stored values, not a copy kept by the PWA or a proxy.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Card of a connected water for its edit form (not cached)' })
  @ApiOkResponse({ type: WaterDetailDto })
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (not a water of the organization)' })
  get(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WaterDetailDto> {
    return this.profiles.getConnected(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Description and season of a connected water (FR-05)' })
  @ApiOkResponse({ type: WaterDetailDto, description: 'The public card after the change' })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (not a water of the organization)' })
  update(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateWaterProfileDto,
  ): Promise<WaterDetailDto> {
    return this.profiles.update(orgId, user.id, id, dto);
  }

  @Put(':id/photo')
  @UseInterceptors(photoUpload)
  @ApiOperation({ summary: 'Photo of the card (JPEG, PNG or WebP, up to 5 MB); replaces the last' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: WaterDetailDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (id, no file, unsupported type)',
  })
  @ApiPayloadTooLargeResponse({ ...error, description: 'VALIDATION_FAILED (file over 5 MB)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (not a water of the organization)' })
  setPhoto(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<WaterDetailDto> {
    if (!file) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file is required'] } },
        'Photo file is required',
      );
    }
    return this.profiles.setPhoto(orgId, user.id, id, file.buffer);
  }

  @Delete(':id/photo')
  @ApiOperation({ summary: 'Remove the photo of the card; answers the card without it' })
  @ApiOkResponse({ type: WaterDetailDto })
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (not a water of the organization)' })
  deletePhoto(
    @Param('orgId') orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<WaterDetailDto> {
    return this.profiles.deletePhoto(orgId, user.id, id);
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
        { fields: { file: ['file is required'] } },
        'CSV file is required',
      );
    }
    return this.importer.import(file.buffer);
  }
}

import {
  EXTERNAL_PERMIT_PHOTO_MAX_BYTES,
  EXTERNAL_PERMIT_PHOTO_MIME_TYPES,
  ErrorCode,
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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../../common/errors/domain-error';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import {
  CreateExternalPermitDto,
  ExternalOfflineBundleDto,
  ExternalPermitDto,
  UpdateExternalPermitDto,
} from '../dto/external-permit.dto';
import { ExternalPermitsService } from './external-permits.service';

const error = { type: ErrorResponseDto };
const badId = { ...error, description: 'VALIDATION_FAILED (id is not a UUID)' };
const notFound = { ...error, description: 'NOT_FOUND (also a permit of someone else)' };

// Personal data and a photo of a document fetched with a token: no copy in browser or proxy
// caches (`Cache-Control: no-store`), as for `/me/permits`.
const NO_STORE = ['Cache-Control', 'no-store'] as const;

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('me/external-permits')
export class ExternalPermitsController {
  constructor(private readonly externalPermits: ExternalPermitsService) {}

  @Get()
  @Header(...NO_STORE)
  @ApiOperation({ summary: 'My external permits (FR-26), latest start first' })
  @ApiOkResponse({ type: [ExternalPermitDto] })
  list(@CurrentUser() user: AuthUser): Promise<ExternalPermitDto[]> {
    return this.externalPermits.list(user.id);
  }

  @Post()
  @Header(...NO_STORE)
  @ApiOperation({ summary: 'Add a permit bought outside the platform; the photo goes separately' })
  @ApiCreatedResponse({ type: ExternalPermitDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (fields; dates out of order or range; unknown waters)',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExternalPermitDto,
  ): Promise<ExternalPermitDto> {
    return this.externalPermits.create(user.id, dto);
  }

  @Get(':id')
  @Header(...NO_STORE)
  @ApiOperation({ summary: 'My external permit' })
  @ApiOkResponse({ type: ExternalPermitDto })
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse(notFound)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExternalPermitDto> {
    return this.externalPermits.get(user.id, id);
  }

  @Patch(':id')
  @Header(...NO_STORE)
  @ApiOperation({
    summary: 'Change my external permit; catches already recorded on it are not checked again',
  })
  @ApiOkResponse({ type: ExternalPermitDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (id, fields; dates out of order or range; unknown waters)',
  })
  @ApiNotFoundResponse(notFound)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExternalPermitDto,
  ): Promise<ExternalPermitDto> {
    return this.externalPermits.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my external permit without catches, with its photo' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse(notFound)
  @ApiConflictResponse({ ...error, description: 'EXTERNAL_PERMIT_IN_USE (it has catches)' })
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.externalPermits.delete(user.id, id);
  }

  @Put(':id/photo')
  @Header(...NO_STORE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: EXTERNAL_PERMIT_PHOTO_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Photo or scan of the permit (PDF, JPEG, PNG or WebP, up to 5 MB); replaces the last',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: ExternalPermitDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (id, no file, unsupported type)',
  })
  @ApiPayloadTooLargeResponse({ ...error, description: 'VALIDATION_FAILED (file over 5 MB)' })
  @ApiNotFoundResponse(notFound)
  setPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ExternalPermitDto> {
    if (!file) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file is required'] } },
        'Photo is required',
      );
    }
    return this.externalPermits.setPhoto(user.id, id, file.buffer);
  }

  @Get(':id/photo')
  @Header(...NO_STORE)
  @ApiOperation({ summary: 'Photo or scan of my external permit, as an attachment' })
  @ApiProduces(...EXTERNAL_PERMIT_PHOTO_MIME_TYPES)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (permit, its photo or the file)' })
  async photo(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { content, type, fileName } = await this.externalPermits.readPhoto(user.id, id);
    // Never rendered inline: an uploaded file is not trusted content of our origin.
    return new StreamableFile(content, { type, disposition: `attachment; filename="${fileName}"` });
  }

  @Delete(':id/photo')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove the photo of my external permit' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse(notFound)
  async deletePhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.externalPermits.deletePhoto(user.id, id);
  }

  @Get(':id/offline-bundle')
  @Header(...NO_STORE)
  @ApiOperation({
    summary:
      'My external permit with the general rules on each of its waters: what the PWA stores ' +
      'to record catches on it offline (ADR-0009)',
  })
  @ApiOkResponse({ type: ExternalOfflineBundleDto })
  @ApiBadRequestResponse(badId)
  @ApiNotFoundResponse(notFound)
  offlineBundle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExternalOfflineBundleDto> {
    return this.externalPermits.offlineBundle(user.id, id);
  }
}

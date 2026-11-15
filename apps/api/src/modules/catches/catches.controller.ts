import { CATCH_PHOTO_MAX_BYTES, CATCH_PHOTO_MIME_TYPES, ErrorCode } from '@lowisko/shared';
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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { RateLimit } from '../../common/throttling/rate-limit.decorator';
import { type AuthUser, CurrentUser } from '../auth/decorators/auth.decorators';
import { CatchesService } from './catches.service';
import { CatchPhotoService } from './photo/catch-photo.service';
import {
  CatchDto,
  MyCatchesQueryDto,
  SyncCatchesDto,
  SyncCatchesResultDto,
  UpdateCatchDto,
} from './dto/catch.dto';

const error = { type: ErrorResponseDto };

const editWindowClosed = {
  ...error,
  description: 'EDIT_WINDOW_CLOSED (BR-07; details.editableUntil)',
};

@ApiTags('catches')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('catches')
export class CatchesController {
  constructor(
    private readonly catches: CatchesService,
    private readonly photos: CatchPhotoService,
  ) {}

  @Post('sync')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Record a batch of catches; each is checked against the rules (BR-*) in the order of ' +
      'caughtAt and stored ACCEPTED or REJECTED with its violations',
  })
  @ApiOkResponse({ type: SyncCatchesResultDto })
  @ApiBadRequestResponse({
    ...error,
    description:
      'VALIDATION_FAILED (also an unknown permit, external permit, water or species, a permit ' +
      'of someone else, not exactly one permit, a clientId twice or of someone else)',
  })
  async sync(
    @CurrentUser() user: AuthUser,
    @Body() dto: SyncCatchesDto,
  ): Promise<SyncCatchesResultDto> {
    return { results: await this.catches.sync(user.id, dto.items) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change my catch within the BR-07 window; it is checked again' })
  @ApiOkResponse({ type: CatchDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (also id not a UUID, unknown water or species)',
  })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a catch of someone else)' })
  @ApiUnprocessableEntityResponse(editWindowClosed)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatchDto,
  ): Promise<CatchDto> {
    return this.catches.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my catch within the BR-07 window' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a catch of someone else)' })
  @ApiUnprocessableEntityResponse(editWindowClosed)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.catches.remove(user.id, id);
  }

  @Put(':id/photo')
  @RateLimit('upload')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CATCH_PHOTO_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({
    summary:
      'Photo of my catch (FR-14; JPEG, PNG or WebP, up to 5 MB) within the BR-07 window; ' +
      'replaces the last',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: CatchDto })
  @ApiBadRequestResponse({
    ...error,
    description: 'VALIDATION_FAILED (id, no file, unsupported type, undecodable or over 100 MP)',
  })
  @ApiPayloadTooLargeResponse({ ...error, description: 'VALIDATION_FAILED (file over 5 MB)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a catch of someone else)' })
  @ApiUnprocessableEntityResponse(editWindowClosed)
  setPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<CatchDto> {
    if (!file) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        { fields: { file: ['file is required'] } },
        'Photo is required',
      );
    }
    return this.photos.setPhoto(user.id, id, file.buffer);
  }

  @Get(':id/photo')
  // Personal data fetched with a token: no copy in browser or proxy caches.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Photo of my catch, as an attachment' })
  @ApiProduces(...CATCH_PHOTO_MIME_TYPES)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (catch, its photo or the file)' })
  async photo(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { content, type, fileName } = await this.photos.readPhoto(user.id, id);
    // Never rendered inline: an uploaded file is not trusted content of our origin.
    return new StreamableFile(content, { type, disposition: `attachment; filename="${fileName}"` });
  }

  @Delete(':id/photo')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove the photo of my catch within the BR-07 window' })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a catch of someone else)' })
  @ApiUnprocessableEntityResponse(editWindowClosed)
  deletePhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.photos.deletePhoto(user.id, id);
  }
}

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('me/catches')
export class MyCatchesController {
  constructor(private readonly catches: CatchesService) {}

  @Get()
  // Personal data: no copy in browser or proxy caches.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'My register of a season, latest catch first' })
  @ApiOkResponse({ type: [CatchDto] })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED' })
  list(@CurrentUser() user: AuthUser, @Query() query: MyCatchesQueryDto): Promise<CatchDto[]> {
    return this.catches.list(user.id, query);
  }
}

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
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../auth/decorators/auth.decorators';
import { CatchesService } from './catches.service';
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
  constructor(private readonly catches: CatchesService) {}

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

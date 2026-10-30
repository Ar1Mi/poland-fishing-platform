import { Controller, Get, Header, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import { MyPermitDto } from '../dto/permit.dto';
import { MyPermitsService } from './my-permits.service';

const error = { type: ErrorResponseDto };

// Personal data and QR tokens fetched with a token: every route keeps no copy in browser or
// proxy caches (`Cache-Control: no-store`).
const NO_STORE = ['Cache-Control', 'no-store'] as const;

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('me/permits')
export class MyPermitsController {
  constructor(private readonly myPermits: MyPermitsService) {}

  @Get()
  @Header(...NO_STORE)
  @ApiOperation({ summary: 'My permits with computed statuses, latest start first' })
  @ApiOkResponse({ type: [MyPermitDto] })
  list(@CurrentUser() user: AuthUser): Promise<MyPermitDto[]> {
    return this.myPermits.list(user.id);
  }

  @Get(':id')
  @Header(...NO_STORE)
  @ApiOperation({
    summary: 'My permit with its computed status and QR token (polled after payment)',
  })
  @ApiOkResponse({ type: MyPermitDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a permit of someone else)' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MyPermitDto> {
    return this.myPermits.get(user.id, id);
  }

  @Get(':id/pdf')
  @Header(...NO_STORE)
  @ApiOperation({ summary: 'The permit with its QR code as a PDF attachment' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a permit of someone else)' })
  @ApiUnprocessableEntityResponse({
    ...error,
    description: 'PERMIT_NOT_VALID (not SCHEDULED or ACTIVE; details.status)',
  })
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { fileName, content } = await this.myPermits.pdf(user.id, id);
    return new StreamableFile(content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}

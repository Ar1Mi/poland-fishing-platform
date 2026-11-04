import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import { SeasonQueryDto } from '../dto/catch.dto';
import { ExternalRegisterService } from './external-register.service';

const error = { type: ErrorResponseDto };

/** The register PDF lives with the catches; the permit itself is PermitsModule's (FR-27). */
@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('me/external-permits')
export class ExternalRegisterController {
  constructor(private readonly register: ExternalRegisterService) {}

  @Get(':id/register.pdf')
  // Personal data fetched with a token: no copy in browser or proxy caches.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Season register of the kept fish on my external permit, as a PDF attachment for the ' +
      'owner of the water; rejected catches are marked as violations',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id, season)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a permit of someone else)' })
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: SeasonQueryDto,
  ): Promise<StreamableFile> {
    const { fileName, content } = await this.register.pdf(user.id, id, query.season);
    return new StreamableFile(content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}

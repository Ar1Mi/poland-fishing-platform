import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common/errors/error-response.dto';
import { type AuthUser, CurrentUser } from '../../auth/decorators/auth.decorators';
import { MyPermitDto } from '../dto/permit.dto';
import { MyPermitsService } from './my-permits.service';

const error = { type: ErrorResponseDto };

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@Controller('me/permits')
export class MyPermitsController {
  constructor(private readonly myPermits: MyPermitsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'My permit with its computed status (polled after payment)' })
  @ApiOkResponse({ type: MyPermitDto })
  @ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (id is not a UUID)' })
  @ApiNotFoundResponse({ ...error, description: 'NOT_FOUND (also a permit of someone else)' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MyPermitDto> {
    return this.myPermits.get(user.id, id);
  }
}

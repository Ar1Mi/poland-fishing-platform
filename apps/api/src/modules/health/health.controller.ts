import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClockService } from '../../common/clock/clock.service';
import { Public } from '../auth/decorators/auth.decorators';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly clock: ClockService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return { status: 'ok', time: this.clock.now().toISOString() };
  }
}

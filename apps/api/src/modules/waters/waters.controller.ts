import { parseBbox } from '@lowisko/shared';
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { Public } from '../auth/decorators/auth.decorators';
import { ListWatersQueryDto, WaterDetailDto, WaterListDto } from './dto/water.dto';
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

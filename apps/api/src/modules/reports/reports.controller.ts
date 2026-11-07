import { OrgRole } from '@lowisko/shared';
import { Controller, Get, Header, Param, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { Roles } from '../organizations/decorators/org-access.decorators';
import { OrgStatsDto, StatsQueryDto } from './dto/stats.dto';
import { ReportsService } from './reports.service';

const error = { type: ErrorResponseDto };

@ApiTags('orgs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ ...error, description: 'UNAUTHENTICATED, TOKEN_EXPIRED' })
@ApiForbiddenResponse({ ...error, description: 'ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN' })
@ApiBadRequestResponse({ ...error, description: 'VALIDATION_FAILED (from, to)' })
@Roles(OrgRole.ORG_ADMIN)
@Controller('orgs/:orgId')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('stats')
  @ApiOperation({
    summary:
      'Sales of the organization and accepted catches on its permits by species and water ' +
      '(FR-19), in a period of Warsaw days',
  })
  @ApiOkResponse({ type: OrgStatsDto })
  stats(@Param('orgId') orgId: string, @Query() query: StatsQueryDto): Promise<OrgStatsDto> {
    return this.reports.stats(orgId, query);
  }

  @Get('catches.csv')
  // Data of the organization's anglers fetched with a token: no copy in browser or proxy caches.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Catches on permits of the organization in a period, accepted and rejected, as CSV for a ' +
      'Polish spreadsheet (`;`, UTF-8 with BOM, CRLF); permit number, no angler name or position',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async catchesCsv(
    @Param('orgId') orgId: string,
    @Query() query: StatsQueryDto,
  ): Promise<StreamableFile> {
    const { fileName, content } = await this.reports.catchesCsv(orgId, query);
    return new StreamableFile(content, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { SpeciesDto } from './dto/species.dto';
import { SpeciesService } from './species.service';

@ApiTags('species')
@Public()
@Controller('species')
export class SpeciesController {
  constructor(private readonly species: SpeciesService) {}

  @Get()
  @ApiOperation({ summary: 'Species dictionary with names in pl, en and ru' })
  @ApiOkResponse({ type: SpeciesDto, isArray: true })
  list(): Promise<SpeciesDto[]> {
    return this.species.list();
  }
}

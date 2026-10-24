import { ApiProperty } from '@nestjs/swagger';

export class WaterImportFailureDto {
  @ApiProperty({ description: 'CSV record number, the header is 1', example: 7 })
  row!: number;

  @ApiProperty({ example: 'region: must be a voivodeship in lower case, e.g. mazowieckie' })
  error!: string;
}

export class WaterImportReportDto {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty({ type: WaterImportFailureDto, isArray: true })
  failed!: WaterImportFailureDto[];
}

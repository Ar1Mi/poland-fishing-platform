import { ApiProperty } from '@nestjs/swagger';

export class SpeciesDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Esox lucius' })
  latinName!: string;

  @ApiProperty({ example: 'Szczupak' })
  namePl!: string;

  @ApiProperty({ example: 'Northern pike' })
  nameEn!: string;

  @ApiProperty({ example: 'Щука' })
  nameRu!: string;

  @ApiProperty({ description: 'Under protection: may not be kept' })
  isProtected!: boolean;
}

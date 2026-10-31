import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { SpeciesDto } from './dto/species.dto';

/** Owner of the `Species` dictionary (T-09). */
@Injectable()
export class SpeciesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The whole dictionary (about 15 species), by Polish name; the client picks the language. */
  list(): Promise<SpeciesDto[]> {
    return this.prisma.species.findMany({
      select: {
        id: true,
        latinName: true,
        namePl: true,
        nameEn: true,
        nameRu: true,
        isProtected: true,
      },
      orderBy: [{ namePl: 'asc' }, { id: 'asc' }],
    });
  }

  /** Whether each of `ids` is protected (BR-06), for the known ones. */
  async findProtection(ids: string[]): Promise<Map<string, boolean>> {
    const species = await this.prisma.species.findMany({
      where: { id: { in: ids } },
      select: { id: true, isProtected: true },
    });
    return new Map(species.map(({ id, isProtected }) => [id, isProtected]));
  }
}

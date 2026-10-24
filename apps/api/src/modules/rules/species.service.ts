import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { SpeciesDto } from './dto/species.dto';

/** Owner of the `Species` dictionary; rules per species follow in T-16. */
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
}

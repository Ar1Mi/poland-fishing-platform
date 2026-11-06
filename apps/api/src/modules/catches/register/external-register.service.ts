import { ErrorCode, warsawDate } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../../common/clock/clock.service';
import { DomainError } from '../../../common/errors/domain-error';
import { ExternalPermitsService } from '../../permits/external-permits/external-permits.service';
import { SpeciesService } from '../../rules/species.service';
import { UsersService } from '../../users/users.service';
import { CatchesService } from '../catches.service';
import { RegisterPdfService } from './register-pdf.service';

export interface RegisterPdf {
  fileName: string;
  content: Buffer;
}

/**
 * The season register of an external permit as a PDF (FR-27, scenario Г): the angler sends it
 * to the owner of the water, as the paper register would be handed in.
 */
@Injectable()
export class ExternalRegisterService {
  constructor(
    private readonly catches: CatchesService,
    private readonly externalPermits: ExternalPermitsService,
    private readonly users: UsersService,
    private readonly species: SpeciesService,
    private readonly pdfs: RegisterPdfService,
    private readonly clock: ClockService,
  ) {}

  /** A permit of someone else is as unknown as a missing one; an empty season is a PDF too. */
  async pdf(userId: string, id: string, season?: number): Promise<RegisterPdf> {
    const generatedAt = this.clock.now();
    const year = season ?? Number(warsawDate(generatedAt).slice(0, 4));
    const permit = await this.externalPermits.get(userId, id);
    const [holder, catches, species] = await Promise.all([
      this.users.findById(userId),
      this.catches.keptOnExternalPermit(userId, id, year),
      this.species.list(),
    ]);
    if (!holder) {
      throw new DomainError(ErrorCode.NOT_FOUND, undefined, 'External permit not found');
    }
    const content = await this.pdfs.render({
      season: year,
      permit,
      holder: {
        firstName: holder.firstName,
        lastName: holder.lastName,
        anglerCardNo: holder.anglerCardNo,
      },
      catches,
      speciesNames: new Map(species.map((item) => [item.id, item.namePl])),
      generatedAt,
    });
    return { fileName: `rejestr-polowow-${year}.pdf`, content };
  }
}

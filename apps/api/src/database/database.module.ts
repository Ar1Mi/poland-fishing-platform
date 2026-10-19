import { Global, Module } from '@nestjs/common';
import { PermitNumberService } from './permit-number.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PermitNumberService],
  exports: [PrismaService, PermitNumberService],
})
export class DatabaseModule {}

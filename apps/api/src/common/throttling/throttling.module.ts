import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { THROTTLERS } from './throttlers';

/** Registers every limit once (ThrottlerModule is global); routes opt in with `RateLimit`. */
@Module({ imports: [ThrottlerModule.forRoot(THROTTLERS)] })
export class ThrottlingModule {}

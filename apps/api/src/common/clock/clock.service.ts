import { Injectable } from '@nestjs/common';

/** The only place that reads the system clock; tests override this provider with a fixed time. */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }
}

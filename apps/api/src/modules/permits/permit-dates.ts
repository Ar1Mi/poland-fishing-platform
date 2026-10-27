import type { DateOnly } from '@lowisko/shared';

// `@db.Date` columns travel through Prisma as a Date at UTC midnight of that calendar day.

export const toDbDate = (date: DateOnly): Date => new Date(`${date}T00:00:00.000Z`);

export const fromDbDate = (date: Date): DateOnly => date.toISOString().slice(0, 10);

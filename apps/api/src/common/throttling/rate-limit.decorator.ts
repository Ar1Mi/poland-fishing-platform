import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { ErrorResponseDto } from '../errors/error-response.dto';
import { THROTTLER_NAMES, type ThrottlerName } from './throttlers';

/**
 * `@SkipThrottle` argument that leaves only `names` on. Every throttler is listed, so one added
 * later stays off on routes that did not ask for it.
 */
export function onlyThrottlers(...names: ThrottlerName[]): Record<ThrottlerName, boolean> {
  return Object.fromEntries(THROTTLER_NAMES.map((name) => [name, !names.includes(name)])) as Record<
    ThrottlerName,
    boolean
  >;
}

/**
 * Applies the named limits (throttlers.ts) to one route; over a limit → 429 RATE_LIMITED.
 * On a method it runs after the global JwtAuthGuard and the guards of the class (`@Roles` puts
 * RolesGuard and OrgScopeGuard there): a rejected request does not count, and the tracker sees
 * the logged-in user. Keep `@Roles` on the class: a method-level `@Roles` above `@RateLimit`
 * would let an outsider spend the quota of an organization.
 * Not for a controller that already uses ThrottlerGuard: the guard would count twice.
 */
export const RateLimit = (...names: ThrottlerName[]): MethodDecorator =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    SkipThrottle(onlyThrottlers(...names)),
    ApiTooManyRequestsResponse({
      type: ErrorResponseDto,
      description: `RATE_LIMITED (${names.join(', ')}, docs/07-security.md)`,
    }),
  );

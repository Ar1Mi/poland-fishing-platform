import {
  type EffectivePermitStatus,
  type PermitStatus,
  effectivePermitStatus,
} from '@lowisko/shared';
import type { DevicePermit } from '../../../shared/offline/db';

/** The stored status behind one the API computed (ADR-0005): what BR-01 reads. */
export function storedStatus(status: EffectivePermitStatus): PermitStatus {
  return status === 'SCHEDULED' || status === 'ACTIVE' || status === 'EXPIRED' ? 'PAID' : status;
}

/**
 * The permit with its status at `now`, from the device: one fetched as scheduled turns active
 * at midnight without network too.
 */
export function withStatusAt(permit: DevicePermit, now: Date): DevicePermit {
  const { validFrom, validTo } = permit;
  const status = effectivePermitStatus(
    { status: storedStatus(permit.status), validFrom, validTo },
    now,
  );
  return { ...permit, status };
}

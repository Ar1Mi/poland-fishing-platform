import { useSessionStatus, useCurrentUserId } from '../../auth/api/useAuth';
import type { DevicePermit } from '../../../shared/offline/db';
import { useDeviceData } from '../../../shared/offline/use-device';
import { useOnline } from '../../../shared/offline/use-online';
import { withStatusAt } from '../lib/device-status';

/**
 * The permits kept on the device (ADR-0009), used when the server cannot be asked: an offline
 * session or no network. `permits` is `undefined` online and while the device is read; latest
 * start first, as `GET /me/permits` lists them, with their status now.
 */
export function useDevicePermits(): { offline: boolean; permits: DevicePermit[] | undefined } {
  const status = useSessionStatus();
  const online = useOnline();
  const offline = status === 'offline' || !online;
  const device = useDeviceData(useCurrentUserId());
  if (!offline || !device) {
    return { offline, permits: undefined };
  }
  const now = new Date();
  return {
    offline,
    permits: device.permits
      .map((permit) => withStatusAt(permit, now))
      // As the server gives it: a QR only while the permit is scheduled or active (ADR-0006).
      .map((permit) =>
        permit.status === 'SCHEDULED' || permit.status === 'ACTIVE'
          ? permit
          : { ...permit, qrToken: null },
      )
      .sort(
        (a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.localeCompare(a.createdAt),
      ),
  };
}

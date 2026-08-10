export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export type DeviceSession = {
  campaignId: string;
  deviceId: string;
  exp: number;
};

export function deviceCookieName(campaignId: string) {
  return `qt_device_${campaignId.slice(-12)}`;
}

export function deviceLabel(deviceId: string) {
  return `TB-${deviceId.slice(-8).toUpperCase()}`;
}

export function remainingDeviceSpins(spinsLimit: number, spinsUsed: number) {
  return Math.max(0, spinsLimit - spinsUsed);
}

export function resetDeviceSpinLimit(spinsUsed: number) {
  return spinsUsed + 1;
}

export function matchesDeviceSession(
  session: DeviceSession | null,
  campaignId: string,
) {
  return session?.campaignId === campaignId && Boolean(session.deviceId);
}

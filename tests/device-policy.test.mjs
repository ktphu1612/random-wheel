import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_COOKIE_MAX_AGE,
  deviceCookieName,
  deviceLabel,
  matchesDeviceSession,
  remainingDeviceSpins,
  resetDeviceSpinLimit,
} from "../lib/device-policy.ts";

test("isolates device cookies by campaign", () => {
  assert.equal(
    deviceCookieName("cmp_alpha_123456789012"),
    "qt_device_123456789012",
  );
  assert.notEqual(
    deviceCookieName("cmp_alpha_123456789012"),
    deviceCookieName("cmp_beta_123456789013"),
  );
  assert.equal(DEVICE_COOKIE_MAX_AGE, 400 * 24 * 60 * 60);
});

test("shows a stable short device label", () => {
  assert.equal(deviceLabel("dev_abcdef1234567890"), "TB-34567890");
});

test("grants one initial spin and never reports a negative balance", () => {
  assert.equal(remainingDeviceSpins(1, 0), 1);
  assert.equal(remainingDeviceSpins(1, 1), 0);
  assert.equal(remainingDeviceSpins(1, 2), 0);
});

test("reset grants exactly one available spin without stacking", () => {
  assert.equal(resetDeviceSpinLimit(0), 1);
  assert.equal(resetDeviceSpinLimit(3), 4);
  assert.equal(resetDeviceSpinLimit(3), 4);
});

test("accepts a signed session only for its campaign", () => {
  const session = {
    campaignId: "cmp_a",
    deviceId: "dev_a",
    exp: Date.now() + 1000,
  };
  assert.equal(matchesDeviceSession(session, "cmp_a"), true);
  assert.equal(matchesDeviceSession(session, "cmp_b"), false);
  assert.equal(matchesDeviceSession(null, "cmp_a"), false);
});

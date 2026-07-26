import { describe, it, expect } from 'vitest';
import { monthBucketOf, sessionWindowOf, SESSION_WINDOWS } from '../src/time-buckets';

describe('monthBucketOf', () => {
  it('extracts UTC year/month/key from a mid-month timestamp', () => {
    expect(monthBucketOf('2026-01-15T10:00:00.000Z')).toEqual({ key: '2026-01', year: 2026, month: 1 });
  });

  it('zero-pads single-digit months in the key', () => {
    expect(monthBucketOf('2026-03-01T00:00:00.000Z').key).toBe('2026-03');
  });

  it('handles a December timestamp without rolling into the next year', () => {
    expect(monthBucketOf('2026-12-31T23:59:59.000Z')).toEqual({ key: '2026-12', year: 2026, month: 12 });
  });

  it('reads the UTC calendar date, not a local one, for a timestamp near midnight UTC', () => {
    // 2026-02-01T00:30:00.000Z is February 1st in UTC regardless of the
    // reader's local timezone.
    expect(monthBucketOf('2026-02-01T00:30:00.000Z')).toEqual({ key: '2026-02', year: 2026, month: 2 });
  });
});

describe('SESSION_WINDOWS', () => {
  it('defines exactly 4 fixed, contiguous UTC-hour windows covering the full day', () => {
    expect(SESSION_WINDOWS).toHaveLength(4);
    expect(SESSION_WINDOWS[0]).toMatchObject({ key: 'h00_06', startHour: 0, endHour: 6 });
    expect(SESSION_WINDOWS[3]).toMatchObject({ key: 'h18_24', startHour: 18, endHour: 24 });
    // Contiguous: each window's endHour is the next window's startHour.
    for (let i = 1; i < SESSION_WINDOWS.length; i++) {
      expect(SESSION_WINDOWS[i].startHour).toBe(SESSION_WINDOWS[i - 1].endHour);
    }
  });
});

describe('sessionWindowOf', () => {
  it('maps hour 0 (window start, inclusive) to h00_06', () => {
    expect(sessionWindowOf('2026-01-01T00:00:00.000Z')).toBe('h00_06');
  });

  it('maps hour 5 (window end, exclusive) to h00_06, not h06_12', () => {
    expect(sessionWindowOf('2026-01-01T05:59:00.000Z')).toBe('h00_06');
  });

  it('maps hour 6 (boundary) to h06_12, not h00_06', () => {
    expect(sessionWindowOf('2026-01-01T06:00:00.000Z')).toBe('h06_12');
  });

  it('maps hour 12 (boundary) to h12_18', () => {
    expect(sessionWindowOf('2026-01-01T12:00:00.000Z')).toBe('h12_18');
  });

  it('maps hour 18 (boundary) to h18_24', () => {
    expect(sessionWindowOf('2026-01-01T18:00:00.000Z')).toBe('h18_24');
  });

  it('maps hour 23 (last hour of day) to h18_24', () => {
    expect(sessionWindowOf('2026-01-01T23:30:00.000Z')).toBe('h18_24');
  });
});

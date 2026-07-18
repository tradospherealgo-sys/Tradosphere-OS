import type { PriceBar } from '@tradosphere/shared-types';
import { InsufficientDataError } from './errors';

export interface VolumeAnalysis {
  averageVolume: number;
  latestVolume: number;
  volumeSpike: boolean;
}

export function analyzeVolume(bars: PriceBar[], period = 20, spikeMultiplier = 1.5): VolumeAnalysis {
  if (bars.length < period + 1) {
    throw new InsufficientDataError(`volume analysis needs at least ${period + 1} bars, got ${bars.length}`);
  }
  // Trailing window excludes the latest bar -- we're comparing "today" against
  // the preceding baseline, not including today in its own baseline.
  const window = bars.slice(-period - 1, -1);
  const averageVolume = window.reduce((sum, b) => sum + b.volume, 0) / window.length;
  const latestVolume = bars[bars.length - 1].volume;
  return {
    averageVolume: Number(averageVolume.toFixed(2)),
    latestVolume,
    volumeSpike: latestVolume >= averageVolume * spikeMultiplier,
  };
}

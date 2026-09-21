export type SlopLabel = 'slop' | 'not_slop';

export type Verdict = {
  tweetId: string;
  label: SlopLabel;
  slopP: number;
  notP: number;
  model: string;
};

export function percent(p: number): number {
  return Math.round(Math.min(1, Math.max(0, p)) * 100);
}

export function overThreshold(verdict: Pick<Verdict, 'slopP'>, threshold: number): boolean {
  return verdict.slopP >= threshold;
}

export function shouldStamp(verdict: Verdict, threshold: number, stampEnabled: boolean): boolean {
  return stampEnabled && overThreshold(verdict, threshold);
}

/** Front copy always shows slopP so the pill matches the Slop threshold slider. */
export function badgeCopy(
  verdict: Pick<Verdict, 'slopP'>,
  threshold: number,
): { tone: 'ok' | 'stop'; text: string } {
  const n = percent(verdict.slopP);
  if (overThreshold(verdict, threshold)) {
    return { tone: 'stop', text: `Stop | ${n}%` };
  }
  return { tone: 'ok', text: `Slop | ${n}%` };
}

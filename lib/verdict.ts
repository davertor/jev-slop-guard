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

export function shouldStamp(verdict: Verdict, threshold: number, stampEnabled: boolean): boolean {
  return stampEnabled && verdict.slopP >= threshold;
}

export function badgeCopy(verdict: Verdict, stamped: boolean): { tone: 'ok' | 'stop'; text: string } {
  if (stamped) {
    return { tone: 'stop', text: `Stop | ${percent(verdict.slopP)}%` };
  }
  return { tone: 'ok', text: `Not slop | ${percent(verdict.notP)}%` };
}

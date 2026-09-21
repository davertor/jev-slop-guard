import type { Settings } from './settings';
import type { Verdict } from './verdict';

export type TweetPayload = {
  id: string;
  text: string;
  handle: string;
};

export type JudgeTweetMessage = {
  type: 'JUDGE_TWEET';
  tweet: TweetPayload;
};

export type GetSettingsMessage = {
  type: 'GET_SETTINGS';
};

export type PingMessage = {
  type: 'PING';
};

export type ExtensionMessage = JudgeTweetMessage | GetSettingsMessage | PingMessage;

export type JudgeOk = { ok: true; verdict: Verdict };
export type JudgeErr = {
  ok: false;
  code: 'NO_KEY' | 'PAUSED' | 'JEV' | 'NETWORK';
  error: string;
};
export type JudgeResult = JudgeOk | JudgeErr;

export type SettingsResult = { ok: true; settings: Settings };

export function isJudgeTweetMessage(value: unknown): value is JudgeTweetMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as JudgeTweetMessage;
  return (
    msg.type === 'JUDGE_TWEET' &&
    !!msg.tweet &&
    typeof msg.tweet.id === 'string' &&
    typeof msg.tweet.text === 'string'
  );
}

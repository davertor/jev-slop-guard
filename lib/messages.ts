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

export type XStatusMessage = {
  type: 'X_STATUS';
};

export type InjectXMessage = {
  type: 'INJECT_X';
  tabId: number;
};

export type LiStatusMessage = {
  type: 'LI_STATUS';
};

export type InjectLiMessage = {
  type: 'INJECT_LI';
  tabId: number;
};

export type ExtensionMessage =
  | JudgeTweetMessage
  | GetSettingsMessage
  | PingMessage
  | XStatusMessage
  | InjectXMessage
  | LiStatusMessage
  | InjectLiMessage;

export type XStatusResult = {
  ok: true;
  live: true;
  cards: number;
  ready: number;
  miss?: string;
};

export type LiStatusResult = {
  ok: true;
  live: true;
  cards: number;
  ready: number;
};

export type InjectXResult = { ok: true } | { ok: false; error: string };

export function isInjectXMessage(value: unknown): value is InjectXMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as InjectXMessage;
  return msg.type === 'INJECT_X' && typeof msg.tabId === 'number';
}

export function isInjectLiMessage(value: unknown): value is InjectLiMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as InjectLiMessage;
  return msg.type === 'INJECT_LI' && typeof msg.tabId === 'number';
}

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

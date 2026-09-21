import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import type { TweetPayload } from './messages';
import type { Settings } from './settings';
import type { Verdict } from './verdict';

export const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
export const OPENROUTER_URL = 'https://openrouter.ai/api/alpha/decisions';

export const SLOP_CHOICE = choice(
  'Classify whether this social post is low-value slop. Judge the writing and intent, not the topic. Prefer not_slop when the post clearly adds something specific or authorship is unclear. Empty selling, personal-brand flex with nothing new, and riding a trendy topic without adding value are slop too.',
  {
    slop:
      'Noise, clickbait, or empty daily content: engagement bait; rage/curiosity hooks with no payoff; recycled “content for content’s sake”; templated or LLM-generic hustle/motivation; fake expertise without specifics; shiny prose with no lived detail or new information; mainly selling, hard promo, or funnel copy without substance; personal-brand flex with nothing new; riding a trendy topic without adding value.',
    not_slop:
      'Brings something real: concrete detail, a personal take, a genuine question, humor with specificity, technical substance, news with substance, or authorship is simply unclear. Empty selling, personal-brand flex, or riding a trendy topic without adding value is slop even if polished; a product post with real specifics can still be not_slop.',
  },
);

export function typesafeModel(settings: Pick<Settings, 'model'>): string {
  return settings.model === 'jev-1.13.0' ? 'jev-1.13.0' : 'jev-latest';
}

export function openrouterModel(settings: Pick<Settings, 'model'>): string {
  return settings.model === 'jev-1.13.0' ? 'typesafe/jev-1.13' : '~typesafe/jev-latest';
}

export type ChoiceAnswer = {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type JevResponse = {
  model?: string;
  answers?: { verdict?: ChoiceAnswer };
};

export function parseChoiceAnswer(tweetId: string, model: string, answer: ChoiceAnswer): Verdict {
  const slopP =
    typeof answer.probabilities?.slop === 'number'
      ? answer.probabilities.slop
      : answer.choice === 'slop'
        ? (answer.confidence ?? 0)
        : 1 - (answer.confidence ?? 0);
  const notP =
    typeof answer.probabilities?.not_slop === 'number' ? answer.probabilities.not_slop : 1 - slopP;
  const label: Verdict['label'] =
    answer.choice === 'slop' || answer.choice === 'not_slop'
      ? answer.choice
      : slopP >= 0.5
        ? 'slop'
        : 'not_slop';
  return {
    tweetId,
    label,
    slopP,
    notP,
    model: model.trim() || 'jev-latest',
  };
}

export async function callJev(
  tweet: TweetPayload,
  settings: Settings,
  fetchImpl?: typeof fetch,
): Promise<Verdict> {
  if (settings.provider === 'openrouter') {
    return callOpenRouter(tweet, settings, fetchImpl ?? fetch);
  }

  const client = new TypeSafeClient({
    apiKey: settings.apiKey.trim(),
    defaultModel: typesafeModel(settings),
    dangerouslyAllowBrowser: true,
    ...(fetchImpl ? { fetch: fetchImpl as TypeSafeClient['fetch'] } : {}),
  });
  const response = await client.systemOne({
    state: { handle: tweet.handle, text: tweet.text },
    questions: { verdict: SLOP_CHOICE },
  });
  return parseChoiceAnswer(tweet.id, response.model, response.answers.verdict);
}

async function callOpenRouter(
  tweet: TweetPayload,
  settings: Settings,
  fetchImpl: typeof fetch,
): Promise<Verdict> {
  const res = await fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openrouterModel(settings),
      state: { handle: tweet.handle, text: tweet.text },
      questions: { verdict: SLOP_CHOICE },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as JevResponse & {
    error?: { message?: string };
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? data.detail ?? `Jev HTTP ${res.status}`);
  }
  if (!data.answers?.verdict) throw new Error('Jev returned an incomplete answers object');
  return parseChoiceAnswer(tweet.id, typeof data.model === 'string' ? data.model : 'jev-latest', data.answers.verdict);
}

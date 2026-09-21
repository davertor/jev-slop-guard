import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callJev, parseChoiceAnswer, SLOP_CHOICE, TYPESAFE_URL } from '../lib/jev';
import { createLimiter } from '../lib/queue';
import { mergeSettings } from '../lib/settings';
import { looksPromotedLabel, tweetIdFromHref } from '../lib/tweet';
import { badgeCopy, percent, shouldStamp } from '../lib/verdict';

test('tweetIdFromHref reads /status/:id', () => {
  assert.equal(tweetIdFromHref('/maya/status/1002?s=20'), '1002');
  assert.equal(tweetIdFromHref('/home'), null);
});

test('skips Promoted labels', () => {
  assert.equal(looksPromotedLabel('Promoted'), true);
  assert.equal(looksPromotedLabel('Reply'), false);
});

test('choice question is not_slop vs slop', () => {
  assert.equal(SLOP_CHOICE.type, 'choice');
  assert.ok('slop' in SLOP_CHOICE.criteria);
  assert.ok('not_slop' in SLOP_CHOICE.criteria);
});

test('parseChoiceAnswer uses probabilities for Stop / Not slop percents', () => {
  const slop = parseChoiceAnswer('1', 'jev-1.13.0', {
    type: 'choice',
    choice: 'slop',
    confidence: 0.9,
    probabilities: { slop: 0.91, not_slop: 0.09 },
  });
  assert.equal(slop.label, 'slop');
  assert.equal(shouldStamp(slop, 0.7, true), true);
  assert.deepEqual(badgeCopy(slop, true), { tone: 'stop', text: 'Stop | 91%' });

  const human = parseChoiceAnswer('2', 'jev-latest', {
    type: 'choice',
    choice: 'not_slop',
    confidence: 0.8,
    probabilities: { slop: 0.14, not_slop: 0.86 },
  });
  assert.equal(shouldStamp(human, 0.7, true), false);
  assert.deepEqual(badgeCopy(human, false), { tone: 'ok', text: 'Not slop | 86%' });
});

test('threshold gates the stamp', () => {
  const verdict = parseChoiceAnswer('3', 'jev-latest', {
    choice: 'slop',
    probabilities: { slop: 0.62, not_slop: 0.38 },
  });
  assert.equal(shouldStamp(verdict, 0.7, true), false);
  assert.equal(shouldStamp(verdict, 0.6, true), true);
  assert.equal(shouldStamp(verdict, 0.6, false), false);
  assert.equal(percent(0.624), 62);
});

test('mergeSettings maps legacy noulThreshold onto threshold', () => {
  const settings = mergeSettings({ provider: 'openai', noulThreshold: 0.88, apiKey: 'k' });
  assert.equal(settings.provider, 'typesafe');
  assert.equal(settings.threshold, 0.88);
  assert.equal(settings.stampEnabled, true);
  assert.equal(settings.apiKey, 'k');
});

test('limiter caps concurrency', async () => {
  let current = 0;
  let max = 0;
  const run = createLimiter(2);
  await Promise.all(
    [1, 2, 3, 4].map(() =>
      run(async () => {
        current += 1;
        max = Math.max(max, current);
        await new Promise((r) => setTimeout(r, 20));
        current -= 1;
      }),
    ),
  );
  assert.equal(max, 2);
});

test('callJev posts a Choice question through the TypeSafe SDK', async () => {
  const settings = mergeSettings({ apiKey: 'test-key' });
  const fetchImpl: typeof fetch = async (url, init) => {
    assert.equal(String(url), `${TYPESAFE_URL}`);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-key');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'jev-latest');
    assert.equal(body.questions.verdict.type, 'choice');
    assert.deepEqual(Object.keys(body.questions.verdict.criteria).sort(), ['not_slop', 'slop']);
    return new Response(
      JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          verdict: {
            type: 'choice',
            choice: 'slop',
            confidence: 0.9,
            probabilities: { slop: 0.88, not_slop: 0.12 },
          },
        },
        usage: { input_tokens: 10, output_tokens: 1 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  const verdict = await callJev(
    { id: '1', text: 'Reply YES for the rest of this thread.', handle: '@threadlord' },
    settings,
    fetchImpl,
  );
  assert.equal(verdict.label, 'slop');
  assert.equal(verdict.slopP, 0.88);
  assert.equal(verdict.model, 'jev-1.13.0');
});

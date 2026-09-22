import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { applyVerdict, ownSlopRow } from '../lib/badge';
import { DEFAULT_SETTINGS } from '../lib/settings';

const { window, document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
Object.assign(globalThis, {
  window,
  document,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Document: window.Document,
  Node: window.Node,
});

/** Mirrors entrypoints/x-timeline.content showXProbe pause branch. */
function showXProbe(paused: boolean): void {
  if (paused) {
    document.getElementById('slop-guard-xprobe')?.remove();
    for (const node of document.querySelectorAll('.slop-guard-xprobe')) node.remove();
    return;
  }
  let chip = document.getElementById('slop-guard-xprobe');
  if (!(chip instanceof HTMLElement)) {
    chip = document.createElement('div');
    chip.id = 'slop-guard-xprobe';
    chip.className = 'slop-guard-xprobe';
    document.body.append(chip);
  }
  chip.textContent = 'X script live · 5 cards · 5 ready';
}

test('regression pause: live chip is removed when paused=true', () => {
  document.body.innerHTML = '';
  showXProbe(false);
  assert.equal(document.querySelectorAll('.slop-guard-xprobe').length, 1);
  showXProbe(true);
  assert.equal(document.querySelectorAll('.slop-guard-xprobe').length, 0);
  assert.equal(document.getElementById('slop-guard-xprobe'), null);
});

test('regression pause: applyVerdict while paused clears badge and stamp', () => {
  document.body.innerHTML =
    '<article data-testid="tweet" data-slop-guard="done" id="t1">' +
    '<div data-testid="tweetText">Hello world this is enough text for a badge row here.</div>' +
    '</article>';
  const article = document.querySelector('#t1') as HTMLElement;
  applyVerdict(
    article,
    { tweetId: '1', label: 'slop', slopP: 0.9, notP: 0.1, model: 'jev-latest' },
    { ...DEFAULT_SETTINGS, paused: false, showNotSlop: true, stampEnabled: true, threshold: 0.7 },
  );
  assert.ok(ownSlopRow(article));
  assert.ok(article.querySelector('.slop-guard-overlay'));

  applyVerdict(
    article,
    { tweetId: '1', label: 'slop', slopP: 0.9, notP: 0.1, model: 'jev-latest' },
    { ...DEFAULT_SETTINGS, paused: true },
  );
  assert.equal(ownSlopRow(article), null);
  assert.equal(article.querySelector('.slop-guard-overlay'), null);
  showXProbe(true);
  assert.equal(document.querySelectorAll('.slop-guard-xprobe').length, 0);
});

test('regression running: applyVerdict writes a badge when not paused', () => {
  document.body.innerHTML =
    '<article data-testid="tweet" id="t2">' +
    '<div data-testid="tweetText">A normal tweet body long enough to extract and stamp under threshold.</div>' +
    '</article>';
  const article = document.querySelector('#t2') as HTMLElement;
  applyVerdict(
    article,
    { tweetId: '2', label: 'not_slop', slopP: 0.1, notP: 0.9, model: 'jev-latest' },
    { ...DEFAULT_SETTINGS, paused: false, showNotSlop: true },
  );
  assert.ok(ownSlopRow(article), 'expected a slop-guard-row when running');
  assert.match(ownSlopRow(article)?.textContent ?? '', /Slop \|/);
  showXProbe(false);
  assert.equal(document.querySelectorAll('.slop-guard-xprobe').length, 1);
});

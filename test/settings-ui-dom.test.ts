import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { mountSettingsPage } from '../lib/settings-ui';
import { SETTINGS_KEY, type Settings } from '../lib/settings';

const { window, document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
Object.assign(globalThis, {
  window,
  document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLPreElement: window.HTMLPreElement,
  Element: window.Element,
  Node: window.Node,
});

// linkedom ships HTMLSelectElement.value as a getter only; the popup assigns it.
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!;
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
  ...selectValue,
  set(this: { options: Iterable<{ value: string; selected: boolean }> }, next: string) {
    for (const option of this.options) option.selected = option.value === next;
  },
});

/** Popup with an X tab whose content script answers X_STATUS. */
function stubExtension(stored: Partial<Settings>): void {
  Object.assign(globalThis, {
    browser: {
      storage: { local: { get: async () => ({ [SETTINGS_KEY]: stored }), set: async () => {} } },
    },
    chrome: {
      runtime: { sendMessage: (_m: unknown, cb: (r: unknown) => void) => cb(undefined) },
      tabs: {
        query: async () => [{ id: 7, url: 'https://x.com/home' }],
        sendMessage: (_id: number, _m: unknown, cb: (r: unknown) => void) =>
          cb({ ok: true, live: true, cards: 8, ready: 8 }),
      },
    },
  });
}

async function mount(stored: Partial<Settings>): Promise<HTMLElement> {
  stubExtension(stored);
  const root = document.createElement('div') as unknown as HTMLElement;
  await mountSettingsPage(root);
  await new Promise((r) => setTimeout(r, 0));
  return root;
}

test('paused popup hides the "X script live" line', async () => {
  const root = await mount({ paused: true });
  const status = root.querySelector<HTMLElement>('#x-script-status')!;
  assert.equal(status.hidden, true);
  assert.equal(root.querySelector('#pause-toggle')?.textContent, 'Start');
});

test('running popup shows the live card counts', async () => {
  const root = await mount({ paused: false });
  const status = root.querySelector<HTMLElement>('#x-script-status')!;
  assert.equal(status.hidden, false);
  assert.match(status.textContent ?? '', /X script live · 8 cards · 8 ready/);
});

test('toggling to paused hides the line without a reopen', async () => {
  const root = await mount({ paused: false });
  const status = root.querySelector<HTMLElement>('#x-script-status')!;
  assert.equal(status.hidden, false);
  root.querySelector<HTMLElement>('#pause-toggle')!.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(status.hidden, true);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const path = join(process.cwd(), 'pilots', 'farm-post-office', 'index.html');

test('public farm invitation demo remains an explicitly synthetic, self-contained surface', async () => {
  const html = await readFile(path, 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /No real customer data/i);
  assert.match(html, /simulat(?:ed|ion)/i);
  assert.match(html, /No account/);
  assert.match(html, /does not connect to real farm software or send emails/i);
  assert.match(html, /No password sharing/i);
  assert.match(html, /Buying vegetables does not automatically subscribe someone/i);
  assert.match(html, /independent proposal/i);
  assert.match(html, /id="demo"/);
  assert.match(html, /id="pilot"/);
  for (const scenario of ['join', 'optin', 'hold', 'unsubscribe', 'repeat', 'outage']) {
    assert.match(html, new RegExp('data-scenario="' + scenario + '"'));
  }
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'sandbox must not load third-party JS');
  assert.doesNotMatch(html, /<form\b/i, 'pilot intake must not submit to a server');
  assert.doesNotMatch(html, /fetch\s*\(/, 'browser sandbox must not call live APIs');
  assert.doesNotMatch(html, /https?:\/\/[^"' ]+(?:tracking|analytics)/i);
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'expected inline browser script');
  assert.doesNotThrow(() => new Function(match[1]), 'browser script must parse');
});

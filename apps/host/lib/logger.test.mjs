import test from 'node:test';
import assert from 'node:assert/strict';
import { hostLog } from './logger.ts';

test('hostLog formats server stdout message correctly', () => {
  let captured = '';
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (str) => {
      captured += str;
      return true;
    };
    hostLog.server('TEST_ACTION', { status: 200 });
    assert.match(captured, /\[HOST:SERVER\]/);
    assert.match(captured, /TEST_ACTION/);
    assert.match(captured, /200/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('hostLog handles client-side fallback on server cleanly', () => {
  let captured = '';
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (str) => {
      captured += str;
      return true;
    };
    hostLog.client('CLIENT_ACTION', { detail: 'test' });
    assert.match(captured, /CLIENT_ACTION/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

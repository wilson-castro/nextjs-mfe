import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteLog } from './logger.ts';

test('remoteLog formats server stdout message correctly', () => {
  let captured = '';
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (str) => {
      captured += str;
      return true;
    };
    remoteLog.server('REMOTE_TEST', { cached: true });
    assert.match(captured, /\[REMOTE:SERVER\]/);
    assert.match(captured, /REMOTE_TEST/);
    assert.match(captured, /cached/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('remoteLog handles client-side fallback on server cleanly', () => {
  let captured = '';
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (str) => {
      captured += str;
      return true;
    };
    remoteLog.client('REMOTE_CLIENT_ACTION', { eventId: 'evt_123' });
    assert.match(captured, /REMOTE_CLIENT_ACTION/);
  } finally {
    process.stdout.write = originalWrite;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../pages/_fragmento/[name]/[id]';

interface MockResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  status(code: number): MockResponse;
  setHeader(name: string, value: string): MockResponse;
  end(chunk?: string): void;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: '',
    headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    end(chunk = '') {
      res.body = chunk;
    },
  };
  return res;
}

function createMockRequest(
  method: string,
  query: Record<string, string>,
  url?: string
): NextApiRequest {
  return {
    method,
    query,
    url,
  } as unknown as NextApiRequest;
}

test('GET with name demo and id 1 returns 200 text/html with safe id and no script tags', () => {
  // Arrange
  const mockReq = createMockRequest('GET', { name: 'demo', id: '1' });
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 200);
  const contentType = mockRes.headers['content-type'] ?? '';
  assert.match(contentType, /text\/html/);
  assert.ok(mockRes.body.includes('id: 1'), 'Response body must include the fragment id');
  assert.doesNotMatch(mockRes.body, /<script/i, 'Fragment HTML must be inert with no script tags');
});

test('GET with potentially malicious id safely encodes and contains no script tags', () => {
  // Arrange - verify XSS prevention when id contains script markup
  const xssPayload = '<script>alert("xss")</script>';
  const mockReq = createMockRequest('GET', { name: 'demo', id: xssPayload });
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 200);
  assert.doesNotMatch(mockRes.body, /<script/i, 'Fragment HTML must sanitize/encode raw script tags');
  assert.ok(mockRes.body.includes('%3Cscript%3E'), 'Payload must be URI-encoded');
});

test('GET with unknown fragment name returns 204 No Content to mask existence/authorization', () => {
  // Arrange
  const mockReq = createMockRequest('GET', { name: 'unknown', id: '1' });
  const mockRes = createMockResponse();

  // Act - 204 represents both not found and not authorized (absence invariant)
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 204);
  assert.equal(mockRes.body, '', '204 response body must be empty');
});

test('POST request returns 405 Method Not Allowed', () => {
  // Arrange
  const mockReq = createMockRequest('POST', { name: 'demo', id: '1' });
  const mockRes = createMockResponse();

  // Act - fragment endpoint accepts GET only
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 405);
});

test('GET with empty req.query extracts name and id from req.url (internal rewrite fallback)', () => {
  // Arrange - simulating Next.js internal rewrite where req.query is empty
  const mockReq = createMockRequest('GET', {}, '/remote-app/_fragmento/demo/42');
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 200);
  const contentType = mockRes.headers['content-type'] ?? '';
  assert.match(contentType, /text\/html/);
  assert.ok(mockRes.body.includes('id: 42'), 'Response body must include the fragment id extracted from url');
  assert.ok(mockRes.body.includes('fragment--demo'), 'Response body must include fragment--demo');
  assert.doesNotMatch(mockRes.body, /<script/i, 'Fragment HTML must be inert with no script tags');
});

test('GET with empty req.query and unknown fragment in req.url returns 204 No Content', () => {
  // Arrange - unknown fragment via url fallback must also return 204
  const mockReq = createMockRequest('GET', {}, '/remote-app/_fragmento/unknown/99');
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse);

  // Assert
  assert.equal(mockRes.statusCode, 204);
  assert.equal(mockRes.body, '', '204 response body must be empty');
});

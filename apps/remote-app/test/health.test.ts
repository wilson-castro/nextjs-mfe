import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler, { type HealthResponse } from '../pages/api/health';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: HealthResponse): void;
  end(): void;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: HealthResponse) {
      res.body = data;
    },
    end() {},
  };
  return res;
}

function createMockRequest(method = 'GET'): NextApiRequest {
  return { method } as unknown as NextApiRequest;
}

test('GET /remote-app/api/health returns 200 with { ok: true } without domain I/O', () => {
  // Arrange
  const mockReq = createMockRequest('GET');
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse<HealthResponse>);

  // Assert
  assert.equal(mockRes.statusCode, 200);
  assert.deepEqual(mockRes.body, { ok: true });
});

test('POST /remote-app/api/health returns 405 Method Not Allowed', () => {
  // Arrange
  const mockReq = createMockRequest('POST');
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse<HealthResponse>);

  // Assert
  assert.equal(mockRes.statusCode, 405);
});

test('PUT /remote-app/api/health returns 405 Method Not Allowed', () => {
  // Arrange
  const mockReq = createMockRequest('PUT');
  const mockRes = createMockResponse();

  // Act
  handler(mockReq, mockRes as unknown as NextApiResponse<HealthResponse>);

  // Assert
  assert.equal(mockRes.statusCode, 405);
});

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createServer } = require('../server.js');

/**
 * Makes an HTTP request to the local test server and resolves with the response.
 * @param {number} port
 * @param {{ path: string, method: string }} options
 * @param {string} [body]
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
function makeRequest(port, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      Object.assign({ host: '127.0.0.1', port }, options),
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        });
      }
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

describe('Error Handling & 404 Routes', () => {
  /** @type {import('http').Server} */
  let server;
  /** @type {number} */
  let port;

  before(async () => {
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('returns 404 JSON for a completely unknown path', async () => {
    const res = await makeRequest(port, { path: '/unknown-path', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  test('returns 404 JSON for /api prefix without a valid sub-route', async () => {
    const res = await makeRequest(port, { path: '/api', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  test('returns 404 JSON for /api/unknown', async () => {
    const res = await makeRequest(port, { path: '/api/unknown', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  test('returns 404 JSON for unsupported HTTP method PUT on /api/todos', async () => {
    const res = await makeRequest(port, { path: '/api/todos', method: 'PUT' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  test('returns 404 JSON for /api/todos/ with trailing slash', async () => {
    const res = await makeRequest(port, { path: '/api/todos/', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  test('returns 404 JSON for a deeply nested path not matching any route', async () => {
    const res = await makeRequest(port, { path: '/api/todos/1/subtasks', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  test('returns 404 JSON for /api/todos/:id with a non-numeric segment', async () => {
    const res = await makeRequest(port, { path: '/api/todos/abc', method: 'GET' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });
});

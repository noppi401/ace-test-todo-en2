'use strict';

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createServer, TodoStore } = require('../server');

/**
 * Sends an HTTP request to the test server and resolves with status + body string.
 * @param {object} opts - Options for http.request
 * @param {string} [payload] - Optional request body string
 * @returns {Promise<{statusCode: number, body: string, headers: object}>}
 */
function request(opts, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

describe('DELETE /api/todos/:id', () => {
  let server;
  let port;
  let store;

  before((_, done) => {
    store = new TodoStore();
    server = createServer(store);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  // Reset store before each test so tests are independent
  beforeEach(() => {
    store.todos = [];
    store.nextId = 1;
  });

  test('returns 204 No Content when todo exists', async () => {
    store.addTodo('Task to delete');
    const res = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/todos/1',
      method: 'DELETE',
    });
    assert.equal(res.statusCode, 204);
    assert.equal(res.body, '', 'Response body must be empty for 204');
  });

  test('returns 404 when todo does not exist', async () => {
    const res = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/todos/999',
      method: 'DELETE',
    });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Todo not found');
  });

  test('deleted todo no longer appears in GET /api/todos', async () => {
    store.addTodo('Keep this');
    store.addTodo('Delete this');

    // Delete id=2
    const delRes = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/todos/2',
      method: 'DELETE',
    });
    assert.equal(delRes.statusCode, 204);

    // Verify only id=1 remains
    const getRes = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/todos',
      method: 'GET',
    });
    assert.equal(getRes.statusCode, 200);
    const todos = JSON.parse(getRes.body);
    assert.equal(todos.length, 1);
    assert.equal(todos[0].id, 1);
    assert.equal(todos[0].title, 'Keep this');
  });

  test('second DELETE on same id returns 404 (not idempotent 204)', async () => {
    store.addTodo('Once only');

    const first = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/todos/1',
      method: 'DELETE',
    });
    assert.equal(first.statusCode, 204);

    const second = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/todos/1',
      method: 'DELETE',
    });
    assert.equal(second.statusCode, 404);
    const body = JSON.parse(second.body);
    assert.equal(body.error, 'Todo not found');
  });
});

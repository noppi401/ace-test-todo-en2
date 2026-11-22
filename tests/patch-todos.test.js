'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createServer, TodoStore } = require('../server.js');

/**
 * テストサーバーに HTTP リクエストを送り、ステータスコードとパース済みボディを返す。
 * @param {http.Server} server
 * @param {string} method
 * @param {string} path
 * @param {any} [body]
 * @returns {Promise<{statusCode: number, body: any}>}
 */
function makeRequest(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {},
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        if (data) {
          try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * 生の文字列ボディで HTTP リクエストを送る（不正 JSON テスト用）。
 * @param {http.Server} server
 * @param {string} method
 * @param {string} path
 * @param {string} rawBody
 * @returns {Promise<{statusCode: number, body: any}>}
 */
function makeRawRequest(server, method, path, rawBody) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        if (data) {
          try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

describe('PATCH /api/todos/:id', () => {
  let server;
  let store;

  before(async () => {
    store = new TodoStore();
    server = createServer(store);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('200: completed を true に更新して更新済みの todo を返す', async () => {
    const todo = store.addTodo('Toggle to true');
    const res = await makeRequest(server, 'PATCH', `/api/todos/${todo.id}`, { completed: true });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { id: todo.id, title: 'Toggle to true', completed: true });
  });

  test('200: completed を false に更新して更新済みの todo を返す', async () => {
    const todo = store.addTodo('Toggle to false');
    // まず true に設定してから false に戻す
    await makeRequest(server, 'PATCH', `/api/todos/${todo.id}`, { completed: true });
    const res = await makeRequest(server, 'PATCH', `/api/todos/${todo.id}`, { completed: false });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { id: todo.id, title: 'Toggle to false', completed: false });
  });

  test('200: 更新後の completed 状態が GET /api/todos に反映される', async () => {
    const todo = store.addTodo('Persist check');
    await makeRequest(server, 'PATCH', `/api/todos/${todo.id}`, { completed: true });
    const getRes = await makeRequest(server, 'GET', '/api/todos');
    assert.equal(getRes.statusCode, 200);
    const found = getRes.body.find((t) => t.id === todo.id);
    assert.ok(found, 'GET /api/todos に更新済み todo が含まれること');
    assert.equal(found.completed, true);
  });

  test('404: 存在しない id を指定すると 404 を返す', async () => {
    const res = await makeRequest(server, 'PATCH', '/api/todos/99999', { completed: true });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Todo not found');
  });

  test('400: completed が文字列の場合は 400 を返す', async () => {
    const todo = store.addTodo('Invalid completed string');
    const res = await makeRequest(server, 'PATCH', `/api/todos/${todo.id}`, { completed: 'yes' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Completed must be a boolean');
  });

  test('400: completed が数値の場合は 400 を返す', async () => {
    const todo = store.addTodo('Invalid completed number');
    const res = await makeRequest(server, 'PATCH', `/api/todos/${todo.id}`, { completed: 1 });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Completed must be a boolean');
  });

  test('400: completed フィールドが存在しない場合は 400 を返す', async () => {
    const todo = store.addTodo('Missing completed field');
    const res = await makeRequest(server, 'PATCH', `/api/todos/${todo.id}`, {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Completed must be a boolean');
  });

  test('400: 不正な JSON ボディの場合は 400 を返す', async () => {
    const todo = store.addTodo('Invalid JSON test');
    const res = await makeRawRequest(server, 'PATCH', `/api/todos/${todo.id}`, '{ bad json');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Invalid JSON');
  });
});

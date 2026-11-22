'use strict';

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createServer, TodoStore } = require('../server');

/**
 * テストサーバーに HTTP リクエストを送り、ステータスと JSON ボディを返す。
 * @param {number} port
 * @param {string} method
 * @param {string} urlPath
 * @param {any} [body] - 指定された場合は JSON としてシリアライズされる
 * @returns {Promise<{status: number, body: any}>}
 */
function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers = { 'Content-Type': 'application/json' };
    if (payload !== undefined) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const opts = { hostname: 'localhost', port, path: urlPath, method, headers };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/**
 * 生の（不正な可能性がある）ペイロードをテストサーバーに送信する。
 * @param {number} port
 * @param {string} method
 * @param {string} urlPath
 * @param {string} rawBody
 * @returns {Promise<{status: number, body: any}>}
 */
function rawRequest(port, method, urlPath, rawBody) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

describe('POST /api/todos', () => {
  let server;
  let port;
  let store;

  before(async () => {
    store = new TodoStore();
    server = createServer(store);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  beforeEach(() => {
    // 各テスト前にストアをリセットして ID の予測可能性を確保する
    store.todos = [];
    store.nextId = 1;
  });

  test('有効なタイトルで 201 と作成済み todo を返す', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: 'Buy groceries' });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 1);
    assert.equal(res.body.title, 'Buy groceries');
    assert.equal(res.body.completed, false);
  });

  test('タイトルの前後の空白をトリムする', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: '  Learn Node.js  ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Learn Node.js');
  });

  test('todo ごとに ID を自動インクリメントする', async () => {
    const res1 = await request(port, 'POST', '/api/todos', { title: 'First' });
    const res2 = await request(port, 'POST', '/api/todos', { title: 'Second' });
    assert.equal(res1.body.id, 1);
    assert.equal(res2.body.id, 2);
  });

  test('新規 todo の completed はデフォルトで false になる', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: 'Task' });
    assert.equal(res.status, 201);
    assert.equal(res.body.completed, false);
  });

  test('title フィールドが存在しない場合 400 を返す', async () => {
    const res = await request(port, 'POST', '/api/todos', {});
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Title is required');
  });

  test('title が空文字列の場合 400 を返す', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: '' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Title cannot be empty');
  });

  test('title が空白のみの場合 400 を返す', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: '   ' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Title cannot be empty');
  });

  test('title が null（文字列でない）の場合 400 を返す', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: null });
    assert.equal(res.status, 400);
    assert.ok(typeof res.body.error === 'string', 'error フィールドは文字列であること');
  });

  test('title が 500 文字を超える場合 400 を返す', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: 'a'.repeat(501) });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Title must be 1-500 characters');
  });

  test('ちょうど 500 文字の title を受け入れる', async () => {
    const res = await request(port, 'POST', '/api/todos', { title: 'b'.repeat(500) });
    assert.equal(res.status, 201);
    assert.equal(res.body.title.length, 500);
  });

  test('JSON ボディが不正な場合 400 を返す', async () => {
    const res = await rawRequest(port, 'POST', '/api/todos', '{ "title": "Task" ');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid JSON');
  });

  test('余分なフィールドを無視して id・title・completed のみを返す', async () => {
    const res = await request(port, 'POST', '/api/todos', {
      title: 'Task',
      priority: 'high',
      dueDate: '2026-12-01',
    });
    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body).sort(), ['completed', 'id', 'title']);
  });

  test('POST 後に GET /api/todos でその todo を取得できる', async () => {
    await request(port, 'POST', '/api/todos', { title: 'Persistent Task' });
    const getRes = await request(port, 'GET', '/api/todos', undefined);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.length, 1);
    assert.equal(getRes.body[0].title, 'Persistent Task');
  });
});

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createServer, TodoStore } = require('../server.js');

/**
 * OS が割り当てたポートでサーバーを起動する。
 * @param {TodoStore} [store]
 * @returns {Promise<{server: http.Server, port: number}>}
 */
function startServer(store) {
  return new Promise((resolve, reject) => {
    const server = createServer(store);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
    server.once('error', reject);
  });
}

/**
 * サーバーを閉じる。
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * HTTP リクエストを送信してステータスコード・ヘッダー・JSON ボディを返す。
 * @param {number} port
 * @param {string} method
 * @param {string} pathname
 * @param {any} [body]
 * @returns {Promise<{statusCode: number, headers: object, body: any}>}
 */
function request(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const options = {
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (payload !== undefined) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsed = null;
        if (raw.length > 0) {
          try { parsed = JSON.parse(raw); } catch (_e) { parsed = raw; }
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.once('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

// ---- TODO が存在しない場合 ----
describe('GET /api/todos — 空のストアの場合', () => {
  let server;
  let port;

  before(async () => {
    ({ server, port } = await startServer(new TodoStore()));
  });

  after(async () => {
    await stopServer(server);
  });

  test('200 ステータスコードを返す', async () => {
    const res = await request(port, 'GET', '/api/todos');
    assert.equal(res.statusCode, 200);
  });

  test('Content-Type が application/json', async () => {
    const res = await request(port, 'GET', '/api/todos');
    assert.match(res.headers['content-type'], /application\/json/);
  });

  test('空配列を返す', async () => {
    const res = await request(port, 'GET', '/api/todos');
    assert.deepEqual(res.body, []);
  });
});

// ---- TODO が存在する場合 ----
describe('GET /api/todos — TODO が存在する場合', () => {
  let server;
  let port;

  before(async () => {
    const store = new TodoStore();
    store.addTodo('Buy groceries');
    store.addTodo('Write tests');
    ({ server, port } = await startServer(store));
  });

  after(async () => {
    await stopServer(server);
  });

  test('200 ステータスコードを返す', async () => {
    const res = await request(port, 'GET', '/api/todos');
    assert.equal(res.statusCode, 200);
  });

  test('すべての TODO を含む配列を返す', async () => {
    const res = await request(port, 'GET', '/api/todos');
    assert.equal(Array.isArray(res.body), true);
    assert.equal(res.body.length, 2);
  });

  test('各 TODO は id・title・completed フィールドを持つ', async () => {
    const res = await request(port, 'GET', '/api/todos');
    for (const todo of res.body) {
      assert.strictEqual(typeof todo.id, 'number', `id は number であるべき (got ${typeof todo.id})`);
      assert.strictEqual(typeof todo.title, 'string', `title は string であるべき (got ${typeof todo.title})`);
      assert.strictEqual(typeof todo.completed, 'boolean', `completed は boolean であるべき (got ${typeof todo.completed})`);
    }
  });

  test('completed のデフォルト値は false', async () => {
    const res = await request(port, 'GET', '/api/todos');
    for (const todo of res.body) {
      assert.equal(todo.completed, false);
    }
  });

  test('挿入順で TODO を返す', async () => {
    const res = await request(port, 'GET', '/api/todos');
    assert.equal(res.body[0].title, 'Buy groceries');
    assert.equal(res.body[1].title, 'Write tests');
  });

  test('id は一意な正の整数', async () => {
    const res = await request(port, 'GET', '/api/todos');
    const ids = res.body.map((t) => t.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'id が重複している');
    for (const id of ids) {
      assert.ok(id > 0, `id は正の整数であるべき (got ${id})`);
    }
  });
});

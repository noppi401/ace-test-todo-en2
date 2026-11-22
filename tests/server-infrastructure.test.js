'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {
  createServer,
  parseJson,
  sendJsonResponse,
  extractIdFromPath,
  TodoStore,
} = require('../server.js');
const { startServer, stopServer, request } = require('./helpers.js');

// ─── extractIdFromPath ───────────────────────────────────────────────────────

describe('extractIdFromPath', () => {
  test('returns integer ID for /api/todos/1', () => {
    assert.equal(extractIdFromPath('/api/todos/1'), 1);
  });

  test('returns integer ID for larger values', () => {
    assert.equal(extractIdFromPath('/api/todos/42'), 42);
    assert.equal(extractIdFromPath('/api/todos/9999'), 9999);
  });

  test('returns null for /api/todos without ID segment', () => {
    assert.equal(extractIdFromPath('/api/todos'), null);
  });

  test('returns null for trailing slash /api/todos/', () => {
    assert.equal(extractIdFromPath('/api/todos/'), null);
  });

  test('returns null for non-numeric ID segment', () => {
    assert.equal(extractIdFromPath('/api/todos/abc'), null);
    assert.equal(extractIdFromPath('/api/todos/1a'), null);
  });

  test('returns null for ID of 0', () => {
    assert.equal(extractIdFromPath('/api/todos/0'), null);
  });

  test('returns null for root path', () => {
    assert.equal(extractIdFromPath('/'), null);
  });

  test('returns null for unrelated paths', () => {
    assert.equal(extractIdFromPath('/other/1'), null);
    assert.equal(extractIdFromPath('/api/1'), null);
  });
});

// ─── sendJsonResponse ────────────────────────────────────────────────────────

describe('sendJsonResponse', () => {
  /** Creates a lightweight mock of http.ServerResponse. */
  function makeMockRes() {
    const captured = { statusCode: null, headers: {}, body: null };
    return {
      _captured: captured,
      writeHead(status, headers) {
        captured.statusCode = status;
        Object.assign(captured.headers, headers);
      },
      end(body) {
        captured.body = body;
      },
    };
  }

  test('sets the given HTTP status code', () => {
    const mock = makeMockRes();
    sendJsonResponse(mock, 200, {});
    assert.equal(mock._captured.statusCode, 200);
  });

  test('sets Content-Type to application/json', () => {
    const mock = makeMockRes();
    sendJsonResponse(mock, 200, {});
    assert.equal(mock._captured.headers['Content-Type'], 'application/json');
  });

  test('sets Content-Length to byte length of JSON string', () => {
    const mock = makeMockRes();
    const body = { id: 1, title: 'Hello', completed: false };
    sendJsonResponse(mock, 200, body);
    const expectedLen = Buffer.byteLength(JSON.stringify(body));
    assert.equal(mock._captured.headers['Content-Length'], expectedLen);
  });

  test('writes JSON-stringified body', () => {
    const mock = makeMockRes();
    const body = { error: 'Not found' };
    sendJsonResponse(mock, 404, body);
    assert.equal(mock._captured.body, JSON.stringify(body));
  });

  test('handles array body correctly', () => {
    const mock = makeMockRes();
    const body = [{ id: 1 }, { id: 2 }];
    sendJsonResponse(mock, 200, body);
    assert.equal(mock._captured.body, JSON.stringify(body));
  });

  test('sends 404 status for error responses', () => {
    const mock = makeMockRes();
    sendJsonResponse(mock, 404, { error: 'Not found' });
    assert.equal(mock._captured.statusCode, 404);
  });

  test('sends 201 status for creation responses', () => {
    const mock = makeMockRes();
    sendJsonResponse(mock, 201, { id: 5, title: 'New', completed: false });
    assert.equal(mock._captured.statusCode, 201);
  });
});

// ─── startServer / stopServer helpers ────────────────────────────────────────

describe('startServer and stopServer', () => {
  test('startServer resolves with server, port, and baseUrl', async () => {
    const { server, port, baseUrl } = await startServer();
    try {
      assert.ok(server instanceof http.Server, 'server must be an http.Server');
      assert.equal(typeof port, 'number');
      assert.ok(port > 0 && port <= 65535, 'port must be in valid range');
      assert.ok(baseUrl.startsWith('http://127.0.0.1:'), 'baseUrl must target loopback');
      assert.ok(baseUrl.includes(String(port)), 'baseUrl must include port');
    } finally {
      await stopServer(server);
    }
  });

  test('stopServer closes the server and resolves without error', async () => {
    const { server } = await startServer();
    // Resolving without throwing confirms a clean shutdown
    await stopServer(server);
  });

  test('two servers started concurrently get different ports', async () => {
    const [a, b] = await Promise.all([startServer(), startServer()]);
    try {
      assert.notEqual(a.port, b.port);
    } finally {
      await Promise.all([stopServer(a.server), stopServer(b.server)]);
    }
  });

  test('startServer accepts an optional TodoStore and creates server without error', async () => {
    const store = new TodoStore();
    store.addTodo('Seeded task');
    const { server } = await startServer(store);
    try {
      // Server started successfully with a pre-seeded store
      assert.ok(server instanceof http.Server);
    } finally {
      await stopServer(server);
    }
  });
});

// ─── request helper ──────────────────────────────────────────────────────────

describe('request helper', () => {
  let server, baseUrl;

  before(async () => {
    ({ server, baseUrl } = await startServer());
  });

  after(async () => {
    await stopServer(server);
  });

  test('returns an object with status, headers, and body fields', async () => {
    const res = await request(baseUrl, 'GET', '/nope');
    assert.ok('status' in res, 'must have status');
    assert.ok('headers' in res, 'must have headers');
    assert.ok('body' in res, 'must have body');
  });

  test('body is parsed as a JSON object for JSON responses', async () => {
    const res = await request(baseUrl, 'GET', '/nope');
    assert.equal(typeof res.body, 'object');
    assert.notEqual(res.body, null);
  });

  test('POST with body reaches the server and returns a numeric status', async () => {
    const res = await request(baseUrl, 'POST', '/nope', { title: 'task' });
    assert.equal(typeof res.status, 'number');
    assert.ok(res.status >= 100 && res.status < 600);
  });

  test('body is null when the server sends an empty response', async () => {
    // Spin up a minimal server that returns 204 with no body
    const { server: s, baseUrl: b } = await new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => { res.writeHead(204); res.end(); });
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address();
        resolve({ server: srv, baseUrl: `http://127.0.0.1:${addr.port}` });
      });
      srv.once('error', reject);
    });
    try {
      const res = await request(b, 'DELETE', '/anything');
      assert.equal(res.status, 204);
      assert.equal(res.body, null);
    } finally {
      await stopServer(s);
    }
  });
});

// ─── createServer / route dispatcher fallthrough ─────────────────────────────

describe('createServer - route dispatcher fallthrough', () => {
  let server, baseUrl;

  before(async () => {
    ({ server, baseUrl } = await startServer());
  });

  after(async () => {
    await stopServer(server);
  });

  test('unmatched GET returns 404 JSON { error: "Not found" }', async () => {
    const res = await request(baseUrl, 'GET', '/unknown');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  test('unmatched POST returns 404 JSON', async () => {
    const res = await request(baseUrl, 'POST', '/nope', { x: 1 });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  test('unmatched DELETE returns 404 JSON', async () => {
    const res = await request(baseUrl, 'DELETE', '/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  test('unmatched PATCH returns 404 JSON', async () => {
    const res = await request(baseUrl, 'PATCH', '/nope', { completed: true });
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  test('404 fallthrough response has Content-Type application/json', async () => {
    const res = await request(baseUrl, 'GET', '/nope');
    const ct = res.headers['content-type'] || '';
    assert.ok(ct.startsWith('application/json'), `expected application/json, got ${ct}`);
  });

  test('createServer creates a fresh TodoStore when none is provided', async () => {
    const { server: s, baseUrl: b } = await startServer();
    try {
      // Server starts and responds, confirming a default store was created internally
      const res = await request(b, 'GET', '/nope');
      assert.equal(res.status, 404);
    } finally {
      await stopServer(s);
    }
  });
});

// ─── parseJson ───────────────────────────────────────────────────────────────

describe('parseJson', () => {
  let echoServer, echoBaseUrl;

  before(async () => {
    // Echo server: returns the parsed body on success, 400 + error on failure
    echoServer = http.createServer(async (req, res) => {
      try {
        const body = await parseJson(req);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    await new Promise((resolve, reject) => {
      echoServer.listen(0, '127.0.0.1', resolve);
      echoServer.once('error', reject);
    });
    const addr = echoServer.address();
    echoBaseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await stopServer(echoServer);
  });

  test('parses a valid JSON object body', async () => {
    const res = await request(echoBaseUrl, 'POST', '/', { title: 'Buy milk' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { title: 'Buy milk' });
  });

  test('parses a valid JSON array body', async () => {
    const res = await request(echoBaseUrl, 'POST', '/', [1, 2, 3]);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [1, 2, 3]);
  });

  test('parses a nested JSON object', async () => {
    const payload = { nested: { key: 'value' }, count: 42 };
    const res = await request(echoBaseUrl, 'POST', '/', payload);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, payload);
  });

  test('rejects malformed JSON with "Invalid JSON" error', async () => {
    // Use native http.request to send raw bytes, bypassing helper serialization
    const raw = '{ not: valid json }';
    const result = await new Promise((resolve, reject) => {
      const target = new URL('/', echoBaseUrl);
      const req = http.request(
        {
          hostname: target.hostname,
          port: Number(target.port),
          path: '/',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(raw),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.write(raw);
      req.end();
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Invalid JSON');
  });

  test('rejects an empty body with "Invalid JSON" error', async () => {
    const result = await new Promise((resolve, reject) => {
      const target = new URL('/', echoBaseUrl);
      const req = http.request(
        {
          hostname: target.hostname,
          port: Number(target.port),
          path: '/',
          method: 'POST',
          headers: { 'Content-Length': '0' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'Invalid JSON');
  });
});

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');

/* ── helpers ─────────────────────────────────────────────────────────────── */

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitReady(url, ms) {
  ms = ms || 10000;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { await fetch(url); return; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server never responded at ' + url);
}

/* ── lifecycle ───────────────────────────────────────────────────────────── */

let proc;
let BASE;

before(async () => {
  const port = await freePort();
  BASE = 'http://localhost:' + port;
  proc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'pipe',
  });
  await waitReady(BASE + '/api/todos');
});

after(() => { proc && proc.kill('SIGTERM'); });

/* ── request helpers ─────────────────────────────────────────────────────── */

async function tryJson(res) {
  try { return await res.json(); } catch { return null; }
}

async function getAll() {
  const res = await fetch(BASE + '/api/todos');
  return { status: res.status, ct: res.headers.get('content-type'), body: await tryJson(res) };
}

async function create(title) {
  const res = await fetch(BASE + '/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return { status: res.status, body: await tryJson(res) };
}

async function patch(id, payload) {
  const res = await fetch(BASE + '/api/todos/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await tryJson(res) };
}

async function del(id) {
  const res = await fetch(BASE + '/api/todos/' + id, { method: 'DELETE' });
  return { status: res.status };
}

/* ── US1: View All Todos ─────────────────────────────────────────────────── */

test('US1: GET /api/todos returns 200 and empty array on a fresh server', async () => {
  const { status, body } = await getAll();
  assert.equal(status, 200);
  assert.deepEqual(body, []);
});

test('US1: GET /api/todos Content-Type is application/json', async () => {
  const { ct } = await getAll();
  assert.ok((ct || '').includes('application/json'), 'expected application/json content-type');
});

test('US1: each todo object has id, title, and boolean completed', async () => {
  await create('shape-check todo');
  const { body } = await getAll();
  assert.ok(Array.isArray(body) && body.length > 0, 'list must be non-empty after create');
  const item = body[0];
  assert.ok('id' in item, 'todo must have id');
  assert.ok('title' in item, 'todo must have title');
  assert.ok('completed' in item, 'todo must have completed');
  assert.equal(typeof item.completed, 'boolean');
});

/* ── US5: Interactive Frontend ───────────────────────────────────────────── */

test('US5: GET / returns 200 with text/html content-type', async () => {
  const res = await fetch(BASE + '/');
  assert.equal(res.status, 200);
  assert.ok((res.headers.get('content-type') || '').includes('text/html'));
});

test('US5: HTML page contains an input element for todo title', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.ok(/<input/i.test(html), 'page must contain an <input> element');
});

test('US5: HTML page contains a button for the add action', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.ok(/<button/i.test(html), 'page must contain a <button> element');
});

test('US5: HTML page contains a list or container element for todos', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.ok(/<(ul|ol|div|section|main)[^>]*>/i.test(html), 'page must have a list or container element');
});

test('US5: script references /api/todos endpoint', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.ok(html.includes('/api/todos'), 'script must reference /api/todos');
});

test('US5: script uses POST method to create todos', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.ok(html.includes('POST'), 'script must use POST method');
});

test('US5: script uses PATCH method to toggle completion', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.ok(html.includes('PATCH'), 'script must use PATCH method');
});

test('US5: script uses DELETE method to remove todos', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert.ok(html.includes('DELETE'), 'script must use DELETE method');
});

/* ── US2: Add a New Todo ─────────────────────────────────────────────────── */

test('US2: POST /api/todos returns 201 with created todo object', async () => {
  const { status, body } = await create('Buy milk');
  assert.equal(status, 201);
  assert.ok(body !== null, 'response must have a JSON body');
  assert.equal(body.title, 'Buy milk');
  assert.equal(body.completed, false);
  assert.ok(body.id !== undefined && body.id !== null, 'todo must have an id');
});

test('US2: created todo has completed: false by default', async () => {
  const { body } = await create('Default incomplete');
  assert.equal(body.completed, false);
});

test('US2: successive todos receive unique ids', async () => {
  const { body: a } = await create('Unique A');
  const { body: b } = await create('Unique B');
  assert.notEqual(String(a.id), String(b.id));
});

test('US2: created todo appears in subsequent GET /api/todos', async () => {
  const { body: created } = await create('Must be listed');
  const { body: list } = await getAll();
  const found = list.find(t => String(t.id) === String(created.id));
  assert.ok(found, 'created todo must appear in GET /api/todos');
  assert.equal(found.title, 'Must be listed');
});

test('US2: POST with missing title field returns 400', async () => {
  const res = await fetch(BASE + '/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('US2: POST with empty string title returns 400', async () => {
  const res = await fetch(BASE + '/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' }),
  });
  assert.equal(res.status, 400);
});

test('US2: POST with malformed JSON body returns 4xx not 5xx', async () => {
  const res = await fetch(BASE + '/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad json',
  });
  assert.ok(res.status >= 400 && res.status < 500, 'expected 4xx, got ' + res.status);
});

/* ── US3: Toggle Todo Completion ─────────────────────────────────────────── */

test('US3: PATCH /api/todos/:id returns 200 with updated todo', async () => {
  const { body: created } = await create('Toggle on');
  const { status, body } = await patch(created.id, { completed: true });
  assert.equal(status, 200);
  assert.equal(body.completed, true);
  assert.equal(String(body.id), String(created.id));
});

test('US3: PATCH can set completed back to false', async () => {
  const { body: created } = await create('Toggle off');
  await patch(created.id, { completed: true });
  const { status, body } = await patch(created.id, { completed: false });
  assert.equal(status, 200);
  assert.equal(body.completed, false);
});

test('US3: PATCH update is reflected in subsequent GET /api/todos', async () => {
  const { body: created } = await create('Persist toggle');
  await patch(created.id, { completed: true });
  const { body: list } = await getAll();
  const found = list.find(t => String(t.id) === String(created.id));
  assert.ok(found, 'todo must still exist after PATCH');
  assert.equal(found.completed, true);
});

test('US3: PATCH non-existent id returns 404', async () => {
  const { status } = await patch('999999999', { completed: true });
  assert.equal(status, 404);
});

/* ── US4: Delete a Todo ──────────────────────────────────────────────────── */

test('US4: DELETE /api/todos/:id returns 204', async () => {
  const { body: created } = await create('Delete me');
  const { status } = await del(created.id);
  assert.equal(status, 204);
});

test('US4: deleted todo no longer appears in GET /api/todos', async () => {
  const { body: created } = await create('Gone after delete');
  await del(created.id);
  const { body: list } = await getAll();
  const found = list.find(t => String(t.id) === String(created.id));
  assert.equal(found, undefined, 'deleted todo must not be in list');
});

test('US4: DELETE non-existent id returns 404', async () => {
  const { status } = await del('999999999');
  assert.equal(status, 404);
});

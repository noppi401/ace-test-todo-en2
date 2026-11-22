'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../server.js');

/**
 * Makes a bare HTTP request against the given server and resolves with
 * { status, headers, body } once the response is fully received.
 * @param {http.Server} server
 * @param {{ method?: string, path?: string }} opts
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, body: string }>}
 */
function request(server, opts = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const options = {
      host: '127.0.0.1',
      port: addr.port,
      method: opts.method || 'GET',
      path: opts.path || '/',
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('GET / — serve frontend HTML', () => {
  /** @type {http.Server} */
  let server;

  before(() => new Promise((resolve) => {
    server = createServer();
    server.listen(0, '127.0.0.1', resolve);
  }));

  after(() => new Promise((resolve) => {
    server.close(resolve);
  }));

  test('responds with HTTP 200', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.equal(res.status, 200);
  });

  test('sets Content-Type: text/html', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.ok(
      res.headers['content-type'] && res.headers['content-type'].startsWith('text/html'),
      `Expected Content-Type to start with text/html, got: ${res.headers['content-type']}`
    );
  });

  test('body begins with an HTML DOCTYPE declaration', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.ok(
      res.body.trimStart().startsWith('<!DOCTYPE html>'),
      'Response body should start with <!DOCTYPE html>'
    );
  });

  test('body contains the <html> root element', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.ok(res.body.includes('<html'), 'body should contain <html> element');
  });

  test('body contains the app title text', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.ok(res.body.includes('ToDo App'), 'body should contain app title "ToDo App"');
  });

  test('body contains the todo input field', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.ok(
      res.body.includes('id="todoInput"'),
      'body should contain element with id="todoInput"'
    );
  });

  test('body contains the add-todo button', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.ok(
      res.body.includes('id="addBtn"'),
      'body should contain element with id="addBtn"'
    );
  });

  test('body contains the todo list container', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    assert.ok(
      res.body.includes('id="todoList"'),
      'body should contain element with id="todoList"'
    );
  });

  test('Content-Length header matches the actual body byte length', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    const declared = parseInt(res.headers['content-length'], 10);
    const actual = Buffer.byteLength(res.body);
    assert.equal(declared, actual, 'Content-Length should equal byte length of body');
  });
});

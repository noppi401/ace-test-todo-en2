'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const http = require('http');

/** プロジェクトルートへの絶対パス */
const ROOT = path.join(__dirname, '..');

describe('プロジェクト構造', () => {
  test('server.js が存在する', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'server.js')), 'server.js must exist');
  });

  test('index.html が存在する', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'index.html')), 'index.html must exist');
  });

  test('package.json の test スクリプトが node を呼び出す', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(typeof pkg.scripts.test, 'string', 'scripts.test must be a string');
    assert.match(pkg.scripts.test, /node/, 'test script must invoke node');
  });

  test('package.json の server スクリプトが server.js を参照する', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(typeof pkg.scripts.server, 'string', 'scripts.server must be a string');
    assert.match(pkg.scripts.server, /server\.js/, 'server script must reference server.js');
  });

  test('tests ディレクトリが存在する', () => {
    assert.ok(fs.existsSync(__dirname), 'tests directory must exist');
  });
});

describe('server.js モジュールエクスポート', () => {
  // require はモジュールキャッシュを利用するため describe ブロック内で一度だけ呼ぶ
  const { TodoStore, createServer } = require('../server.js');

  test('TodoStore がコンストラクタ関数としてエクスポートされている', () => {
    assert.strictEqual(typeof TodoStore, 'function',
      'TodoStore must be exported as a constructor function');
  });

  test('createServer が関数としてエクスポートされている', () => {
    assert.strictEqual(typeof createServer, 'function',
      'createServer must be exported as a function');
  });

  test('TodoStore インスタンスが todos=[] nextId=1 で初期化される', () => {
    const store = new TodoStore();
    assert.deepStrictEqual(store.todos, [], 'todos must initialize as empty array');
    assert.strictEqual(store.nextId, 1, 'nextId must initialize to 1');
  });

  test('createServer が http.Server インスタンスを返す', () => {
    const server = createServer();
    assert.ok(server instanceof http.Server,
      'createServer must return an http.Server instance');
    server.close();
  });

  test('createServer に既存の TodoStore インスタンスを渡せる', () => {
    const store = new TodoStore();
    const server = createServer(store);
    assert.ok(server instanceof http.Server,
      'createServer must accept a TodoStore instance');
    server.close();
  });

  test('createServer を引数なしで呼び出せる（デフォルトストアが作成される）', () => {
    const server = createServer();
    assert.ok(server instanceof http.Server,
      'createServer must work without arguments');
    server.close();
  });
});

describe('index.html 構造', () => {
  test('DOCTYPE 宣言を含む有効な HTML である', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes('<!DOCTYPE html>'),
      'index.html must have a DOCTYPE declaration');
    assert.ok(html.includes('<html'),
      'index.html must contain an <html> element');
    assert.ok(html.includes('</html>'),
      'index.html must close the <html> element');
  });
});

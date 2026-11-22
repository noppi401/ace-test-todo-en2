'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { TodoStore } = require('../server.js');

describe('TodoStore', () => {
  let store;

  beforeEach(() => {
    store = new TodoStore();
  });

  describe('addTodo', () => {
    test('IDは1から始まる', () => {
      const todo = store.addTodo('First task');
      assert.equal(todo.id, 1);
    });

    test('IDは連続してインクリメントされる', () => {
      store.addTodo('First');
      const second = store.addTodo('Second');
      assert.equal(second.id, 2);
    });

    test('completedはデフォルトでfalse', () => {
      const todo = store.addTodo('Task');
      assert.equal(todo.completed, false);
    });

    test('タイトルの前後の空白はトリムされる', () => {
      const todo = store.addTodo('  trimmed  ');
      assert.equal(todo.title, 'trimmed');
    });

    test('空文字列のタイトルはエラー', () => {
      assert.throws(() => store.addTodo(''), /Title cannot be empty/);
    });

    test('空白のみのタイトルはエラー', () => {
      assert.throws(() => store.addTodo('   '), /Title cannot be empty/);
    });

    test('文字列以外のタイトルはエラー', () => {
      assert.throws(() => store.addTodo(null), /Title must be a string/);
      assert.throws(() => store.addTodo(123), /Title must be a string/);
    });

    test('501文字以上のタイトルはエラー', () => {
      const longTitle = 'a'.repeat(501);
      assert.throws(() => store.addTodo(longTitle), /Title must be 1-500 characters/);
    });

    test('ちょうど500文字のタイトルは許可される', () => {
      const title = 'a'.repeat(500);
      const todo = store.addTodo(title);
      assert.equal(todo.title, title);
    });

    test('返却されるオブジェクトはid/title/completedを持つ', () => {
      const todo = store.addTodo('Task');
      assert.ok(Object.prototype.hasOwnProperty.call(todo, 'id'));
      assert.ok(Object.prototype.hasOwnProperty.call(todo, 'title'));
      assert.ok(Object.prototype.hasOwnProperty.call(todo, 'completed'));
    });
  });

  describe('getAllTodos', () => {
    test('初期状態では空配列を返す', () => {
      assert.deepEqual(store.getAllTodos(), []);
    });

    test('追加したTodoをすべて返す', () => {
      store.addTodo('First');
      store.addTodo('Second');
      const todos = store.getAllTodos();
      assert.equal(todos.length, 2);
    });

    test('コピーを返し、内部配列への参照を返さない', () => {
      store.addTodo('Task');
      const todos = store.getAllTodos();
      todos[0].title = 'Modified';
      const todos2 = store.getAllTodos();
      assert.equal(todos2[0].title, 'Task');
    });

    test('配列自体への参照を返さない', () => {
      const todos = store.getAllTodos();
      todos.push({ id: 99, title: 'Fake', completed: false });
      assert.equal(store.getAllTodos().length, 0);
    });
  });

  describe('getTodoById', () => {
    test('存在するIDならTodoを返す', () => {
      const added = store.addTodo('Task');
      const found = store.getTodoById(added.id);
      assert.deepEqual(found, added);
    });

    test('存在しないIDならnullを返す', () => {
      assert.equal(store.getTodoById(999), null);
    });

    test('コピーを返し、内部オブジェクトへの参照を返さない', () => {
      store.addTodo('Task');
      const found = store.getTodoById(1);
      found.title = 'Modified';
      const found2 = store.getTodoById(1);
      assert.equal(found2.title, 'Task');
    });
  });

  describe('toggleTodo', () => {
    test('completedをtrueに更新できる', () => {
      store.addTodo('Task');
      const updated = store.toggleTodo(1, true);
      assert.equal(updated.completed, true);
    });

    test('completedをfalseに更新できる', () => {
      store.addTodo('Task');
      store.toggleTodo(1, true);
      const updated = store.toggleTodo(1, false);
      assert.equal(updated.completed, false);
    });

    test('存在しないIDはエラーをthrowする', () => {
      assert.throws(() => store.toggleTodo(999, true), /Todo not found/);
    });

    test('更新されたTodoオブジェクトを返す', () => {
      store.addTodo('Task');
      const updated = store.toggleTodo(1, true);
      assert.equal(updated.id, 1);
      assert.equal(updated.title, 'Task');
      assert.equal(updated.completed, true);
    });

    test('変更が内部ストレージに反映される', () => {
      store.addTodo('Task');
      store.toggleTodo(1, true);
      const found = store.getTodoById(1);
      assert.equal(found.completed, true);
    });
  });

  describe('deleteTodo', () => {
    test('削除成功時にtrueを返す', () => {
      store.addTodo('Task');
      const result = store.deleteTodo(1);
      assert.equal(result, true);
    });

    test('削除するとgetAllTodosから消える', () => {
      store.addTodo('Task');
      store.deleteTodo(1);
      assert.equal(store.getAllTodos().length, 0);
    });

    test('存在しないIDはfalseを返す', () => {
      const result = store.deleteTodo(999);
      assert.equal(result, false);
    });

    test('同一IDを2回削除するとfalseを返す', () => {
      store.addTodo('Task');
      store.deleteTodo(1);
      const result = store.deleteTodo(1);
      assert.equal(result, false);
    });

    test('他のTodoには影響しない', () => {
      store.addTodo('First');
      store.addTodo('Second');
      store.deleteTodo(1);
      const todos = store.getAllTodos();
      assert.equal(todos.length, 1);
      assert.equal(todos[0].title, 'Second');
    });
  });
});

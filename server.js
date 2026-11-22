'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * In-memory storage for todo items.
 * Maintains a todos array and an auto-incrementing ID counter.
 */
class TodoStore {
  constructor() {
    /** @type {Array<{id: number, title: string, completed: boolean}>} */
    this.todos = [];
    /** @type {number} */
    this.nextId = 1;
  }

  /**
   * Creates a new todo item after validating the title.
   * @param {string} title - Raw title input (will be trimmed)
   * @returns {{id: number, title: string, completed: boolean}}
   * @throws {Error} If title is not a string, empty, or exceeds 500 chars
   */
  addTodo(title) {
    if (typeof title !== 'string') {
      throw new Error('Title must be a string');
    }
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new Error('Title cannot be empty');
    }
    if (trimmed.length > 500) {
      throw new Error('Title must be 1-500 characters');
    }
    const todo = { id: this.nextId++, title: trimmed, completed: false };
    this.todos.push(todo);
    return Object.assign({}, todo);
  }

  /**
   * Returns a shallow copy of every todo in insertion order.
   * @returns {Array<{id: number, title: string, completed: boolean}>}
   */
  getAllTodos() {
    return this.todos.map(t => Object.assign({}, t));
  }

  /**
   * Finds a single todo by its numeric ID.
   * @param {number} id
   * @returns {{id: number, title: string, completed: boolean}|null}
   */
  getTodoById(id) {
    const todo = this.todos.find(t => t.id === id);
    return todo ? Object.assign({}, todo) : null;
  }

  /**
   * Updates the completed field of a todo.
   * @param {number} id - ID of the todo to update
   * @param {boolean} completed - New completion state
   * @returns {{id: number, title: string, completed: boolean}}
   * @throws {Error} If no todo with the given ID exists
   */
  toggleTodo(id, completed) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) {
      throw new Error('Todo not found');
    }
    todo.completed = completed;
    return Object.assign({}, todo);
  }

  /**
   * Removes a todo from storage by ID.
   * @param {number} id
   * @returns {boolean} true if the todo was found and removed, false otherwise
   */
  deleteTodo(id) {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) {
      return false;
    }
    this.todos.splice(index, 1);
    return true;
  }
}

/**
 * Creates and returns a new HTTP server instance.
 * Route handlers are added by subsequent implementation tasks.
 * @param {TodoStore} [store] - TodoStore instance; creates a fresh one if omitted
 * @returns {http.Server}
 */
function createServer(store) {
  const todoStore = store instanceof TodoStore ? store : new TodoStore();

  const server = http.createServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

module.exports = { TodoStore, createServer };

if (require.main === module) {
  const server = createServer();
  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

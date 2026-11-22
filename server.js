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
 * Parses the JSON body from an incoming HTTP request.
 * Accumulates stream chunks and resolves with the parsed JSON value.
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>} Resolved with the parsed JSON value
 * @throws {Error} If the body cannot be parsed as valid JSON
 */
function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (_e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Writes a JSON-encoded HTTP response with the given status code.
 * Sets Content-Type: application/json and Content-Length headers automatically.
 * @param {http.ServerResponse} res
 * @param {number} statusCode - HTTP status code (e.g. 200, 201, 400, 404)
 * @param {any} body - Value to serialize with JSON.stringify
 */
function sendJsonResponse(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Extracts a positive integer ID from paths matching /api/todos/:id.
 * @param {string} pathname - URL pathname (e.g. '/api/todos/42')
 * @returns {number|null} Parsed integer ID, or null if the path does not match
 */
function extractIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/todos\/(\d+)$/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return id > 0 ? id : null;
}

/**
 * Creates and returns a new HTTP server instance with a route dispatcher.
 * Individual route handlers are attached by subsequent implementation tasks.
 * Pattern used by each handler: check method + pathname, then return early.
 * @param {TodoStore} [store] - Optional TodoStore instance; a fresh one is
 *   created if omitted.
 * @returns {http.Server}
 */
function createServer(store) {
  const todoStore = store instanceof TodoStore ? store : new TodoStore();

  const server = http.createServer(async (req, res) => {
    // Parse the request URL first; treat unparseable paths as 404 rather
    // than allowing them to fall through to the generic 500 error handler.
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (_e) {
      sendJsonResponse(res, 404, { error: 'Not found' });
      return;
    }

    try {
      const method = req.method;

      // ---- Route dispatcher ----
      // Individual route handlers are inserted here by subsequent tasks.
      // Each matched route returns early via `return handler(todoStore, ...)`.
      // Unmatched requests fall through to the 404 response below.
      void todoStore; // consumed by route handlers added in subsequent tasks
      void pathname;  // used by route-matching if-blocks added in subsequent tasks
      void method;    // used by route-matching if-blocks added in subsequent tasks

      // Fallthrough: no route matched
      sendJsonResponse(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[server] Unexpected error handling request:', err);
      sendJsonResponse(res, 500, { error: 'Internal server error' });
    }
  });

  return server;
}

module.exports = { TodoStore, createServer, parseJson, sendJsonResponse, extractIdFromPath };

if (require.main === module) {
  const server = createServer();
  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

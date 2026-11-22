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

'use strict';

const http = require('http');
const { createServer } = require('../server.js');

/**
 * Starts a test HTTP server bound to a random OS-assigned port on loopback.
 * Passing a pre-built `store` lets tests inspect or seed data before requests.
 * @param {import('../server.js').TodoStore} [store] - Optional TodoStore instance
 * @returns {Promise<{server: http.Server, port: number, baseUrl: string}>}
 */
function startServer(store) {
  return new Promise((resolve, reject) => {
    const server = createServer(store);
    // Port 0 asks the OS to assign any free port, avoiding conflicts in parallel tests.
    server.listen(0, '127.0.0.1', () => {
      const address = /** @type {import('net').AddressInfo} */ (server.address());
      resolve({
        server,
        port: address.port,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
    server.once('error', reject);
  });
}

/**
 * Gracefully shuts down a running test HTTP server.
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Makes an HTTP request to the test server and returns a parsed response.
 * When `body` is provided it is serialized as JSON and the appropriate
 * Content-Type / Content-Length headers are set automatically.
 *
 * @param {string} baseUrl  - Origin, e.g. 'http://127.0.0.1:PORT'
 * @param {string} method   - HTTP method ('GET', 'POST', 'PATCH', 'DELETE')
 * @param {string} urlPath  - Request path, e.g. '/api/todos/1'
 * @param {any}    [body]   - Optional request body; serialized with JSON.stringify
 * @returns {Promise<{status: number, headers: Record<string,string|string[]>, body: any}>}
 */
function request(baseUrl, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlPath, baseUrl);
    const payload = body !== undefined ? JSON.stringify(body) : null;

    /** @type {http.RequestOptions} */
    const options = {
      hostname: target.hostname,
      port: Number(target.port),
      path: target.pathname + target.search,
      method,
      headers: {},
    };

    if (payload !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        let parsedBody = null;
        if (data.length > 0) {
          try {
            parsedBody = JSON.parse(data);
          } catch (_e) {
            // Response body is not JSON — return raw string so callers can inspect it
            parsedBody = data;
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsedBody,
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);

    if (payload !== null) {
      req.write(payload);
    }

    req.end();
  });
}

module.exports = { startServer, stopServer, request };

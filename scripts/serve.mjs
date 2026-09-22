#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

/** Minimal static server for the harness (the visible browser only accepts http/https). */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
const root = target ? resolve(process.cwd(), target) : resolve(here, '..', 'harness', 'dist');
const port = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  // harness posts its measurement results here
  if (req.method === 'POST' && url === '/results') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const file = resolve(root, '..', 'results.json');
      writeFileSync(file, body, 'utf8');
      console.log(JSON.stringify({ ok: true, wrote: file, bytes: body.length }));
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = join(root, normalize(rel));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ ok: true, url: `http://127.0.0.1:${port}/`, root }, null, 2));
});

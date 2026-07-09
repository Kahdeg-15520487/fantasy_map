/**
 * Minimal static file server for the frontend.
 * Serves files from src/frontend/ on http://localhost:PORT
 *
 * Usage:
 *   npm run serve              # default port 3000
 *   npm run serve -- --port 8080
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// Parse --port flag
const portIdx = process.argv.indexOf('--port');
const PORT = portIdx >= 0 ? parseInt(process.argv[portIdx + 1] || '3000', 10) : parseInt(process.env.PORT || '3000', 10);
const ROOT = path.resolve(__dirname, 'dist', 'frontend');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🗺️  Fantasy World Map');
  console.log('');
  console.log(`  Serving:  ${ROOT}`);
  console.log(`  URL:      http://localhost:${PORT}`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

// Graceful shutdown on Ctrl+C
process.on('SIGINT', () => {
  console.log('\n  Shutting down...\n');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

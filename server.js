const { createServer } = require('http');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

// Limit concurrent requests to prevent memory overload
let activeRequests = 0;
const MAX_CONCURRENT = 5;

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (activeRequests >= MAX_CONCURRENT) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Server busy, please retry');
      return;
    }

    activeRequests++;
    res.on('finish', () => {
      activeRequests--;
    });

    handle(req, res);
  });

  server.keepAliveTimeout = 30000;
  server.headersTimeout = 35000;

  server.on('error', (err) => {
    console.error('Server error:', err.message);
  });

  server.listen(port, hostname, () => {
    console.log(`> Attindo server ready on http://${hostname}:${port}`);
  });

  // Keep process alive
  setInterval(() => {}, 60000);
}).catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

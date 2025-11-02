const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 5002,
  path: '/health',
  method: 'GET'
};

const req = http.request(options, (res) => {
  if (res.status === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();

const http = require('http');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {

  proxy.web(req, res, {
    target: '', //ip
  });
});

proxy.on('error', (err, req, res) => {
  console.error('Error en el proxy:', err);
  res.writeHead(500, {
    'Content-Type': 'text/plain',
  });
  res.end('Error interno del proxy');
});

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`Proxy listen: ${port}`);
});

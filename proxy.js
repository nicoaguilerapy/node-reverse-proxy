require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');
const zlib = require('zlib');
const LogModel = require('./log/LogModel');
const { PROXY_TARGET, PORT, AUTHORIZATION_TOKEN } = require('./app/config');

const proxy = httpProxy.createProxyServer({
  secure: true,
  changeOrigin: true,
});

let isLoggingActive = true;

function mapProxyUrl(req) {
  const apiPrefix = '/api/';
  if (req.url.startsWith(apiPrefix)) {
    const baseUrl = PROXY_TARGET.endsWith('/') ? PROXY_TARGET.slice(0, -1) : PROXY_TARGET;
    const relativeUrl = req.url.startsWith('/') ? req.url : `/${req.url}`;
    const newUrl = `${baseUrl}${relativeUrl}`;
    console.log(`Redirigiendo a: ${newUrl}`);
    return newUrl;
  }
  console.log(`Redirigiendo a: ${PROXY_TARGET}`);
  return PROXY_TARGET;
}

function sanitizeString(inputString) {
  if (!inputString) return '';
  return inputString
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/�/g, '')
    .replace(/",/g, '"');
}

const server = http.createServer((req, res) => {
  let requestBody = '';
  req.on('data', (chunk) => {
    requestBody += chunk.toString();
  });

  req.on('end', () => {
    try {
      req.body = JSON.parse(requestBody || '{}');
    } catch (err) {
      req.body = requestBody;
    }

    if (req.url.startsWith('/run')) {
      const parsedUrl = url.parse(req.url, true);
      const query = parsedUrl.query;
      const authHeader = req.headers['authorization'];

      if (authHeader !== `Bearer ${AUTHORIZATION_TOKEN}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      if (query.active === 't') {
        isLoggingActive = true;
      } else if (query.active === 'f') {
        isLoggingActive = false;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `Logging is now ${isLoggingActive ? 'active' : 'inactive'}` }));
      return;
    }

    const targetUrl = mapProxyUrl(req);

    let responseChunks = [];
    const originalWrite = res.write;
    const originalEnd = res.end;

    res.write = function (chunk, encoding, callback) {
      if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk, encoding || 'utf-8');
      }
      responseChunks.push(chunk);
      return originalWrite.call(res, chunk, encoding, callback);
    };

    res.end = function (chunk, encoding, callback) {
      if (chunk) {
        if (typeof chunk === 'string') {
          chunk = Buffer.from(chunk, encoding || 'utf-8');
        }
        responseChunks.push(chunk);
      }

      const buffer = Buffer.concat(responseChunks);
      if (res.getHeader('content-encoding') === 'gzip') {
        zlib.gunzip(buffer, (err, decoded) => {
          const responseBody = err ? '' : sanitizeString(decoded.toString());
          saveLog(req, res, responseBody);
        });
      } else {
        const responseBody = sanitizeString(buffer.toString());
        saveLog(req, res, responseBody);
      }

      return originalEnd.call(res, chunk, encoding, callback);
    };

    proxy.web(req, res, { target: targetUrl });
  });
});

function saveLog(req, res, responseBody) {
  if (isLoggingActive) {
    const logData = {
      url: req.url,
      method: req.method,
      request_status: res.statusCode,
      request: {
        headers: req.headers,
        body: req.body || {},
      },
      response_status: res.statusCode,
      response: {
        headers: res.getHeaders ? res.getHeaders() : {},
        body: responseBody,
      },
    };

    LogModel.createLog(logData).catch((err) => {
      console.error('Error al guardar el log:', err);
    });
  }
}

proxy.on('error', async (err, req, res) => {
  console.error('Error en el proxy:', err);

  const logData = {
    url: req.url,
    method: req.method,
    request_status: 500,
    request: {
      headers: req.headers,
      body: req.body || {},
    },
    response_status: null,
    response: null,
  };

  if (isLoggingActive) {
    await LogModel.createLog(logData);
  }

  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Error interno del proxy');
});

server.listen(PORT, () => {
  console.log(`Proxy ejecutándose en puerto: ${PORT}`);
});

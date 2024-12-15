require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');
const zlib = require('zlib');
const bodyParser = require('body-parser'); // Analizador de request body
const LogModel = require('./log/LogModel'); // Ruta al modelo
const { PROXY_TARGET, PORT, AUTHORIZATION_TOKEN } = require('./app/config');

const proxy = httpProxy.createProxyServer({
  secure: true,
  changeOrigin: true,
});

// Variable global para habilitar o deshabilitar el guardado de registros
let isLoggingActive = true;

// Función para ajustar dinámicamente la URL
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

// Función para limpiar caracteres no válidos de la cadena
function sanitizeString(inputString) {
  if (!inputString) return '';
  return inputString
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Elimina caracteres no imprimibles
    .replace(/�/g, '') // Elimina el carácter de reemplazo '�'
    .replace(/",/g, '"'); // Corrige cadenas mal formateadas
}

// Crear servidor HTTP
const server = http.createServer((req, res) => {
  // Middleware para capturar el cuerpo de la solicitud
  let requestBody = '';
  req.on('data', (chunk) => {
    requestBody += chunk.toString();
  });

  req.on('end', () => {
    try {
      req.body = JSON.parse(requestBody || '{}'); // Parsear el cuerpo como JSON
    } catch (err) {
      req.body = requestBody; // Si no es JSON, almacenar como texto plano
    }

    // Endpoint `/run` para activar/desactivar guardado de registros
    if (req.url.startsWith('/run')) {
      const parsedUrl = url.parse(req.url, true);
      const query = parsedUrl.query;
      const authHeader = req.headers['authorization'];

      // Validar token
      if (authHeader !== `Bearer ${AUTHORIZATION_TOKEN}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // Cambiar estado de guardado basado en el parámetro `active`
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

    // Variables para capturar el cuerpo de la respuesta
    let responseBody = '';
    const originalWrite = res.write;
    const originalEnd = res.end;

    // Interceptar datos de la respuesta
    res.write = function (chunk, encoding, callback) {
      if (res.getHeader('content-encoding') === 'gzip') {
        zlib.gunzip(chunk, (err, decoded) => {
          if (!err) {
            responseBody += sanitizeString(decoded.toString());
          }
        });
      } else {
        responseBody += sanitizeString(chunk.toString());
      }
      return originalWrite.call(res, chunk, encoding, callback);
    };

    res.end = function (chunk, encoding, callback) {
      if (chunk) {
        if (res.getHeader('content-encoding') === 'gzip') {
          zlib.gunzip(chunk, (err, decoded) => {
            if (!err) {
              responseBody += sanitizeString(decoded.toString());
            }
          });
        } else {
          responseBody += sanitizeString(chunk.toString());
        }
      }

      // Guardar el log solo si está activo
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

      return originalEnd.call(res, chunk, encoding, callback);
    };

    // Pasar la solicitud al proxy
    proxy.web(req, res, { target: targetUrl });
  });
});

// Capturar errores en el proxy
proxy.on('error', async (err, req, res) => {
  console.error('Error en el proxy:', err);

  // Registrar el error en la base de datos solo si el guardado está activo
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

// Iniciar el servidor
server.listen(PORT, () => {
  console.log(`Proxy ejecutándose en puerto: ${PORT}`);
});

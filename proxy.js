require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const LogModel = require('./log/LogModel'); // Ruta al modelo
const { PROXY_TARGET, PORT } = require('./app/config');

const proxy = httpProxy.createProxyServer({
  secure: true,
  changeOrigin: true,
});

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
  // Elimina cualquier caracter no imprimible o nulo (caracteres inválidos)
  return inputString.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/�/g, '') // Elimina el caracter '�'
  .replace(/\",/g, '"'); 
}

// Manejador principal del servidor HTTP
const server = http.createServer((req, res) => {
  const targetUrl = mapProxyUrl(req);

  // Variables para capturar el cuerpo de la respuesta
  let responseBody = '';
  const originalWrite = res.write;
  const originalEnd = res.end;

  // Interceptar datos de la respuesta
  res.write = function (chunk, encoding, callback) {
    responseBody += sanitizeString(chunk.toString());
    return originalWrite.call(res, chunk, encoding, callback);
  };

  res.end = function (chunk, encoding, callback) {
    if (chunk) {
      responseBody += sanitizeString(chunk.toString());
    }

    // Log después de completar la respuesta
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

    LogModel.createLog(logData).catch(err => {
      console.error('Error al guardar el log:', err);
    });

    return originalEnd.call(res, chunk, encoding, callback);
  };

  // Pasar la solicitud al proxy
  proxy.web(req, res, {
    target: targetUrl,
  });
});

// Capturar errores en el proxy
proxy.on('error', async (err, req, res) => {
  console.error('Error en el proxy:', err);

  // Registrar el error en la base de datos
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

  await LogModel.createLog(logData);

  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Error interno del proxy');
});

// Iniciar el servidor
server.listen(PORT, () => {
  console.log(`Proxy ejecutándose en puerto: ${PORT}`);
});

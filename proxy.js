require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const LogModel = require('./log/LogModel'); // Ruta al modelo
const { PROXY_TARGET, PORT } = require('./app/config');

const proxy = httpProxy.createProxyServer({});

// Función para ajustar dinámicamente la URL
function mapProxyUrl(req) {
  const apiPrefix = '/api/';
  if (req.url.startsWith(apiPrefix)) {
    // Asegurarnos de que PROXY_TARGET termine sin "/" y req.url comience con "/"
    const baseUrl = PROXY_TARGET.endsWith('/') ? PROXY_TARGET.slice(0, -1) : PROXY_TARGET;
    const relativeUrl = req.url.startsWith('/') ? req.url : `/${req.url}`;
    const newUrl = `${baseUrl}${relativeUrl}`; // Concatenar las partes

    console.log(`Redirigiendo a: ${newUrl}`);
    return newUrl;
  }

  console.log(`Redirigiendo a: ${PROXY_TARGET}`);
  return PROXY_TARGET;
}


// Manejador principal del servidor HTTP
const server = http.createServer(async (req, res) => {
  let targetUrl = '';
  try {
    targetUrl = mapProxyUrl(req);

    // Proxy al destino mapeado
    proxy.web(req, res, {
      target: targetUrl,
    });

    // Log la solicitud en la base de datos (sin esperar el resultado)
    LogModel.createLog({
      url: req.url,
      method: req.method,
      request_status: 200,
      request: {
        headers: req.headers,
        body: req.body || {},
      },
      response_status: 200,
      response: {
        headers: res.getHeaders(),
      },
    });
  } catch (error) {
    console.error('Error durante el mapeo de la URL', error);

    // Registrar el error en la base de datos
    await LogModel.createLog({
      url: req.url,
      method: req.method,
      request_status: 500,
      request: {
        headers: req.headers,
        body: req.body || {},
      },
      response_status: null,
      response: null,
    });

    // Respuesta estándar de error al usuario
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error interno en el proxy');
  }
});

// Capturar errores en el proxy
proxy.on('error', async (err, req, res) => {
  console.error('Error en el proxy:', err);

  // Registrar el error en la base de datos
  await LogModel.createLog({
    url: req.url,
    method: req.method,
    request_status: 500,
    request: {
      headers: req.headers,
      body: req.body || {},
    },
    response_status: null,
    response: null,
  });

  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Error interno del proxy');
});

// Iniciar el servidor
server.listen(PORT, () => {
  console.log(`Proxy ejecutándose en puerto: ${PORT}`);
});

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');
const http = require('http');
const fs = require('fs');

const app = express();

const proxy = createProxyMiddleware({
  target: 'http://192.168.88.92',
  changeOrigin: true,
});

app.use('/', proxy);

// Configurar SSL
const privateKey = fs.readFileSync('key.pem');
const certificate = fs.readFileSync('cert.pem');
const credentials = { key: privateKey, cert: certificate };

const httpsServer = https.createServer(credentials, app);

httpsServer.listen(443, () => {
  console.log('Servidor SSL en el puerto 443');
});


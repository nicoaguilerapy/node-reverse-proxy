const { pool } = require('../app/config');
const { v4: uuidv4 } = require('uuid');

class LogModel {
  static async createLog({ url, method, request_status, request, response_status, response }) {
    try {
      const id = uuidv4();

      // Extraer partes del request
      const requestHeader = request?.headers || '';
      const requestBody = request?.body || '';

      const contentType = requestHeader['content-type'] || '';
      if (contentType.startsWith('image/') || contentType.startsWith('application/octet-stream')) {
        console.log('Solicitud de tipo imagen o archivo, registro omitido.');
        return; // Ignorar registros de tipo imagen o archivo
      }

      // Extraer partes del response
      const responseHeader = response?.headers || '';
      const responseBody = response?.body || '';

      const query = `
        INSERT INTO logs (id, url, method, request_status, request_header, request_body, response_status, response_header, response_body)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      const values = [
        id,
        url,
        method,
        request_status,
        requestHeader,
        requestBody,
        response_status,
        responseHeader,
        responseBody,
      ];

      await pool.query(query, values);
      console.log('Log guardado correctamente en la base de datos');
    } catch (error) {
      console.error('Error al guardar el log en la base de datos:', error);
    }
  }
}

module.exports = LogModel;

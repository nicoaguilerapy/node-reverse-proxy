const { pool } = require('../app/config');
const { v4: uuidv4 } = require('uuid');

class LogModel {
  static async createLog({ url, method, request_status, request, response_status, response }) {
    try {
      const id = uuidv4();
      const query = `
        INSERT INTO logs (id, url, method, request_status, request, response_status, response)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const values = [
        id,
        url,
        method,
        request_status,
        JSON.stringify(request),
        response_status,
        JSON.stringify(response),
      ];

      await pool.query(query, values);
      console.log('Log guardado correctamente en la base de datos');
    } catch (error) {
      console.error('Error al guardar el log en la base de datos:', error);
    }
  }
}

module.exports = LogModel;

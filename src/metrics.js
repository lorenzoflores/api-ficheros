'use strict';

const client = require('prom-client');
const { pool } = require('./db/pool');
const { logger } = require('./logger');
const { routePath } = require('./middleware/routePattern');

// Registro propio (no el global de prom-client): se expone en GET /metrics.
const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, memoria, event loop, GC...

// "route" es siempre el patrón ("/files/:id") o "unmatched", nunca la URL real:
// así no aparecen ids en las métricas y el número de series es pequeño y fijo.
const httpLabels = ['method', 'route', 'status_code'];

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Peticiones HTTP atendidas',
  labelNames: httpLabels,
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las peticiones HTTP en segundos',
  labelNames: httpLabels,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Respuestas HTTP 5xx',
  labelNames: httpLabels,
  registers: [register],
});

const filesUploadedTotal = new client.Counter({
  name: 'files_uploaded_total',
  help: 'Ficheros subidos correctamente',
  labelNames: ['mime_type'], // solo 4 valores posibles (SPEC 1.4)
  registers: [register],
});

// Se calcula al pedir /metrics. Si la consulta falla se conserva el último valor:
// una métrica no debe dejar /metrics sin responder.
new client.Gauge({
  name: 'storage_bytes',
  help: 'Bytes ocupados por los ficheros subidos (SUM(size_bytes) de files)',
  registers: [register],
  async collect() {
    try {
      const { rows } = await pool.query('SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM files');
      this.set(Number(rows[0].total));
    } catch (err) {
      logger.warn({ err }, 'No se pudo calcular storage_bytes');
    }
  },
});

// Mide cada petición al terminar la respuesta, cuando ya se conocen la ruta y el código.
function metricsMiddleware(req, res, next) {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: routePath(req), status_code: String(res.statusCode) };
    stopTimer(labels);
    httpRequestsTotal.inc(labels);
    if (res.statusCode >= 500) httpErrorsTotal.inc(labels);
  });
  next();
}

module.exports = { register, metricsMiddleware, filesUploadedTotal };

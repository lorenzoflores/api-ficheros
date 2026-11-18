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

// storage_bytes se calcula al pedir /metrics. Si la consulta falla se conserva el último
// valor (una métrica no debe dejar /metrics sin responder) y el fallo se cuenta en
// metrics_collect_errors_total, para que un dato obsoleto no parezca correcto.
//
// prom-client lee todas las métricas en paralelo: las dos esperan a la misma consulta
// (una sola por petición a /metrics), y así el contador refleja el fallo en esa misma
// respuesta y no en la siguiente.
let pendingStorageRefresh = null;

function refreshStorage() {
  pendingStorageRefresh ??= (async () => {
    try {
      const { rows } = await pool.query('SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM files');
      storageBytes.set(Number(rows[0].total));
    } catch (err) {
      metricsCollectErrorsTotal.inc({ metric: 'storage_bytes' });
      logger.warn({ err }, 'No se pudo calcular storage_bytes');
    } finally {
      pendingStorageRefresh = null;
    }
  })();
  return pendingStorageRefresh;
}

const storageBytes = new client.Gauge({
  name: 'storage_bytes',
  help: 'Bytes ocupados por los ficheros subidos (SUM(size_bytes) de files)',
  registers: [register],
  collect: refreshStorage,
});

const metricsCollectErrorsTotal = new client.Counter({
  name: 'metrics_collect_errors_total',
  help: 'Errores al calcular una métrica al pedir /metrics',
  labelNames: ['metric'],
  registers: [register],
  collect: refreshStorage,
});

// Mide cada petición cuando se cierra la respuesta. Se usa "close" y no "finish":
// "close" se emite siempre, también cuando el cliente corta la conexión antes de recibir
// la respuesta (subida cancelada, timeout de un proxy). Esas peticiones se etiquetan con
// status_code="aborted" para que no desaparezcan de las métricas justo en los casos lentos.
function metricsMiddleware(req, res, next) {
  const stopTimer = httpRequestDuration.startTimer();
  res.once('close', () => {
    const finished = res.writableFinished;
    const labels = {
      method: req.method,
      route: routePath(req),
      status_code: finished ? String(res.statusCode) : 'aborted',
    };
    stopTimer(labels);
    httpRequestsTotal.inc(labels);
    if (finished && res.statusCode >= 500) httpErrorsTotal.inc(labels);
  });
  next();
}

module.exports = { register, metricsMiddleware, filesUploadedTotal };

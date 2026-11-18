'use strict';

// Patrón de la ruta atendida ("/files/:id"), nunca la URL real (que lleva ids).
// Se usa en logs y en métricas: así el número de valores distintos es pequeño y fijo.
//
// Express solo conoce el patrón completo mientras está dentro del router: cuando un
// handler llama a next(err), restaura req.baseUrl a "" antes del manejador de errores.
// Por eso markRouteBase guarda la base ("/files") al entrar en cada router.

const UNMATCHED = 'unmatched';

function markRouteBase(req, res, next) {
  req.routeBase = req.baseUrl;
  next();
}

// "/files/:id", "/files", o "unmatched" si ninguna ruta llegó a encajar
// (404, o peticiones rechazadas antes de llegar a la ruta, como un 401 de requireAuth).
function routePath(req) {
  if (!req.route || typeof req.route.path !== 'string') return UNMATCHED;
  const full = `${req.routeBase ?? req.baseUrl}${req.route.path}`;
  return full.length > 1 && full.endsWith('/') ? full.slice(0, -1) : full;
}

module.exports = { markRouteBase, routePath, UNMATCHED };

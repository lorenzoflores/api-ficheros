# Especificación — API de ficheros

API REST en **Node 22 + Express** para que cada usuario gestione sus propios ficheros.
Este documento define el alcance y los criterios de aceptación. No contiene código.

---

## 1. Qué hace

### 1.1 Funcionalidad

- **Registro** de usuario con email y contraseña.
- **Login** que devuelve un **JWT**. El resto de endpoints de ficheros exigen ese token en la cabecera `Authorization: Bearer <token>`.
- **Subir** un fichero (multipart/form-data, campo `file`).
- **Listar** mis ficheros (solo los del usuario autenticado).
- **Descargar** uno de mis ficheros.
- **Borrar** uno de mis ficheros.
- **Health check** público para comprobar que el servicio está vivo.

### 1.2 Tabla de endpoints

| Método | Ruta              | Auth | Éxito | Errores posibles            | Descripción                                   |
|--------|-------------------|------|-------|-----------------------------|-----------------------------------------------|
| GET    | `/health`         | No   | 200   | 503                         | Comprueba la BD; responde `{ "status": "ok" }` |
| POST   | `/auth/register`  | No   | 201   | 400, 409                    | Crea un usuario                               |
| POST   | `/auth/login`     | No   | 200   | 400, 401                    | Devuelve `{ "token": "<jwt>" }`               |
| POST   | `/files`          | Sí   | 201   | 400, 401, 413, 415          | Sube un fichero; devuelve sus metadatos       |
| GET    | `/files`          | Sí   | 200   | 401                         | Lista los metadatos de mis ficheros           |
| GET    | `/files/:id`      | Sí   | 200   | 401, 404                    | Descarga el contenido binario del fichero     |
| DELETE | `/files/:id`      | Sí   | 204   | 401, 404                    | Borra el fichero (sin cuerpo en la respuesta) |

Cualquier ruta no definida responde **404** con el formato de error estándar. Un error no controlado responde **500**.

### 1.3 Contratos de petición y respuesta

**POST /auth/register** — cuerpo JSON:
```json
{ "email": "ana@example.com", "password": "secreta123" }
```
- `email`: obligatorio, formato de email válido, máximo 254 caracteres, único (sin distinguir mayúsculas). Se guarda normalizado: sin espacios alrededor y en minúsculas.
- `password`: obligatoria, mínimo 8 caracteres y máximo 72 bytes en UTF-8 (límite de bcrypt).
- Respuesta 201: `{ "id": "<uuid>", "email": "ana@example.com" }`. Nunca se devuelve la contraseña ni su hash.

**POST /auth/login** — mismo cuerpo que el registro.
- Respuesta 200: `{ "token": "<jwt>" }`. El token incluye el id de usuario (`sub`) y caduca en 1 hora.
- Email inexistente y contraseña incorrecta producen **la misma** respuesta 401, para no revelar qué emails existen.
- En el login solo se exige que `email` sea válido y `password` no esté vacía (400 si no); las reglas de longitud del registro no se reaplican.

**Metadatos de fichero** (respuesta de `POST /files` y elementos de `GET /files`):
```json
{
  "id": "<uuid>",
  "name": "informe.pdf",
  "size": 48213,
  "mimeType": "application/pdf",
  "createdAt": "2026-11-09T18:00:00.000Z"
}
```
- `mimeType` es el **detectado por el contenido**, nunca el que declara el cliente.
- `GET /files` devuelve `{ "files": [ ... ] }`, ordenado por `createdAt` descendente. Si no hay ficheros, `{ "files": [] }`.

**GET /files/:id** — devuelve los bytes originales con:
- `Content-Type`: el `mimeType` detectado (para texto plano, `text/plain; charset=utf-8`).
- `Content-Disposition: attachment; filename="<name>"`. Si el nombre no es ASCII imprimible, `filename` lleva una versión ASCII (caracteres no válidos sustituidos por `_`) y se añade `filename*=UTF-8''<nombre codificado>` (RFC 5987).
- `Content-Length`: tamaño en bytes.

### 1.4 Reglas de subida

- **Tamaño máximo: 10 MB = 10 485 760 bytes.** Un fichero de exactamente 10 485 760 bytes se acepta; uno de 10 485 761 o más se rechaza con **413**.
- **Tipos permitidos**, detectados por los primeros bytes del contenido (*magic numbers*), ignorando extensión y `Content-Type` declarado:

  | Tipo        | MIME resultante   | Regla de detección                                                        |
  |-------------|-------------------|---------------------------------------------------------------------------|
  | PNG         | `image/png`       | Empieza por `89 50 4E 47 0D 0A 1A 0A`                                     |
  | JPEG        | `image/jpeg`      | Empieza por `FF D8 FF`                                                    |
  | PDF         | `application/pdf` | Empieza por `25 50 44 46 2D` (`%PDF-`)                                    |
  | Texto plano | `text/plain`      | UTF-8 válido, sin bytes NUL ni caracteres de control salvo `\t`, `\n`, `\r` |

  Cualquier otro contenido se rechaza con **415**.
- Petición sin campo `file`, con el fichero en un campo con otro nombre, con más de un fichero, que no es multipart o con fichero vacío (0 bytes) → **400** `FILE_REQUIRED`. Un multipart mal formado → **400** `VALIDATION_ERROR`.
- El nombre original se guarda limpio: solo el nombre base (sin rutas), sin caracteres de control y con un máximo de 255 caracteres; si queda vacío, `fichero`.
- Si una subida se rechaza, no queda nada guardado (ni metadatos ni bytes).

### 1.5 Aislamiento entre usuarios

- Cada fichero pertenece al usuario que lo subió.
- Si un usuario pide (`GET`) o borra (`DELETE`) un fichero que existe pero es de otro usuario, la respuesta es **404**, idéntica en código y cuerpo a la de un id que no existe. Así no se filtra la existencia de ficheros ajenos.
- Un `:id` con formato inválido también responde **404**.

### 1.6 Orden de comprobaciones

Para que los códigos sean predecibles, cada petición se evalúa en este orden y se responde con el primer fallo:

1. Autenticación (401)
2. Tamaño (413)
3. Presencia del fichero / fichero vacío (400)
4. Tipo de contenido (415)
5. Existencia y propiedad del recurso (404)

### 1.7 Formato de error

Todas las respuestas de error (4xx y 5xx) tienen este cuerpo JSON:

```json
{ "error": { "code": "FILE_TOO_LARGE", "message": "El fichero supera el máximo de 10 MB" } }
```

- `code`: identificador estable en MAYÚSCULAS, pensado para que lo lea un programa.
- `message`: texto legible para humanos; puede cambiar sin previo aviso.
- Nunca se incluyen trazas de pila ni detalles internos.

Catálogo de códigos:

| HTTP | `code`                    | Cuándo                                                              |
|------|---------------------------|---------------------------------------------------------------------|
| 400  | `VALIDATION_ERROR`        | Cuerpo inválido en registro/login, o multipart mal formado          |
| 400  | `FILE_REQUIRED`           | Falta el campo `file`, hay más de un fichero o el fichero está vacío |
| 401  | `UNAUTHORIZED`            | Falta el token, está mal formado, firma inválida o caducado          |
| 401  | `INVALID_CREDENTIALS`     | Login con email o contraseña incorrectos                             |
| 404  | `NOT_FOUND`               | Ruta inexistente, fichero inexistente o fichero de otro usuario      |
| 409  | `EMAIL_ALREADY_EXISTS`    | Registro con un email ya usado                                       |
| 413  | `FILE_TOO_LARGE`          | Fichero mayor de 10 485 760 bytes                                    |
| 415  | `UNSUPPORTED_MEDIA_TYPE`  | Contenido que no es PNG, JPEG, PDF ni texto plano                    |
| 500  | `INTERNAL_ERROR`          | Error no controlado                                                  |
| 503  | `SERVICE_UNAVAILABLE`     | `GET /health` no puede consultar la base de datos                    |

### 1.8 Requisitos no funcionales mínimos

- Las contraseñas se guardan con un hash lento (p. ej. bcrypt), nunca en claro.
- El secreto del JWT se lee de la variable de entorno `JWT_SECRET` (mínimo 32 caracteres); el servidor no arranca sin ella. Los tokens se firman con HS256 y solo se acepta ese algoritmo.
- El nombre original del fichero se guarda solo como metadato: en disco se almacena con un nombre generado (el `id`), de modo que un nombre como `../../etc/passwd` no tiene efecto.

---

## 2. Qué NO hace

Queda **fuera de alcance** (no se implementa ni se testea):

- **Compartir** ficheros entre usuarios, enlaces públicos o permisos de cualquier tipo.
- **Carpetas** o cualquier jerarquía: la lista de ficheros de un usuario es plana.
- **Versiones** de ficheros: subir dos veces el mismo nombre crea dos ficheros independientes; no hay historial ni sobrescritura.
- **Interfaz web**: solo API JSON/binaria.

Tampoco forma parte de esta versión (se menciona para evitar ambigüedades):

- Renombrar o editar ficheros ya subidos.
- Recuperación de contraseña, verificación de email, refresh tokens o logout en servidor.
- Roles de administrador.
- Cuotas de almacenamiento por usuario, paginación del listado o búsqueda.

---

## 3. Criterios de aceptación

Cada criterio es verificable con un test automatizado contra la app en memoria (Jest + supertest, contra una base de datos de tests separada). Hay **al menos un test por endpoint** y los criterios transversales tienen sus propios casos.

### 3.1 Un test por endpoint (camino feliz)

| ID    | Endpoint               | Escenario                                                     | Resultado esperado                                                                 |
|-------|------------------------|---------------------------------------------------------------|------------------------------------------------------------------------------------|
| E-01  | `GET /health`          | Petición sin token                                            | 200 y `{ "status": "ok" }`                                                         |
| E-02  | `POST /auth/register`  | Email nuevo y contraseña válida                               | 201; cuerpo con `id` y `email`; sin `password` ni hash                             |
| E-03  | `POST /auth/login`     | Credenciales de un usuario registrado                         | 200; `token` es un JWT cuyo `sub` es el id del usuario                             |
| E-04  | `POST /files`          | Subir un PNG válido con token                                 | 201; metadatos con `mimeType: "image/png"` y `size` correcto                       |
| E-05  | `GET /files`           | Usuario con dos ficheros subidos                              | 200; `files` contiene exactamente esos dos                                         |
| E-06  | `GET /files/:id`       | Descargar un fichero propio                                   | 200; bytes idénticos a los subidos; `Content-Type` y `Content-Disposition` correctos |
| E-07  | `DELETE /files/:id`    | Borrar un fichero propio                                      | 204; después, `GET /files/:id` → 404 y no aparece en `GET /files`                  |

### 3.2 Autenticación

| ID    | Escenario                                                        | Resultado esperado                     |
|-------|------------------------------------------------------------------|----------------------------------------|
| A-01  | Registro con email ya existente (también con otras mayúsculas)   | 409 `EMAIL_ALREADY_EXISTS`             |
| A-02  | Registro con email inválido o contraseña de menos de 8 caracteres | 400 `VALIDATION_ERROR`                 |
| A-03  | Login con contraseña incorrecta                                  | 401 `INVALID_CREDENTIALS`              |
| A-04  | Login con email inexistente                                      | 401 `INVALID_CREDENTIALS`, mismo cuerpo que A-03 |
| A-05  | Cada endpoint de `/files` sin cabecera `Authorization`           | 401 `UNAUTHORIZED`                     |
| A-06  | Token con firma inválida                                         | 401 `UNAUTHORIZED`                     |
| A-07  | Token caducado                                                   | 401 `UNAUTHORIZED`                     |

### 3.3 Tamaño máximo (10 MB)

| ID    | Escenario                                 | Resultado esperado                                  |
|-------|-------------------------------------------|-----------------------------------------------------|
| S-01  | Fichero de texto de exactamente 10 485 760 bytes | 201                                          |
| S-02  | Fichero de 10 485 761 bytes               | 413 `FILE_TOO_LARGE`; no aparece en `GET /files`    |
| S-03  | Sin campo `file`                          | 400 `FILE_REQUIRED`                                 |
| S-04  | Fichero de 0 bytes                        | 400 `FILE_REQUIRED`                                 |

### 3.4 Tipo detectado por contenido

| ID    | Escenario                                                              | Resultado esperado                                   |
|-------|------------------------------------------------------------------------|------------------------------------------------------|
| T-01  | PNG, JPEG, PDF y texto plano válidos                                   | 201 cada uno, con el `mimeType` correspondiente      |
| T-02  | PNG real subido como `foto.txt` con `Content-Type: text/plain`         | 201 con `mimeType: "image/png"` (manda el contenido) |
| T-03  | Ejecutable/binario (p. ej. cabecera ELF o ZIP) renombrado a `doc.pdf` con `Content-Type: application/pdf` | 415 `UNSUPPORTED_MEDIA_TYPE` |
| T-04  | Texto con bytes NUL o UTF-8 inválido, nombrado `notas.txt`             | 415 `UNSUPPORTED_MEDIA_TYPE`                         |
| T-05  | GIF válido (tipo de imagen no permitido)                               | 415 `UNSUPPORTED_MEDIA_TYPE`                         |
| T-06  | Tras cualquier 415, `GET /files`                                       | El fichero rechazado no aparece                      |

### 3.5 Aislamiento entre usuarios

Preparación: los usuarios **A** y **B** están registrados; **A** ha subido el fichero `F`.

| ID    | Escenario                                    | Resultado esperado                                                       |
|-------|----------------------------------------------|--------------------------------------------------------------------------|
| I-01  | B hace `GET /files`                          | 200; `F` no aparece                                                      |
| I-02  | B hace `GET /files/{F.id}`                   | **404** `NOT_FOUND` (nunca 403); sin bytes de `F` en la respuesta        |
| I-03  | B hace `DELETE /files/{F.id}`                | **404** `NOT_FOUND` (nunca 403)                                          |
| I-04  | Tras I-03, A hace `GET /files/{F.id}`        | 200; `F` sigue intacto                                                   |
| I-05  | Comparar I-02 con `GET` de un uuid inexistente | Mismo código y mismo cuerpo de respuesta                               |

### 3.6 Formato de error

| ID    | Escenario                                              | Resultado esperado                                                                    |
|-------|--------------------------------------------------------|---------------------------------------------------------------------------------------|
| F-01  | Todas las respuestas de error de los tests anteriores  | Cuerpo `{ "error": { "code": string, "message": string } }` sin otras claves en `error` |
| F-02  | Ruta inexistente (`GET /no-existe`)                    | 404 `NOT_FOUND` con el formato estándar                                               |
| F-03  | Error forzado no controlado                            | 500 `INTERNAL_ERROR`; el cuerpo no contiene la traza de pila                         |

### 3.7 Definición de terminado

- Todos los tests de las secciones 3.1–3.6 pasan con `npm test` en Node 22.
- Ningún test depende de servicios externos ni del orden de ejecución.
- Ningún endpoint de la sección 2 existe.

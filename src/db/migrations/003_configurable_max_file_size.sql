-- El tamaño máximo pasa a ser configurable (MAX_FILE_SIZE_BYTES): lo aplica la API.
-- La base de datos solo garantiza que el tamaño es positivo.
ALTER TABLE files DROP CONSTRAINT files_size_bytes_check;
ALTER TABLE files ADD CONSTRAINT files_size_bytes_positive CHECK (size_bytes > 0);

# Registro de Cambios (Changelog)

Todos los cambios notables de este proyecto se documentarán en este archivo.

## [No publicado]

## [1.0.1] - 2026-07-10

### Agregado
- **Enlace a la Demo**: Se agregó la URL de la demo en vivo en el archivo README.
- **Hoja de Ruta (Roadmap)**: Se agregó una sección de hoja de ruta en el README detallando futuras funcionalidades:
  - Recuperación de contraseña por correo electrónico.
  - Notificaciones por correo para vencimientos y gastos recurrentes.
  - Identidades por cuenta (CBU, CVU, CUIL).
  - Deduplicación Inteligente (Soft Deduplication) extrayendo el COELSA ID o número de comprobante para enviar posibles duplicados a Revisión Manual.
- **Validación de Idempotencia**: Se agregó una validación estricta de idempotencia en el flujo de ingesta de documentos (`document-pipeline.ts`) para evitar la creación de transacciones duplicadas cuando un worker reintenta un trabajo o se sube el mismo archivo.

### Cambiado
- **Licencia**: Se cambió la licencia del proyecto a GNU AGPL-3.0 para protegerlo contra la explotación comercial no autorizada como SaaS. Se actualizaron `package.json`, `package-lock.json` y el archivo `LICENSE` correspondientemente.

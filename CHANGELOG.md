# Registro de Cambios (Changelog)

Todos los cambios notables de este proyecto se documentarán en este archivo.

## [No publicado]

### Corregido
- **Texto de formularios visible a través del menú inferior**: los labels de los campos (con `z-index: 1` de MUI) se pintaban por encima de la barra de navegación fija, que no declaraba `z-index`. Ahora la barra usa el z-index de app bar del tema.
- **Doble envío de formularios**: Guardar un movimiento manual en Carga rápida no bloqueaba el botón y permitía duplicar el movimiento con un doble toque. Ahora todas las acciones de crear/editar/eliminar (movimientos, categorías, cuentas, cuotas, gastos recurrentes, deudas, perfil, tokens, súper, revisión, inbox y login/registro) bloquean el botón y muestran un spinner con texto de progreso mientras la petición está en vuelo.
- **Error "Payload invalido" al crear una categoría sin icono**: la API rechazaba `icon: null` en la creación (el schema solo aceptaba el campo ausente). Ahora `icon` y `colorHex` aceptan `null`, igual que en la edición.

### Cambiado
- **Errores de validación legibles**: la API ahora responde "Dato invalido en \"campo\"" en lugar de un "Payload invalido" genérico, indicando qué campo corregir.
- **Errores visibles en formularios**: los errores de guardado ahora se muestran dentro del propio drawer/diálogo abierto (antes quedaban ocultos detrás, en la parte superior de la página).

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

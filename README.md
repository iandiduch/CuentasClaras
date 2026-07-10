<div align="center">

# 💸 CuentasClaras

**Finanzas personales, claras. Self-hosted, con ingesta de comprobantes por IA.**

Subí una foto o PDF de un comprobante y la app lo lee con OCR, extrae el monto,
la fecha, la contraparte y la categoría, y registra el movimiento sola.
Vos solo revisás lo que la IA no tiene claro.

[![CI](https://github.com/iandiduch/CuentasClaras/actions/workflows/ci.yml/badge.svg)](https://github.com/iandiduch/CuentasClaras/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

[Funcionalidades](#-funcionalidades) ·
[Stack](#-stack-tecnológico) ·
[Arquitectura](#-arquitectura) ·
[Desarrollo local](#-desarrollo-local) ·
[Despliegue en VPS](#-despliegue-en-un-vps) ·
[API](#-api-de-ingesta) ·
[Licencia](#-licencia-y-créditos)

</div>

---

## ✨ Funcionalidades

### 🤖 Inbox IA — ingesta automática de comprobantes

El corazón de la app. Subís un comprobante (PDF, JPG, PNG o WEBP) desde la web
o por API, y un worker en segundo plano lo procesa con
[Mistral AI](https://mistral.ai):

- **OCR + extracción estructurada**: monto, moneda, fecha, concepto,
  contraparte (nombre, CUIT/CUIL, CVU) y tipo de operación (compra,
  transferencia enviada/recibida).
- **Sugerencia de categoría y cuenta** con nivel de confianza: si la IA está
  segura, el movimiento se confirma solo; si no, cae en la cola de
  **Revisión manual** para que confirmes en un toque.
- **Detección de identidad**: en Perfil cargás tus identidades (nombre,
  CUIT/CUIL, CVU/alias) y la IA las usa para saber si sos el emisor o el
  receptor de una transferencia.
- **Auditoría en tiempo real**: la pantalla *Inbox IA* muestra el estado de
  cada trabajo (en cola, procesando, completado, fallo) y permite reintentar
  los que fallaron.
- **Comprobante siempre a mano**: cada movimiento generado queda vinculado al
  documento original, que podés ver desde la app.

### 💰 Gestión financiera

| Módulo | Qué hace |
|---|---|
| **Cuentas** | Múltiples cuentas (banco, billetera, efectivo…), transferencias entre ellas y reajuste de saldo. |
| **Movimientos** | Historial completo: editá o eliminá registros, gastos e ingresos manuales con carga rápida. |
| **Categorías** | Crea categorías con icono propio y **presupuesto mensual** por categoría. |
| **Cuotas** | Cargás una compra en cuotas una vez y cada pago mensual se genera solo. |
| **Gastos recurrentes** | Servicios fijos (alquiler, suscripciones…) que se registran solos cada mes. |
| **Deudas** | Anotá quién te debe y a quién le debés; la app matchea pagos entrantes y te deja saldarlas. |
| **Análisis** | Tendencias mensuales, categorías dominantes y proyección de gastos con gráficos interactivos. |
| **Notificaciones** | Avisos internos (vencimientos, revisiones pendientes) con descarte individual. |

### 🛒 Lista de súper con precios reales

- Armá tu lista buscando productos con **precios online de supermercados**,
  consumiendo una API de catálogo/comparación de precios que definís por
  entorno (`PRICE_CATALOG_BASE_URL`). Si no configurás ninguna, la búsqueda
  online se desactiva sola y cargás los productos de forma manual — el resto
  del módulo funciona igual.
- Tachá los items en el súper desde el celular y cerrá la compra: se genera el
  movimiento con el gasto real.
- **Escaneá el ticket** al salir y la IA concilia lo que compraste item por
  item contra tu lista.
- Historial de compras por mes y por súper, catálogo de "Mis productos" con
  **historial de precios** por producto, y duplicado de listas para la compra
  semanal.

### 🔐 Cuenta y seguridad

- Registro y login con sesiones por cookie (`Secure` + HSTS detrás de HTTPS).
- Pensada como app **single-tenant**: cerrá el registro con
  `REGISTRATION_ENABLED=false` una vez creada tu cuenta.
- **Tokens de API personales** (revocables) para automatizaciones — nunca tu
  contraseña en un script.
- Rate-limiting por IP en login/registro, con soporte para proxy inverso de
  confianza (`TRUST_PROXY_HEADERS`).

### 📱 Experiencia móvil

Interfaz *mobile-first* con barra de navegación inferior, botón de acción
rápida (gasto, ingreso, transferencia, ajuste) y manifest PWA para instalarla
como app en el teléfono.

---

## 🧱 Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev) |
| UI | [Material UI 9](https://mui.com) + [MUI X Charts](https://mui.com/x/react-charts/) + [Tailwind CSS 4](https://tailwindcss.com) |
| Base de datos | [PostgreSQL](https://www.postgresql.org) + [Drizzle ORM](https://orm.drizzle.team) |
| IA | [Mistral AI](https://mistral.ai) (OCR + extracción estructurada, validada con [Zod](https://zod.dev)) |
| Worker | Proceso Node dedicado con cola en Postgres (sin Redis ni brokers extra) |
| Tests | [Vitest](https://vitest.dev) con transacciones con rollback contra Postgres real |
| Deploy | Docker + Docker Compose, [Caddy](https://caddyserver.com) como proxy inverso, imagen publicada en GHCR |

> [!NOTE]
> **npm 11 requerido para tocar dependencias.** `package-lock.json` se genera
> con npm 11; npm 10 (el que trae Node 20) resuelve distinto las dependencias
> opcionales wasm y rechaza el lockfile. El CI y el Dockerfile ya instalan
> npm 11 antes de `npm ci`. Si un `npm install` local te reescribe el lockfile
> quitando entradas `@emnapi/*`, no commitees ese cambio: regeneralo con
> `npm install --package-lock-only` en un directorio limpio.

---

## 🗺 Arquitectura

```text
                    Internet
                       │ HTTPS
                ┌──────▼──────┐
                │    Caddy    │  TLS, headers de seguridad, crowdsec
                └──────┬──────┘
                       │ 127.0.0.1:8147
        ┌──────────────▼──────────────┐
        │        app (Next.js)        │  UI + API REST (/api/v1/…)
        └──────┬───────────────┬──────┘
               │               │
        ┌──────▼──────┐ ┌──────▼───────┐
        │ PostgreSQL  │ │ ./storage    │  comprobantes originales
        │ (+ cola de  │ │ (volumen)    │
        │  ingesta)   │ └──────▲───────┘
        └──────▲──────┘        │
               │               │
        ┌──────┴───────────────┴──────┐
        │      worker (inbox)         │──► Mistral AI (OCR + extracción)
        └─────────────────────────────┘
```

- **app** y **worker** comparten la misma imagen Docker; solo cambia el `CMD`.
- La cola de ingesta vive en Postgres: cero infraestructura extra.
- Al arrancar, cada contenedor aplica las migraciones pendientes de
  `db/migrations/` automáticamente (idempotente y tolerante a arranques
  simultáneos).

### Organización del código

La app usa una **arquitectura modular plana** (*flat module architecture*),
sin capas formales de servicios, repositorios ni ports & adapters. Es la
variante más pragmática del patrón *Transaction Script*: cada Route Handler
llama directamente a funciones de `lib/server/` que encapsulan la lógica de
negocio y el acceso a datos. Menos indirección, menos archivos, más velocidad
de desarrollo.

```text
app/
  api/          →  Route Handlers (Next.js) — punto de entrada HTTP
  (main)/       →  Páginas (RSC + Client Components)
  components/   →  Componentes React reutilizables

lib/
  server/       →  Lógica de negocio + acceso a DB (Drizzle directo, sin repositorios)
  shared/       →  DTOs y tipos compartidos entre client y server
  client/       →  Utilidades solo del lado cliente

db/
  schema.ts     →  (re-export de lib/server/schema.ts)
  migrations/   →  Archivos SQL de migraciones

scripts/        →  Worker de inbox, migraciones, utilidades CLI
```

> [!NOTE]
> No hay capa de repositorio, servicios con interfaces ni inyección de
> dependencias. Si venís de arquitectura hexagonal o DDD, esto es intencional:
> para el alcance de esta app, la indirección extra no agrega valor.

---

## 🛠 Desarrollo local

### Requisitos

- **Node.js 20+** y **npm 11** (`npm install -g npm@11`)
- **PostgreSQL 16** (local o remoto, p. ej. Neon)
- Una **API key de Mistral** (para la ingesta IA; el resto de la app funciona sin ella)

### Puesta en marcha

```bash
git clone https://github.com/iandiduch/CuentasClaras.git
cd CuentasClaras
npm ci

# Configuración
cp .env.example .env        # editá credenciales de DB y MISTRAL_API_KEY

# Base de datos (schema.sql es el snapshot acumulado: bootstrap en un paso)
psql "$DATABASE_URL" -f db/schema.sql
npm run db:migrate          # aplica migraciones pendientes, si las hay

# App + worker (dos terminales)
npm run dev                 # http://localhost:3000
npm run worker:inbox        # procesa la cola de ingesta IA
```

### Scripts útiles

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `:3000` |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run worker:inbox` | Worker de ingesta IA (foreground) |
| `npm run worker:pm2:start` | Worker bajo pm2 (deploy sin Docker) |
| `npm test` / `npm run test:watch` | Tests con Vitest (necesitan `DATABASE_URL`) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Aplica migraciones de `db/migrations/` |
| `npm run db:studio` | Drizzle Studio (explorador de la DB) |

### Variables de entorno

Todas documentadas en [.env.example](.env.example). Las importantes:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a Postgres. |
| `APP_URL` | URL pública. Si es `https://…`, la cookie de sesión se marca `Secure` y se manda HSTS. |
| `MISTRAL_API_KEY` | API key de Mistral para OCR/extracción. |
| `MISTRAL_OCR_MODEL` / `MISTRAL_EXTRACT_MODEL` | Modelos a usar (por defecto `mistral-ocr-latest` / `mistral-small-latest`). |
| `PRICE_CATALOG_BASE_URL` | *(Opcional)* URL base de una API de catálogo/comparación de precios para la búsqueda online del súper. Sin ella, los productos se cargan manualmente. El contrato de endpoints esperado está documentado en [lib/server/price-catalog.ts](lib/server/price-catalog.ts). |
| `STORAGE_LOCAL_ROOT` | Carpeta donde se guardan los comprobantes (`./storage/documents`). |
| `MAX_UPLOAD_MB` | Tamaño máximo de archivo aceptado. |
| `QUEUE_CONCURRENCY` | Trabajos de ingesta en paralelo del worker. |
| `REGISTRATION_ENABLED` | `false` para cerrar `/register` una vez creada tu cuenta (recomendado en producción). |
| `TRUST_PROXY_HEADERS` | `true` **solo** detrás de un proxy propio (Caddy/nginx) que sobreescriba `X-Forwarded-For`. |

---

## 🚀 Despliegue en un VPS

El camino soportado es **Docker Compose detrás de Caddy** (o cualquier proxy
inverso con TLS). El CI publica la imagen en GHCR en cada push a `master`,
así que **no hace falta clonar el repo**: alcanza con tres archivos.

### 1. Requisitos en el servidor

- Docker + Docker Compose plugin
- Caddy (u otro proxy con HTTPS) apuntando al dominio
- PostgreSQL accesible (en el mismo VPS, gestionado, o serverless como Neon)

### 2. Configurar (sin clonar el repo)

Bajá los dos archivos que necesitás:

```bash
mkdir cuentasclaras && cd cuentasclaras
curl -O https://raw.githubusercontent.com/iandiduch/CuentasClaras/master/docker-compose.ghcr.yml
curl -O https://raw.githubusercontent.com/iandiduch/CuentasClaras/master/.env.example
mv .env.example .env
```

Editá `.env` para producción:

```dotenv
NODE_ENV=production
APP_URL=https://cuentas.tu-dominio.com   # https:// activa cookie Secure + HSTS
DATABASE_URL=postgresql://usuario:password@host:5432/cuentas_claras
MISTRAL_API_KEY=tu_api_key_real
TRUST_PROXY_HEADERS=true                 # Caddy es el proxy de confianza
REGISTRATION_ENABLED=true                # cerralo (false) tras crear tu cuenta
```

### 3. Base de datos

Con la base vacía, cargá el snapshot una sola vez:

```bash
curl -sO https://raw.githubusercontent.com/iandiduch/CuentasClaras/master/db/schema.sql
psql "$DATABASE_URL" -f schema.sql
```

A partir de ahí no tenés que tocar nada más: **cada contenedor aplica las
migraciones pendientes al arrancar** (ver `docker-entrypoint.sh`).

### 4. Levantar la app

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Esto levanta dos servicios que se reinician solos si se caen
(`restart: unless-stopped`):

- **app** — la web, publicada **solo en `127.0.0.1:8147`** (nadie puede
  saltarse el proxy), con healthcheck sobre `/api/health`.
- **worker** — la cola de ingesta IA.

Los comprobantes quedan en `./storage` (montado como volumen): sobreviven a
updates. Backupeá esa carpeta junto con la base de datos.

> [!NOTE]
> ¿Preferís buildear vos mismo? Cloná el repo y usá
> `docker compose up -d --build` con el [docker-compose.yml](docker-compose.yml)
> original.

### 5. Proxy inverso con Caddy

Agregá este bloque a tu Caddyfile y ajustá el dominio:

```caddyfile
cuentas.tu-dominio.com {
        reverse_proxy localhost:8147 {
                flush_interval -1
        }

        header {
                Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
                X-Content-Type-Options "nosniff"
                X-Frame-Options "DENY"
                Referrer-Policy "same-origin"
                -Server
        }

        # /api/health es solo para el healthcheck local de Docker
        @blockPaths path /api/health*
        respond @blockPaths 403
}
```

Recargá Caddy (`systemctl reload caddy`) y listo: HTTPS automático con
Let's Encrypt.

### 6. Primer usuario

1. Entrá a `https://cuentas.tu-dominio.com/register` y creá tu cuenta.
2. Poné `REGISTRATION_ENABLED=false` en `.env` y `docker compose up -d`
   para cerrar el registro.

### Actualizar

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Las migraciones nuevas se aplican solas al arrancar. No hay auto-deploy por
diseño: el servidor se actualiza cuando vos lo decidís.

### Alternativa sin Docker

También podés correrla directo con Node en el VPS: `npm ci && npm run build`,
`npm start` para la web (detrás del proxy) y el worker bajo pm2 con
`npm run worker:pm2:start` (config en [ecosystem.config.js](ecosystem.config.js)).

---

## 🔌 API de ingesta

Pensada para automatizaciones: atajos de iOS/Android, scripts, `curl`, n8n…

1. Generá un **token personal** en *Configuración → Perfil → Tokens*.
2. Mandá el comprobante:

```bash
curl -X POST https://cuentas.tu-dominio.com/api/v1/inbox \
  -H "Authorization: Bearer <tu-token>" \
  -F "file=@comprobante.pdf"
```

- **Formatos**: PDF, JPG, PNG, WEBP.
- **Formas de envío**: `multipart/form-data` (campo `file`), JSON
  (`fileBase64` o `fileDataUri`) o binario crudo en el body.
- La respuesta encola el trabajo; el worker lo procesa y el movimiento aparece
  en la app (confirmado o en *Revisión* según la confianza de la IA).

El resto de la API interna vive bajo `/api/v1/` (cuentas, movimientos,
categorías, deudas, cuotas, súper, analytics…) y acepta la misma
autenticación por token además de la sesión de la web.

---

## ✅ Tests y CI

- `npm test` corre la suite de Vitest contra un Postgres real; cada test corre
  dentro de una transacción con rollback, así que la base queda intacta.
- El workflow de [CI](.github/workflows/ci.yml) hace lint, type-check, tests,
  build, `npm audit` y, si todo pasa en `master`, **publica la imagen Docker
  en GHCR** (`ghcr.io/iandiduch/cuentasclaras`).

---

## 📄 Licencia y créditos

Este proyecto es **open source** bajo la licencia [GNU AGPL-3.0](LICENSE).

Podés usarlo, modificarlo y redistribuirlo, incluso con fines comerciales,
siempre que cumplas los términos de la GNU AGPL-3.0. Si distribuís una
versión modificada o la ofrecés como servicio en red, tenés que publicar el
código fuente correspondiente bajo la misma licencia, incluyendo tus cambios.

<div align="center">

Hecho con ☕ por **[Ian Diduch](https://github.com/iandiduch)**

Si el proyecto te sirve, ⭐ una estrella en GitHub es el mejor gracias.

</div>

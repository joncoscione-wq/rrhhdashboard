# AGENTS.md — PetraLabs RRHH

> Generado automáticamente por brain-agents-inject desde brain-data.
> No editar manualmente — se sobreescribe al abrir Claude Code.

## Proyecto

| Campo | Valor |
|-------|-------|
| Nombre | PetraLabs RRHH |
| Tipo | Dashboard |
| Cliente | PetraLabs |
| Stack | Next.js 16.2.1 + React 19.2.4 + Supabase + Tailwind + Sharp + Zustand + TypeScript + Vercel |
| Estado | activo |
| Último commit | 2026-07-09 |

## Perfil del desarrollador

# SKILL — perfil-desarrollador

## Descripción
Perfil técnico del desarrollador Ignacio Bavala. Define el stack tecnológico, convenciones y preferencias para cualquier proyecto nuevo.

## Cuándo usarla
- Al iniciar un proyecto nuevo
- Cuando necesites saber qué stack usar por defecto
- Para mantener consistencia tecnológica entre proyectos

## Cómo dirigirse a él

**Ignacio es hombre.** En español rioplatense los adjetivos van en masculino:
"vos solo", "quedaste tranquilo", "avisame cuando estés listo". Ojo con las
concordancias que se cuelan al escribir rápido ("sola", "lista", "preparada").

Tuteo con voseo, registro directo, sin formalismos.

## Stack por defecto para nuevos proyectos

```
Framework:    Next.js 16 (App Router)
UI:           React 19 + Tailwind CSS v4 + Framer Motion v12
Estado:       Zustand v5
DB:           Supabase (PostgreSQL + Auth + Storage + RLS)
Deploy:       Vercel (cuenta Pro — sin límite de frecuencia de crons)
Package:      pnpm
Linting:      ESLint 9 (flat config)
Lenguaje:     TypeScript strict
```

**Páginas livianas → Cloudflare** (Workers + Static Assets, D1/SQLite opcional, wrangler v4),
en vez de Next.js+Supabase+Vercel. Para arrancar cualquiera de los dos: scaffold
[[scaffold-nextjs-supabase]] (`kickstart`, targets `vercel` y `cloudflare`).

## Convenciones

- Server Components por defecto, Client Components solo cuando hay interactividad
- State global con Zustand v5 (no Context a menos que sea trivial)
- Animaciones con Framer Motion v12
- Estilos con Tailwind v4, configuración vía CSS `@theme` tokens
- Migraciones SQL como archivos `.sql` planos
- `vercel.json` con crons para keep-alive de Supabase
- Cada proyecto necesita su `AGENTS.md`
- **Next.js 16**: `middleware.ts` fue renombrado a `proxy.ts`; exportar `export function proxy(request)` en vez de `middleware`. Runtime Node.js por defecto. Codemod: `npx @next/codemod@canary middleware-to-proxy .`
- Sin testing, sin Docker
- Sin CSS-in-JS más allá de Tailwind
- `@/*` como path alias (apunta a `./*` o `./src/*`)
- **No subir binarios a git/GitHub** (fonts, imágenes pesadas, videos, PDFs): no se comprimen, no se pueden diffear, inflan el clone para siempre aunque se borren después, y hay límites duros de tamaño en GitHub. Para assets de proyecto usar Supabase Storage o Vercel Blob y referenciar por URL. Excepción: binarios chicos e imprescindibles para el build (ej. un logo o una fuente puntual) pueden ir directo al repo.

## ESLint

Usar flat config (`eslint.config.mjs`):
```js
import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const compat = new FlatCompat({ baseDirectory: __dirname })
const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")]
export default eslintConfig
```

## Skills relevantes para este proyecto

Leer el archivo completo solo si la tarea actual lo requiere — esta lista es solo un índice.

- **Tiquetera Vite + Supabase — bugs silenciosos y patrones seguros** (`/home/nch/Escritorio/brain-data/skills/tiquetera-vite-supabase/SKILL.md`)
  Al trabajar en cualquier sistema de tickets/entradas con: localStorage como caché de tickets en el cliente Supabase como fuente de verdad Escaneo de QR con confirmación de ingreso Registro de asistentes por email
- **React Email + Resend — setup, migración v6 y patrones de envío** (`/home/nch/Escritorio/brain-data/skills/react-email-resend/SKILL.md`)
  Al conectar envío de emails transaccionales o campañas de mailing en un proyecto Next.js + Supabase. Aplica tanto a la primera integración como a mantenimiento de templates existentes.
- **Cloudflare Wrangler — setup, assets estáticos y deploy seguro** (`/home/nch/Escritorio/brain-data/skills/cloudflare-wrangler-deploy/SKILL.md`)
  Cualquier proyecto con `wrangler.jsonc`/`wrangler.toml` (Worker o sitio estático servido con `assets.directory`), especialmente al instalar wrangler desde cero, autenticar, o antes de un `wrangler deploy` en un proyecto…
- **Google OAuth con Supabase SSR en Next.js 16** (`/home/nch/Escritorio/brain-data/skills/supabase-oauth-nextjs/SKILL.md`)
  Guía completa para instalar Google OAuth en Next.js 16 (App Router) con `@supabase/ssr`. Incluye los bugs conocidos que rompen el login silenciosamente.  ## 1. Google Cloud Console 1. Crear proyecto en https://console.cl…
- **Enviopack en Next.js — integración completa de cotización de envíos** (`/home/nch/Escritorio/brain-data/skills/enviopack-nextjs/SKILL.md`)
  Cuando un proyecto argentino necesite cotización de envíos a domicilio. Enviopack agrega múltiples transportistas (OCA, Andreani, etc.) bajo una sola API.
- **Supabase + Postgres — esquemas, RLS y queries eficientes** (`/home/nch/Escritorio/brain-data/skills/supabase-postgres-best-practices/SKILL.md`)
  Al diseñar tablas, escribir políticas RLS, optimizar queries, o integrar Supabase con Next.js 16.
- **Supabase Storage — egress, límites y buenas prácticas** (`/home/nch/Escritorio/brain-data/skills/supabase-storage-egress/SKILL.md`)
  Al subir archivos a Supabase Storage, especialmente videos o imágenes pesadas que se sirven públicamente. También al diseñar el hero de un sitio o cualquier sección con media grande.
- **Next.js 16 — App Router patterns y convenciones** (`/home/nch/Escritorio/brain-data/skills/nextjs-app-router-patterns/SKILL.md`)
  Al iniciar o trabajar en cualquier proyecto Next.js: estructura de rutas, data fetching, Server Actions, proxy (middleware), metadata, layouts.
- **TypeScript strict — tipos útiles en el stack Next.js + Supabase** (`/home/nch/Escritorio/brain-data/skills/typescript-advanced-types/SKILL.md`)
  Al definir tipos para API responses, props de componentes, Server Actions, datos de Supabase, o cuando TS emite un error de tipos que no se entiende.
- **Tailwind CSS v4 — configuración y patrones mobile-first** (`/home/nch/Escritorio/brain-data/skills/tailwindcss-mobile-first/SKILL.md`)
  Al configurar Tailwind v4 en un proyecto nuevo, definir tokens de diseño, o implementar layouts responsivos.
- **Testing E2E con Playwright — ecommerce Next.js + Supabase** (`/home/nch/Escritorio/brain-data/skills/playwright-ecommerce/SKILL.md`)
  Cuando haya un proyecto Next.js + Supabase con autenticación por roles y flujos de compra que necesiten cobertura de regresión antes del lanzamiento.
- **Jeeliz FaceFilter + Three.js — Web AR try-on** (`/home/nch/Escritorio/brain-data/skills/jeeliz-web-ar-tryon/SKILL.md`)
  ## Cuando usarla Al integrar el face tracker Jeeliz FaceFilter con Three.js en una app React (Vite) para probadores virtuales de anteojos. La API de Jeeliz es singleton global y opera sobre WebGL crudo; Three.js debe com…
- **Mails de auth de Supabase: token_hash en vez de PKCE, y el mailer que solo entrega al equipo** (`/home/nch/Escritorio/brain-data/skills/supabase-auth-mail-token-hash/SKILL.md`)
  Al implementar recuperación de contraseña, confirmación de cuenta, magic link o invitaciones con `@supabase/ssr` en Next.js App Router. Son dos bugs distintos que aparecen juntos y los dos son silenciosos: uno rompe el f…
- **Navegación con shell persistente (route group + framer-motion)** (`/home/nch/Escritorio/brain-data/skills/nextjs-persistent-shell-nav/SKILL.md`)
  Cuando querés que la navegación entre páginas se sienta como **un mismo espacio que muta** (sensación "redes sociales / cinta transportadora": nunca entrás ni salís del todo), o cuando necesitás elementos de UI que **sob…
- **Comprimir imágenes client-side antes de subir al storage** (`/home/nch/Escritorio/brain-data/skills/client-side-image-compress/SKILL.md`)
  Siempre que se implemente un uploader de imágenes (flyers, avatares, fondos, productos, etc.). Sin compresión, los usuarios pueden subir archivos de 10–25 MB que se sirven a cada visitante, generando egress masivo en Sup…
- **Vercel + React — performance y patrones críticos** (`/home/nch/Escritorio/brain-data/skills/vercel-react-best-practices/SKILL.md`)
  Al optimizar una página lenta, reducir el bundle, revisar re-renders, o hacer deploy en Vercel.
- **Bug silencioso — `hidden` no oculta si el componente ya trae `flex`/`inline-flex` en su base** (`/home/nch/Escritorio/brain-data/skills/tailwind-clases-conflicto-orden-hoja/SKILL.md`)
  Cada vez que un componente propio arme su `class` concatenando una base fija con un `className` que recibe por props: ```tsx <Link className={`inline-flex items-center ... ${VARIANTS[variant]} ${className}`}> ``` Y sobre…
- **Hover en touch — Tailwind v4 ya lo protege, tu CSS a mano no** (`/home/nch/Escritorio/brain-data/skills/hover-touch-tailwind-v4/SKILL.md`)
  Al hacer tarjetas, grillas de servicios o cualquier elemento con efecto de hover que también se va a ver en teléfono. Y cuando el síntoma es "el efecto queda pegado después de tocar".
- **Duplicados por formato de nombre y el mailto que los enmascara** (`/home/nch/Escritorio/brain-data/skills/duplicados-por-formato-de-nombre/SKILL.md`)
  Cuando una tabla de personas tiene duplicados después de importar desde Google Sheets / Excel, o cuando el matcher "por nombre" de un importador falla y nadie entiende por qué.
- **Scaffold Next.js 16 + Supabase (kickstart)** (`/home/nch/Escritorio/brain-data/skills/scaffold-nextjs-supabase/SKILL.md`)
  Al arrancar cualquier proyecto nuevo. En vez de re-hacer el setup a mano y re-debuggear los mismos bugs silenciosos en cada cliente, generar el proyecto ya con todo baked-in. Dos targets según el peso del proyecto: **`ve…
- **\"El botón de subir foto no hace nada\" — input file con display:none + .click() por JS** (`/home/nch/Escritorio/brain-data/skills/input-file-hidden-click-ios-webview/SKILL.md`)
  Cuando el cliente/usuario reporta que **aprieta "Subir foto" y no pasa nada**: no abre el selector de archivos, no aparece error, y en los logs del storage **no hay ni un POST**. Y encima "a mí me anda perfecto" desde Ch…
- **revoke de columna es un no-op si el rol tiene el privilegio a nivel tabla (escalada de privilegios en Supabase)** (`/home/nch/Escritorio/brain-data/skills/postgres-revoke-column-grant-no-op/SKILL.md`)
  Cada vez que una tabla con RLS tenga una columna que el dueño de la fila **no** debe poder editar: `is_admin`, `role`, `status`, `saldo`, `precio`, `verificado`. El caso típico en Supabase es `profiles.is_admin` con una…
- **Agente IA — operaciones de negocio vs escrituras de tabla** (`/home/nch/Escritorio/brain-data/skills/agente-ia-operaciones-vs-escrituras/SKILL.md`)
  Al darle a un agente LLM la capacidad de escribir en una base de datos de negocio. Aplica en cuanto el dominio tiene algo más que CRUD plano.
- **Bug silencioso — referencia externa huérfana al reintentar un pago** (`/home/nch/Escritorio/brain-data/skills/checkout-referencia-externa-huerfana/SKILL.md`)
  Al integrar cualquier pasarela de pago (Mercado Pago, Stripe, MODO, PayPal) donde: se genera una `external_reference` / `client_reference_id` por orden, las filas de la orden se crean **antes** de redirigir al checkout,…
- **Upsert acumulativo con clave más gruesa que la entidad oculta el registro nuevo** (`/home/nch/Escritorio/brain-data/skills/upsert-acumulativo-oculta-el-registro-nuevo/SKILL.md`)
  Cuando el usuario dice "lo cargué y no se registra" pero la operación devuelve `success: true` y la tabla efectivamente creció en algún número. El dato entró: lo que no entró es la **fila** que la UI necesita para dibuja…
- **Marquee CSS infinito — dos tracks, no uno animado a -50%** (`/home/nch/Escritorio/brain-data/skills/css-marquee-infinito-dos-tracks/SKILL.md`)
  Cuando hay una franja de texto que scrollea en loop (ticker de promos, "envío gratis", mensajes de marca) y el cliente reporta que **"se corta y deja de aparecer"**, o que el loop tiene un salto o un hueco. También al es…
- **Uploader con path fijo — la foto nueva nunca se ve (URL idéntica + CDN)** (`/home/nch/Escritorio/brain-data/skills/uploader-path-fijo-cache/SKILL.md`)
  Cuando el cliente/admin dice **"subo la foto y no cambia nada en el sitio"** y en la DB la fila del asset no se movió (`updated_at` viejo) o tiene exactamente la misma URL. Aplica a cualquier uploader a Supabase Storage…
- **Chatbot FAQ grounded con AI SDK v5 + Groq (widget Q&A)** (`/home/nch/Escritorio/brain-data/skills/ai-sdk-chatbot-grounded/SKILL.md`)
  Al agregar un widget de preguntas frecuentes / asistente virtual a un sitio, cuando la respuesta debe estar **anclada a un FAQ oficial** (sin inventar datos) y el objetivo es un chat simple con streaming, no un agente co…
- **Campo sacado del form + columna NOT NULL huérfana (y rate limit global que bloquea a todos)** (`/home/nch/Escritorio/brain-data/skills/form-not-null-huerfano-y-rate-limit-global/SKILL.md`)
  Cuando un formulario público (contacto, postulación, alta, solicitud) **dejó de funcionar sin que nadie tocara la lógica de envío**, o cuando una tarea de UI ["simplificar el form", "pedir menos datos"] sacó campos del J…
- **Guardar en un drawer/modal sin propagar al listado — "guardo y sigue el valor viejo** (`/home/nch/Escritorio/brain-data/skills/drawer-guardar-sin-propagar-estado/SKILL.md`)
  Cuando el cliente/admin reporta: **"edito, pongo guardar, dice guardado, y sigue apareciendo lo viejo. Después entro a la web, se refresca, y ahí sí cambió."** Aplica a cualquier panel donde una página Server Component t…
- **Inputs decimales en es-AR — coma como separador y estado string** (`/home/nch/Escritorio/brain-data/skills/inputs-decimales-coma-es-ar/SKILL.md`)
  Siempre que un formulario React/Next.js tenga campos numéricos con decimales (dimensiones, peso, precios, porcentajes) para usuarios argentinos. Síntoma típico reportado por el usuario: **"el input no toma decimales"** —…
- **Onboarding multi-paso con guest+fotos — rollback en fallo y RLS de storage por dueño** (`/home/nch/Escritorio/brain-data/skills/onboarding-guest-rollback-storage-rls/SKILL.md`)
  Cuando un flujo público (sin login) crea una fila "dueña" (guest, invitado, registro) y después, en el mismo submit, sube archivos y/o inserta filas relacionadas (acompañante, adjuntos) — típico de un onboarding con invi…
- **<details> donde solo un botón abre, y que se expanda a todo el ancho de la grilla** (`/home/nch/Escritorio/brain-data/skills/details-solo-el-boton-abre/SKILL.md`)
  Cuando hay que hacer un acordeón, una ficha ampliada o un "ver más" **sin JavaScript**, y aparece alguno de estos dos problemas: 1. El `<summary>` tiene contenido rico (título, descripción, un botón) y el cliente pide qu…
- **Postgres — MIN()/MAX() no existen para uuid y rompen la función en TODA llamada** (`/home/nch/Escritorio/brain-data/skills/postgres-min-max-no-existe-para-uuid/SKILL.md`)
  Al escribir cualquier función plpgsql o query que agregue una columna `uuid`, típicamente para "traer el id del grupo" en un `SELECT COUNT(*), MIN(algo_id)`.
- **Iconos con fondo fantasma en un mail — WebP con alfa y padding transparente** (`/home/nch/Escritorio/brain-data/skills/webp-alfa-en-mails-y-uploaders/SKILL.md`)
  Logos o iconos con transparencia que en un mail aparecen **con un fondo que no está en el archivo**, y/o se ven más chicos y sucios de lo que deberían.
- **Supabase — Max Rows silencioso trunca queries sin paginar** (`/home/nch/Escritorio/brain-data/skills/supabase-max-rows-limit/SKILL.md`)
  Al escribir o revisar cualquier `select()` de Supabase que traiga una tabla que puede crecer sin límite (emails, suscriptores, registros de eventos, logs, mensajes). También si un conteo o listado "deja de sumar" o parec…
- **Recurrencia de eventos anclada a día de semana real (no a created_at)** (`/home/nch/Escritorio/brain-data/skills/recurrencia-eventos-dia-semana/SKILL.md`)
  Al generar ocurrencias de un evento/taller recurrente (semanal, quincenal, mensual, etc.) a partir de una fila en la DB, especialmente cuando la fecha de alta (`created_at`) es distinta al día en que el evento realmente…
- **Paridad de env vars al mergear una rama a producción** (`/home/nch/Escritorio/brain-data/skills/env-var-parity-branch-deploy/SKILL.md`)
  Antes de mergear/pushear a `main` (o al proyecto de Vercel que sirve producción) una rama que estuvo en desarrollo aislado y que **agregó una feature nueva con su propia env var** (una API key, un secret, un feature flag…
- **Clave única incompleta que pisa filas en cada upsert** (`/home/nch/Escritorio/brain-data/skills/unique-key-incompleta-pisa-filas/SKILL.md`)
  Cuando una tabla "pierde" datos después de cada sync/importación y no hay ningún error en los logs. Especialmente si el volumen cargado es sistemáticamente menor al esperado y nadie sabe explicar por qué.
- **Botón de mail con fondo blanco en el celular — bgcolor y color-scheme** (`/home/nch/Escritorio/brain-data/skills/email-boton-fondo-blanco-mobile/SKILL.md`)
  Un mail HTML se ve bien en escritorio pero en el celular un botón (o cualquier bloque de color) aparece con fondo blanco, y **a veces sí y a veces no**. Ese "a veces" es la firma del bug: si fuera un error de código fall…
- **CLAUDE.md como symlink a AGENTS.md — la doc del proyecto se borra sola** (`/home/nch/Escritorio/brain-data/skills/claude-md-symlink-agents-sobreescrito/SKILL.md`)
  Al documentar cualquier proyecto que tenga `AGENTS.md` generado por `brain-agents-inject` Cuando aparece un `AGENTS.md` con muchas líneas modificadas en `git status` sin que nadie lo haya tocado Cuando documentación de p…
- **Grillas con hairlines responsivas — reaplicar bordes en cada media query** (`/home/nch/Escritorio/brain-data/skills/grid-hairlines-responsive-nth-child/SKILL.md`)
  Diseños "caged" / brutalistas donde las líneas de 1px entre celdas se dibujan con `border-top` / `border-left` de los ítems (no con `gap` + fondo del contenedor), y la cantidad de columnas cambia por breakpoint. Se usa e…
- **Contenido dual público/comunidad con columna visibilidad** (`/home/nch/Escritorio/brain-data/skills/contenido-dual-visibilidad/SKILL.md`)
  Cuando un sitio tiene usuarios con diferentes niveles de acceso (público, registrado, miembro) y querés extender las páginas existentes con contenido exclusivo **sin crear rutas nuevas**. El sitio es el mismo en esencia…
- **Bug silencioso — función en policy RLS necesita GRANT EXECUTE al rol que consulta** (`/home/nch/Escritorio/brain-data/skills/supabase-rls-funcion-policy-grant-execute/SKILL.md`)
  Cuando en Supabase/Postgres una tabla con RLS **devuelve 401 en TODA lectura** para un rol (típicamente `anon`), o cuando "el sitio público muestra vacío / la landing no carga datos" para visitantes no logueados, o cuand…
- **Scroll horizontal en mobile — overflow-x-clip vs overflow-hidden** (`/home/nch/Escritorio/brain-data/skills/overflow-clip-vs-hidden-scroll-horizontal/SKILL.md`)
  Cuando en el teléfono **toda la página se mueve para los costados** y no se encuentra el culpable, o cuando un elemento decorativo (óvalo, blob, glow, imagen rotada) está posicionado *a propósito* fuera del ancho de cont…
- **Conectar Supabase CLI con PAT** (`/home/nch/Escritorio/brain-data/skills/supabase-conexion-cli/SKILL.md`)
  El PAT de Supabase es **por cuenta**, no por proyecto. Un solo token sirve para todos los proyectos de la organización. ### Generar token 1. Ir a https://supabase.com/dashboard/account/tokens 2. Crear nuevo token 3. Copi…
- **Bucket público de Supabase — la policy de SELECT abierta deja listar todo** (`/home/nch/Escritorio/brain-data/skills/supabase-bucket-publico-select-listing/SKILL.md`)
  Al crear cualquier bucket de Supabase Storage con `public: true` (avatares, portadas, adjuntos), y al copiar las policies de un bucket existente a uno nuevo.
- **Supabase MCP Multiproyecto** (`/home/nch/Escritorio/brain-data/skills/supabase-mcp-multiproyecto/SKILL.md`)
  Siempre. Esta skill es un guard automático: cada vez que se use cualquier herramienta MCP de Supabase, se debe verificar que el proyecto destino coincide con el proyecto activo del directorio de trabajo. No se debe deleg…
- **Logo PNG que se ve chico — padding alfa dentro del archivo** (`/home/nch/Escritorio/brain-data/skills/logo-png-padding-alpha/SKILL.md`)
  Cuando ponés un logo que mandó un diseñador (PNG/WebP con transparencia) en un navbar, footer o card, lo dimensionás con `h-10` / `h-12` y **se ve notablemente más chico de lo que debería**. El reflejo es subir la clase…
- **Video 16:9 que entre en pantalla — capear ancho, no alto, y usar svh** (`/home/nch/Escritorio/brain-data/skills/aspect-ratio-cabe-en-viewport/SKILL.md`)
  Un player, hero o cualquier caja con relación de aspecto fija que tiene que entrar completa en el primer viewport y termina cortada abajo.
- **backdrop-filter (o filter) en el header confina los hijos position:fixed a su propia caja** (`/home/nch/Escritorio/brain-data/skills/backdrop-filter-fixed-menu-clipped/SKILL.md`)
  Cuando un menú mobile (burger menu / overlay `position: fixed; inset: 0`) reportado como "no despliega bien", "se ve cortado", "solo ocupa una franja arriba" o "no se ve" — y ese overlay está anidado **dentro** de un `<h…
- **sharp en Vercel con pnpm — binarios nativos que no llegan al bundle** (`/home/nch/Escritorio/brain-data/skills/sharp-vercel-pnpm-tracing/SKILL.md`)
  Cuando una ruta API de Next.js que usa `sharp` funciona en local pero en Vercel tira `ERR_DLOPEN_FAILED` (buscando `libvips-cpp.so.X`) o el cliente recibe `JSON.parse: unexpected character at line 1 column 1` (la función…
- **Soft delete sin filtrar `active` en todas las lecturas** (`/home/nch/Escritorio/brain-data/skills/soft-delete-filtro-incompleto/SKILL.md`)
  Cuando "borré algo desde el admin y volvió a aparecer" — en el listado del admin, en la home, en el listado público o en el checkout. También al introducir un soft delete nuevo.
- **Bug silencioso — login colgado en "Cargando..." con @supabase/ssr + embed ambiguo** (`/home/nch/Escritorio/brain-data/skills/supabase-ssr-login-deadlock/SKILL.md`)
  Dos bugs de admin Next.js + Supabase que aparecieron juntos en Pampa Estudio: 1. El botón de login queda en "Cargando…" para siempre (la sesión igual se crea). 2. Listados del admin muestran 0 filas / KPIs en 0 sin error…
- **Hono setSignedCookie async sin await rompe cookies silenciosamente** (`/home/nch/Escritorio/brain-data/skills/hono-set-signed-cookie-async/SKILL.md`)
  Cuando uses `setSignedCookie` de Hono para auth con cookies firmadas y el login parezca funcionar (redirige) pero luego las rutas protegidas fallen (loop infinito de login).
- **Bug silencioso de datetime-local con timestamps UTC** (`/home/nch/Escritorio/brain-data/skills/datetime-local-utc-bug/SKILL.md`)
  Siempre que un form tenga `<input type="datetime-local">` cuyo valor se carga desde un timestamp guardado en UTC (Supabase `timestamptz`, ISO strings) y se vuelve a guardar.
- **ON CONFLICT en Postgres debe matchear una constraint real, o falla siempre** (`/home/nch/Escritorio/brain-data/skills/postgres-on-conflict-debe-matchear-constraint-real/SKILL.md`)
  Al escribir o revisar funciones `plpgsql`/RPCs de Supabase que hacen `INSERT ... ON CONFLICT (cols) DO UPDATE`, especialmente si la tabla tiene varias columnas candidatas a "clave lógica" (ej. `vacaciones_id, mes` vs. la…
- **Importar planillas Excel/Sheets empresariales (grillas sucias) a Supabase** (`/home/nch/Escritorio/brain-data/skills/xlsx-import-grillas-empresariales/SKILL.md`)
  Al migrar datos desde Excel/Google Sheets "de uso real" de una empresa (no datasets limpios): encabezados que no están en la fila 1, filas de grupo mergeadas ("2023 | 2024"), meses codificados en el encabezado ("ene-23",…
- **Dropdown por :hover con gap visual se cierra antes de poder hacer click** (`/home/nch/Escritorio/brain-data/skills/css-hover-dropdown-gap/SKILL.md`)
  Cuando un menú desplegable de navbar (categorías, "más opciones", etc.) se abre con `:hover` puro (sin JS) y el usuario reporta que "el menú desaparece cuando intento llegar a una opción" — especialmente si el trigger y…
- **Flex item con overflow-hidden se aplasta a 0px en contenedores con scroll** (`/home/nch/Escritorio/brain-data/skills/flexbox-overflow-hidden-colapso/SKILL.md`)
  Cuando un elemento "desaparece" dentro de un panel que es `flex flex-col` con `max-h-*` + `overflow-y-auto` (sidebars sticky, drawers, resúmenes de checkout). El elemento sigue en el DOM (aparece en el accessibility tree…
- **Zustand persist — partialize obligatorio para no persistir estado de UI** (`/home/nch/Escritorio/brain-data/skills/zustand-persist-partialize/SKILL.md`)
  Siempre que un store de Zustand use el middleware `persist` y mezcle datos (items del carrito, preferencias) con estado efímero de UI (drawer abierto, loading, tab activa).
- **Escapar input de usuario en .or() de Supabase (PostgREST)** (`/home/nch/Escritorio/brain-data/skills/supabase-or-filter-escaping/SKILL.md`)
  Siempre que se interpole texto de búsqueda del usuario dentro de `.or()` de supabase-js (ej. `query.or(\`nombre.ilike.%${search}%\`)`).
- **Lenis smooth scroll — bugs silenciosos con drawers y overlays** (`/home/nch/Escritorio/brain-data/skills/lenis-smooth-scroll/SKILL.md`)
  Cuando un proyecto usa Lenis para smooth scroll y hay drawers, modales o cualquier contenedor con `overflow-y-auto` que no responde al trackpad.

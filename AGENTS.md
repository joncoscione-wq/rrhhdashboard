# AGENTS.md — PetraLabs RRHH

> Generado automáticamente por brain-agents-inject desde brain-data.
> No editar manualmente — se sobreescribe al abrir Claude Code.

## Proyecto

| Campo | Valor |
|-------|-------|
| Nombre | PetraLabs RRHH |
| Tipo | Dashboard |
| Cliente | PetraLabs |
| Stack | Next.js 16.2.1 + React 19.2.4 + Supabase + Tailwind v4 + Zustand |
| Estado | activo |
| Último commit | 2026-06-09 |

## Perfil del desarrollador

# SKILL — perfil-desarrollador

## Descripción
Perfil técnico del desarrollador Ignacio Bavala. Define el stack tecnológico, convenciones y preferencias para cualquier proyecto nuevo.

## Cuándo usarla
- Al iniciar un proyecto nuevo
- Cuando necesites saber qué stack usar por defecto
- Para mantener consistencia tecnológica entre proyectos

## Stack por defecto para nuevos proyectos

```
Framework:    Next.js 16 (App Router)
UI:           React 19 + Tailwind CSS v4 + Framer Motion v12
Estado:       Zustand v5
DB:           Supabase (PostgreSQL + Auth + Storage + RLS)
Deploy:       Vercel
Package:      pnpm
Linting:      ESLint 9 (flat config)
Lenguaje:     TypeScript strict
```

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
- **Google OAuth con Supabase SSR en Next.js 16** (`/home/nch/Escritorio/brain-data/skills/supabase-oauth-nextjs/SKILL.md`)
  Guía completa para instalar Google OAuth en Next.js 16 (App Router) con `@supabase/ssr`. Incluye los bugs conocidos que rompen el login silenciosamente.  ## 1. Google Cloud Console 1. Crear proyecto en https://console.cl…
- **Enviopack en Next.js — integración completa de cotización de envíos** (`/home/nch/Escritorio/brain-data/skills/enviopack-nextjs/SKILL.md`)
  Cuando un proyecto argentino necesite cotización de envíos a domicilio. Enviopack agrega múltiples transportistas (OCA, Andreani, etc.) bajo una sola API.
- **Supabase + Postgres — esquemas, RLS y queries eficientes** (`/home/nch/Escritorio/brain-data/skills/supabase-postgres-best-practices/SKILL.md`)
  Al diseñar tablas, escribir políticas RLS, optimizar queries, o integrar Supabase con Next.js 16.
- **Next.js 16 — App Router patterns y convenciones** (`/home/nch/Escritorio/brain-data/skills/nextjs-app-router-patterns/SKILL.md`)
  Al iniciar o trabajar en cualquier proyecto Next.js: estructura de rutas, data fetching, Server Actions, proxy (middleware), metadata, layouts.
- **TypeScript strict — tipos útiles en el stack Next.js + Supabase** (`/home/nch/Escritorio/brain-data/skills/typescript-advanced-types/SKILL.md`)
  Al definir tipos para API responses, props de componentes, Server Actions, datos de Supabase, o cuando TS emite un error de tipos que no se entiende.
- **Supabase Storage — egress, límites y buenas prácticas** (`/home/nch/Escritorio/brain-data/skills/supabase-storage-egress/SKILL.md`)
  Al subir archivos a Supabase Storage, especialmente videos o imágenes pesadas que se sirven públicamente. También al diseñar el hero de un sitio o cualquier sección con media grande.
- **Tailwind CSS v4 — configuración y patrones mobile-first** (`/home/nch/Escritorio/brain-data/skills/tailwindcss-mobile-first/SKILL.md`)
  Al configurar Tailwind v4 en un proyecto nuevo, definir tokens de diseño, o implementar layouts responsivos.
- **React Email + Resend — setup, migración v6 y patrones de envío** (`/home/nch/Escritorio/brain-data/skills/react-email-resend/SKILL.md`)
  Al conectar envío de emails transaccionales o campañas de mailing en un proyecto Next.js + Supabase. Aplica tanto a la primera integración como a mantenimiento de templates existentes.
- **Testing E2E con Playwright — ecommerce Next.js + Supabase** (`/home/nch/Escritorio/brain-data/skills/playwright-ecommerce/SKILL.md`)
  Cuando haya un proyecto Next.js + Supabase con autenticación por roles y flujos de compra que necesiten cobertura de regresión antes del lanzamiento.
- **Vercel + React — performance y patrones críticos** (`/home/nch/Escritorio/brain-data/skills/vercel-react-best-practices/SKILL.md`)
  Al optimizar una página lenta, reducir el bundle, revisar re-renders, o hacer deploy en Vercel.
- **Comprimir imágenes client-side antes de subir al storage** (`/home/nch/Escritorio/brain-data/skills/client-side-image-compress/SKILL.md`)
  Siempre que se implemente un uploader de imágenes (flyers, avatares, fondos, productos, etc.). Sin compresión, los usuarios pueden subir archivos de 10–25 MB que se sirven a cada visitante, generando egress masivo en Sup…
- **Supabase — Max Rows silencioso trunca queries sin paginar** (`/home/nch/Escritorio/brain-data/skills/supabase-max-rows-limit/SKILL.md`)
  Al escribir o revisar cualquier `select()` de Supabase que traiga una tabla que puede crecer sin límite (emails, suscriptores, registros de eventos, logs, mensajes). También si un conteo o listado "deja de sumar" o parec…
- **Contenido dual público/comunidad con columna visibilidad** (`/home/nch/Escritorio/brain-data/skills/contenido-dual-visibilidad/SKILL.md`)
  Cuando un sitio tiene usuarios con diferentes niveles de acceso (público, registrado, miembro) y querés extender las páginas existentes con contenido exclusivo **sin crear rutas nuevas**. El sitio es el mismo en esencia…
- **Conectar Supabase CLI con PAT** (`/home/nch/Escritorio/brain-data/skills/supabase-conexion-cli/SKILL.md`)
  El PAT de Supabase es **por cuenta**, no por proyecto. Un solo token sirve para todos los proyectos de la organización. ### Generar token 1. Ir a https://supabase.com/dashboard/account/tokens 2. Crear nuevo token 3. Copi…
- **Supabase MCP Multiproyecto** (`/home/nch/Escritorio/brain-data/skills/supabase-mcp-multiproyecto/SKILL.md`)
  Siempre. Esta skill es un guard automático: cada vez que se use cualquier herramienta MCP de Supabase, se debe verificar que el proyecto destino coincide con el proyecto activo del directorio de trabajo. No se debe deleg…
- **Zustand persist — partialize obligatorio para no persistir estado de UI** (`/home/nch/Escritorio/brain-data/skills/zustand-persist-partialize/SKILL.md`)
  Siempre que un store de Zustand use el middleware `persist` y mezcle datos (items del carrito, preferencias) con estado efímero de UI (drawer abierto, loading, tab activa).
- **Escapar input de usuario en .or() de Supabase (PostgREST)** (`/home/nch/Escritorio/brain-data/skills/supabase-or-filter-escaping/SKILL.md`)
  Siempre que se interpole texto de búsqueda del usuario dentro de `.or()` de supabase-js (ej. `query.or(\`nombre.ilike.%${search}%\`)`).
- **Lenis smooth scroll — bugs silenciosos con drawers y overlays** (`/home/nch/Escritorio/brain-data/skills/lenis-smooth-scroll/SKILL.md`)
  Cuando un proyecto usa Lenis para smooth scroll y hay drawers, modales o cualquier contenedor con `overflow-y-auto` que no responde al trackpad.

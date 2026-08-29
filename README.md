# 81 · 5D BUDGETING — Módulo de presupuestación (standalone)

Extracción **standalone** del módulo de presupuestación 5D del *Cotizador TRC · Decenal*
(repo 52 / repo 44 · Life City Total BIM Implementation). Aquí queda solo el flujo de
presupuesto, sin la parte de seguros (pólizas, decenal, aseguradoras, correo).

Hace 5 cosas, **tal cual como ya estaban escritas** — lo único que se añadió es dejarlo
correr por sí solo:

1. **Insertar un modelo IFC y detectarlo.** Subes el `.ifc` (Revit / masas.html) y la app
   extrae, 100 % en el navegador: niveles y sótanos, área total, categorías, **tipos de
   Revit con cantidades** (un / m² / ml / m³ leídas de los *quantity sets*) y las
   **actividades de obra** desde los parámetros `PSI_ActivityID / PSI_ActivityName /
   PSI_Start / PSI_Finish / PSI_WBS`. Además carga la **geometría real** en el visor 3D
   vía `web-ifc` (WASM). También acepta el JSON exportado del editor LifeCity BIM 5D.
2. **Selección de la unidad a cuantificar.** Cada actividad detectada trae su cantidad y
   unidad editables para ajustarla a la unidad del APU (m², m³, ml, un).
3. **Selección de APU desde Cloudflare.** Enlaza cada actividad a un APU buscándolo por
   nombre contra la base **APU Gobernación** servida por un Worker de Cloudflare D1
   (`cloudflare/worker.js`). Si no hay conexión, usa la base local
   `ejemplos/apus_gobernacion.json`.
4. **Cotización con proveedores.** Manda a cotizar por WhatsApp o correo — un material, un
   **APU completo** o **todo el proyecto** en un solo mensaje. Sube las cotizaciones
   recibidas (Excel/CSV), empareja insumos por nombre y resalta el proveedor más económico.
5. **Materiales totales.** Consolida `cantidad × rendimiento × (1+desperdicio)` de todos
   los APUs enlazados y exporta a Excel.
6. **Directorio de proveedores + total con mejor precio.** Pestaña **Proveedores** para
   guardar nombre + WhatsApp. En **Presupuesto** hay dos sub-pestañas: *APU y actividades*
   y *Cotizaciones de proveedores y total*, donde agregas/quitas proveedores, subes su
   cotización y ves el **Total final = costo directo APU − ahorro** comprando cada material
   al proveedor más económico.

## Cómo correr

**Opción A — con Python (recomendada, sirve WASM y respalda proyectos en disco):**

```bash
python serve.py
```

Luego abre http://localhost:8151/index.html — o simplemente ejecuta
**`Iniciar 5D Budgeting.bat`** (Windows).

**Opción B — sin instalar nada:** abre `index.html` directamente en el navegador. Todo
funciona salvo el respaldo en disco de proyectos (que es opcional; la persistencia real
vive en `localStorage`).

Prueba rápida: **Nuevo proyecto → pestaña Modelo 3D → Subir IFC → `ejemplos/demo.ifc`.**

## Sitio y cuentas de miembros

- **`index.html`** — landing de marketing (mercado, problema, solución y sección de
  miembros) con llamados a registrarse.
- **`login.html`** — crear cuenta / iniciar sesión.
- **`dashboard.html`** — dashboard privado con los proyectos de cada usuario.
- **`presupuesto.html`** — la app; requiere sesión.

⚠️ **Autenticación local:** las cuentas y los proyectos viven en el `localStorage` del
navegador (contraseñas con hash SHA-256 + sal). No es seguridad de servidor: separa los
proyectos por usuario en el mismo equipo. Para auth real (multi-dispositivo) haría falta un
backend. Requiere `http://localhost` o `https://` (contexto seguro para el hash).

## Estructura

```
index.html              Landing de marketing (página principal)
login.html              Crear cuenta / iniciar sesión (auth local)
dashboard.html          Dashboard privado por usuario (lista de proyectos)
auth.js                 Autenticación local (localStorage, hash SHA-256)
presupuesto.html        La app (Modelo 3D / Presupuesto / Materiales / Proveedores)
serve.py                Servidor local opcional (estático + respaldo de proyectos)
ejemplos/
  demo.ifc              IFC de prueba con parámetros PSI_* y quantity sets
  apus_demo.csv         Catálogo APU plano de ejemplo
  apus_gobernacion.json Base APU local (con desglose de insumos) — fallback offline
  cronograma_demo.xml   Cronograma MS Project de ejemplo
cloudflare/
  worker.js             API de APUs sobre Cloudflare D1 (/api/apus, /api/apu/:id, …)
  wrangler.toml         Config del Worker
  convertir_csv.py      Genera seed.sql + apus_gobernacion.json desde el CSV de APUs
```

## Base APU en Cloudflare

Por defecto apunta a `https://apu-gobernacion.lifecity.workers.dev`. Para usar tu propia
base despliega `cloudflare/worker.js` con Wrangler (D1) y cámbiala con el botón **☁ URL
Cloudflare** en la pestaña Presupuesto.

## Notas

- Persistencia: `localStorage` del navegador (namespace `budgeting5d_projects`) y, si
  corres `serve.py`, respaldo en `proyectos/*.json`.
- Externos (CDN): `three@0.160`, `web-ifc@0.0.57` (visor IFC) y `SheetJS` (Excel). El
  resto es autónomo.

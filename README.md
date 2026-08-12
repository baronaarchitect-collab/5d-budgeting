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
4. **Cotización con proveedores.** Manda a cotizar por especialidad, sube hasta 3
   cotizaciones (Excel/CSV), empareja insumos por nombre y resalta el proveedor más
   económico; puede empujar los precios de vuelta a Cloudflare.
5. **Materiales totales.** Consolida `cantidad × rendimiento × (1+desperdicio)` de todos
   los APUs enlazados y exporta a Excel.

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

## Estructura

```
index.html              Lista de proyectos (launcher)
presupuesto.html        La app (Modelo 3D / Presupuesto / Materiales)
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

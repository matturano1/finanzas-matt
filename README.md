# Finanzas Matt

App personal de finanzas instalable (PWA) para celular y escritorio: pagos del mes, ingresos, cuentas, fugas y ahorro.

- **Frente:** este repositorio, publicado en GitHub Pages.
- **Datos:** una hoja de Google personal. Apps Script funciona como API protegida con clave (`apps-script/Code.gs`).
- Este repositorio **no contiene datos, ID de la hoja, URL de la API ni clave**. La URL y la clave se escriben en la app la primera vez, en cada dispositivo.

## Puesta en marcha de la API

1. En la hoja: Extensiones → Apps Script. Reemplaza todo `Code.gs` con `apps-script/Code.gs`. Guarda.
2. Ejecuta `revisarEstructura` (no cambia nada; muestra lo que hará). Luego `actualizarEstructura`.
3. Ejecuta `generarClave` y copia la clave del registro de ejecución.
4. Implementar → Nueva implementación → Aplicación web. Ejecutar como: Yo. Acceso: Cualquier usuario. Copia la URL `/exec`.
5. Abre la app, pega la URL y la clave.

Después de cambiar `Code.gs`, publica con Implementar → Administrar implementaciones → Editar → Nueva versión, para conservar la misma URL.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html`, `styles.css`, `app.js` | La app |
| `manifest.webmanifest`, `sw.js`, `icons/` | Instalación, ícono y apertura sin internet |
| `apps-script/Code.gs` | API y actualización de la hoja (se pega en Apps Script, no corre en GitHub) |

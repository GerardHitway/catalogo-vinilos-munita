# 🎵 Hitway Music & Books — Catálogo Interactivo

Aplicación web moderna y táctil diseñada específicamente para que tiendas de música, ferias de coleccionistas y mostradores puedan usar su **tablet (iPad o Android)** como un kiosco interactivo de productos, y desplegarla en **Vercel** en minutos.

Hitway Music & Books es un catálogo de CD y vinilos administrado desde Google Sheets. Los clientes pueden armar una solicitud en el carrito y descargar una cotización en Excel.

---

## ✨ Características Principales

### 💿 Catálogo sincronizado desde Google Sheets
- **Administración centralizada:** Los productos, precios e imágenes se modifican directamente en Google Sheets.

---

---

### 📱 Experiencia Diseñada para Tablets
- **Galería de fotos:** Cada producto puede tener varias imágenes, navegables desde su ficha.
- **Carrito de cotización:** Agrega o quita CD y vinilos, ajusta las cantidades y descarga una cotización `.xlsx` con los productos solicitados, unidades y precios con separador de miles.
- **Resumen del carrito:** Muestra los totales estimados sin IVA y con IVA.
- **Alcance del catálogo:** Se muestran CD y vinilos, según la columna `FORMATO` de la hoja.
- **Catálogo administrado desde la hoja:** Los productos, precios e imágenes se actualizan desde Google Sheets; no se pueden editar desde la aplicación.
- **PWA (Progressive Web App):** Instalable en la pantalla de inicio del iPad o Android para ejecutarse a pantalla completa (Fullscreen Kiosk Mode) sin barras del navegador.
- **Búsqueda, formato y orden:** Búsqueda por producto o artista, filtro por CD o vinilos y orden por precio ascendente/descendente o artista A-Z.
- **Tracklist:** Las canciones se muestran desde la columna `TRACKLIST` de la hoja.
- **Precios con IVA:** Se muestra el precio antes de IVA y debajo el total calculado con IVA chileno del 19%.

---

## 🚀 Cómo Desplegar en Vercel (En 2 Minutos)

Esta aplicación incluye `vercel.json` y no requiere pasos complejos de compilación en el servidor:

### Opción 1: Conectar con GitHub (Recomendado)
1. Sube esta carpeta a un repositorio de GitHub:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git branch -M main
   git push -u origin main
   ```
2. Entra en [vercel.com](https://vercel.com) e inicia sesión.
3. Haz clic en **"Add New..."** → **"Project"**, selecciona el repositorio y pulsa **"Deploy"**.
4. ¡Listo! Vercel te dará una URL HTTPS lista para abrir en tu tablet.

### Opción 2: Vercel CLI
```bash
# Dentro de la carpeta del proyecto
npx vercel
```

---

## 📲 Cómo Usar en una Tablet (iPad o Android)

### En iPad (Safari):
1. Abre la URL en Safari.
2. Toca el botón **Compartir** (icono de cuadrado con flecha hacia arriba).
3. Selecciona **"Agregar al inicio"** (Add to Home Screen).
4. La app se abrirá a pantalla completa sin barra de direcciones.

### En Tablet Android (Chrome):
1. Abre la URL en Google Chrome.
2. Toca los tres puntos verticales en la esquina superior derecha.
3. Selecciona **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.

---

## 🔐 Administración del catálogo

El catálogo contiene CD y vinilos. Administra productos, precios e imágenes directamente en Google Sheets; la aplicación sincroniza los cambios automáticamente. El carrito permite preparar una solicitud y exportarla como archivo Excel.

### Sincronizar productos desde Google Sheets

- En la hoja, usa los encabezados `PRODUCTO`, `SKU`, `IMAGENES`, `FORMATO`, `PRECIO` y `TRACKLIST`.
- Comparte la hoja como **Cualquier persona con el enlace → Lector** para que el catálogo pueda leerla sin iniciar sesión.
- La aplicación utiliza la hoja configurada para la sincronización automática.
- La sincronización también se ejecuta al abrir el catálogo y cada 5 minutos mientras está abierto. Solo se muestran los productos de la hoja; los que se quiten de ella desaparecerán del catálogo.
- Para un producto con varias imágenes, coloca cada URL en una fila. En las filas de imágenes adicionales, deja `PRODUCTO` y `SKU` vacíos. La primera imagen se usa como portada.
- El `SKU` identifica el producto y la columna `PRECIO` actualiza su precio.
- El formato que aparece en el catálogo se toma de la columna `FORMATO`.
- El tracklist se toma de la celda `TRACKLIST`; se admiten pistas multilínea con numeración de lado (por ejemplo, `A1 Título 3:28`).
- Si un producto no tiene precio, igualmente aparecerá y mostrará **Consultar precio** hasta que completes la celda.

---

## 💻 Prueba Local (Opcional)

```bash
# Iniciar servidor local con Python
python3 -m http.server 3000
```
Luego abre `http://localhost:3000` en tu navegador.

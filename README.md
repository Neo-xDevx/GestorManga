# ManhwaDir

ManhwaDir es una aplicación de escritorio moderna construida con **Electron**, **HTML/CSS/JS** y **SQLite** diseñada para gestionar tu biblioteca personal de manga, manhwa y webtoons con un estilo visual limpio inspirado en Windows 11.

## Características Principales

- **Gestión Completa (CRUD):** Añade, edita, elimina y visualiza tus mangas favoritos.
- **Portabilidad Total:** Las imágenes de portada y portadas web se descargan y almacenan codificadas en `Base64` directamente en la base de datos local SQLite, lo que permite que toda tu biblioteca sea un único archivo(`.db`) fácil de respaldar.
- **Backups Nativos:** Sistema integrado para exportar tu base de datos y mantener tu colección a salvo.
- **Soporte para Rutas Locales:** Puedes vincular carpetas de tu sistema operativo (`C:\...`, `D:\...`) a cada manga para abrirlas con un solo clic desde la aplicación.
- **Interfaz Moderna:** Diseño oscuro/claro elegante ("Glassmorphism"), barra lateral dinámica y notificaciones pop-up (toasts).
- **Filtros Avanzados:** Búsqueda en tiempo real, filtrado por género, categoría y estado de publicación (Emisión, Finalizado, etc.).

## Tecnologías Utilizadas

- **Frontend:** HTML5, CSS3, JavaScript Vanilla.
- **Backend:** Electron (Node.js).
- **Base de Datos:** SQLite (`better-sqlite3`).
- **Iconos:** Lucide Icons.
- **Fuentes:** Google Fonts (Outfit).

## Instalación y Uso (Desarrollo)

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Neo-xDevx/GestorManga.git
   cd GestorManga
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Ejecutar la aplicación:**
   ```bash
   npm start
   ```

## Compilación (Build)
Para compilar la aplicación y generar un instalador `.exe` para Windows:

```bash
npm run build
```
*(Requiere tener configurado `electron-builder` en tu `package.json`)*.

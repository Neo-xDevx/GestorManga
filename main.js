const { app, BrowserWindow, ipcMain, shell, protocol, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const db = require('./database');

// Ensure thumbnails directory exists
const thumbnailsPath = path.join(app.getPath('userData'), 'thumbnails');
if (!fs.existsSync(thumbnailsPath)) {
    fs.mkdirSync(thumbnailsPath, { recursive: true });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 400,
        minHeight: 500,
        backgroundColor: '#0f0f0f',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#1a1a1a',
            symbolColor: '#ffffff',
            height: 40
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'manga.ico')
    });

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    // Register local-image protocol
    protocol.registerFileProtocol('local-image', (request, callback) => {
        const url = request.url.replace('local-image://', '');
        try {
            return callback(decodeURIComponent(url));
        } catch (error) {
            console.error('Failed to register protocol', error);
        }
    });

    db.initDB();

    // Migrar imágenes locales existentes a Base64 en la base de datos
    const allMangas = db.getMangas(100000);
    for (const manga of allMangas) {
        if (manga.imagen_local && !manga.imagen_local.startsWith('data:image')) {
            const imgPath = path.join(thumbnailsPath, manga.imagen_local);
            if (fs.existsSync(imgPath)) {
                try {
                    const buffer = fs.readFileSync(imgPath);
                    const ext = path.extname(imgPath).toLowerCase();
                    let mime = 'image/jpeg';
                    if (ext === '.png') mime = 'image/png';
                    else if (ext === '.webp') mime = 'image/webp';
                    else if (ext === '.gif') mime = 'image/gif';

                    const base64 = `data:${mime};base64,${buffer.toString('base64')}`;
                    db.updateMangaLocalImage(manga.id, base64);

                    // Eliminar el archivo físico después de migrar para liberar espacio
                    fs.unlinkSync(imgPath);
                    console.log(`Migrada imagen de manga ${manga.id} a Base64`);
                } catch (err) {
                    console.error(`Error migrando imagen de manga ${manga.id}:`, err);
                }
            }
        }
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-mangas', async (event, { limit, offset, order } = {}) => {
    return db.getMangas(limit, offset, order);
});

ipcMain.handle('get-mangas-count', async () => {
    return db.getMangasCount();
});

ipcMain.handle('get-favoritos', async () => {
    return db.getFavoritos();
});

ipcMain.handle('check-manga-exists', async (event, { titulo, titulo_secundario }) => {
    return db.checkMangaExists(titulo, titulo_secundario);
});

ipcMain.handle('add-manga', async (event, manga) => {
    return db.addManga(manga);
});

ipcMain.handle('delete-manga', async (event, id) => {
    return db.deleteManga(id);
});

ipcMain.handle('toggle-favorito', async (event, { id, status }) => {
    return db.toggleFavorito(id, status);
});

ipcMain.handle('update-manga', async (event, { id, manga }) => {
    return db.updateManga(id, manga);
});

ipcMain.handle('get-generos', async () => {
    return db.getGeneros();
});

ipcMain.handle('add-genero', async (event, nombre) => {
    return db.addGenero(nombre);
});

ipcMain.handle('delete-genero', async (event, id) => {
    return db.deleteGenero(id);
});

ipcMain.handle('get-manga-generos', async (event, mangaId) => {
    return db.getMangaGeneros(mangaId);
});

ipcMain.handle('seed-50', async () => {
    return db.seed50();
});

ipcMain.handle('get-categorias', async () => {
    return db.getCategorias();
});

ipcMain.handle('add-categoria', async (event, nombre) => {
    return db.addCategoria(nombre);
});

ipcMain.handle('delete-categoria', async (event, id) => {
    return db.deleteCategoria(id);
});

// Offline Image Handlers
ipcMain.handle('download-image', async (event, { url, id }) => {
    if (!url || !url.startsWith('http')) return null;

    return new Promise((resolve) => {
        https.get(url, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = response.headers['content-type'] || 'image/jpeg';
                const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;
                resolve(base64);
            });
        }).on('error', (err) => {
            console.error("Image download error:", err);
            resolve(null);
        });
    });
});

ipcMain.handle('open-directory', async (event, dirPath) => {
    if (!dirPath) return false;
    try {
        const result = await shell.openPath(dirPath);
        return result === ''; // empty string means success in Electron
    } catch (err) {
        console.error("Error opening path:", err);
        return false;
    }
});

ipcMain.handle('create-backup', async (event) => {
    const dbPath = path.join(app.getPath('userData'), 'manhwadir.db');
    if (!fs.existsSync(dbPath)) return { success: false, message: 'Base de datos no encontrada' };

    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar Copia de Seguridad',
        defaultPath: path.join(app.getPath('documents'), `ManhwaDir_Backup_${new Date().toISOString().split('T')[0]}.db`),
        filters: [
            { name: 'Database Files', extensions: ['db', 'sqlite'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (canceled || !filePath) return { success: false, message: 'Operación cancelada' };

    try {
        fs.copyFileSync(dbPath, filePath);
        return { success: true, message: 'Copia de seguridad creada con éxito', path: filePath };
    } catch (error) {
        console.error('Backup error:', error);
        return { success: false, message: 'Error al crear la copia de seguridad: ' + error.message };
    }
});

ipcMain.handle('restore-backup', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Seleccionar Respaldo de Base de Datos',
        properties: ['openFile'],
        filters: [
            { name: 'Database Files', extensions: ['db', 'sqlite'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (canceled || filePaths.length === 0) return { success: false, message: 'Operación cancelada' };

    const sourcePath = filePaths[0];
    const destinationPath = path.join(app.getPath('userData'), 'manhwadir.db');

    try {
        // Copiar el archivo seleccionado a la ubicación de la base de datos de la app
        fs.copyFileSync(sourcePath, destinationPath);

        // Relanzar la aplicación para que tome la nueva base de datos
        app.relaunch();
        app.exit(0);
        return { success: true };
    } catch (error) {
        console.error('Restore error:', error);
        return { success: false, message: 'Error al restaurar la base de datos: ' + error.message };
    }
});

ipcMain.handle('get-local-image-url', async (event, fileName) => {
    if (!fileName) return null;
    if (fileName.startsWith('data:image')) return fileName; // Return Base64 directly

    const filePath = path.join(thumbnailsPath, fileName);
    if (fs.existsSync(filePath)) {
        return `file://${filePath}`;
    }
    return null;
});

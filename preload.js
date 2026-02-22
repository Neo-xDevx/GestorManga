const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getMangas: (args) => ipcRenderer.invoke('get-mangas', args),
    getMangasCount: () => ipcRenderer.invoke('get-mangas-count'),
    getFavoritos: () => ipcRenderer.invoke('get-favoritos'),
    checkMangaExists: (titulo, titulo_secundario) => ipcRenderer.invoke('check-manga-exists', { titulo, titulo_secundario }),

    addManga: (manga) => ipcRenderer.invoke('add-manga', manga),
    deleteManga: (id) => ipcRenderer.invoke('delete-manga', id),
    toggleFavorito: (id, status) => ipcRenderer.invoke('toggle-favorito', { id, status }),
    updateManga: (id, manga) => ipcRenderer.invoke('update-manga', { id, manga }),
    // Genre APIs
    seed50: () => ipcRenderer.invoke('seed-50'),
    getGeneros: () => ipcRenderer.invoke('get-generos'),
    addGenero: (nombre) => ipcRenderer.invoke('add-genero', nombre),
    deleteGenero: (id) => ipcRenderer.invoke('delete-genero', id),
    getMangaGeneros: (mangaId) => ipcRenderer.invoke('get-manga-generos', mangaId),
    getCategorias: () => ipcRenderer.invoke('get-categorias'),
    addCategoria: (nombre) => ipcRenderer.invoke('add-categoria', nombre),
    deleteCategoria: (id) => ipcRenderer.invoke('delete-categoria', id),

    // Offline Images & OS interaction
    createBackup: () => ipcRenderer.invoke('create-backup'),
    openDirectory: (path) => ipcRenderer.invoke('open-directory', path),
    downloadImage: (url, id) => ipcRenderer.invoke('download-image', { url, id }),
    getLocalImageUrl: (fileName) => ipcRenderer.invoke('get-local-image-url', fileName)
});




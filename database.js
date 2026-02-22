const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'manhwadir.db');
const db = new Database(dbPath);

// Inicializar base de datos
const initDB = () => {
    const schema = `
        CREATE TABLE IF NOT EXISTS generos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        );


        CREATE TABLE IF NOT EXISTS mangas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            titulo_secundario TEXT,
            imagen TEXT,
            sinopsis TEXT,
            estado TEXT DEFAULT 'Emisión',
            capitulo_actual INTEGER DEFAULT 0,
            favorito INTEGER DEFAULT 0,
            categoria TEXT,
            enlace_web TEXT,
            enlace_web_alternativo TEXT,
            ruta_local TEXT,
            fecha_agregado DATETIME DEFAULT CURRENT_TIMESTAMP,

            fecha_capitulo_update DATETIME
        );



        CREATE TABLE IF NOT EXISTS manga_generos (
            id_manga INTEGER,
            id_genero INTEGER,
            PRIMARY KEY (id_manga, id_genero),
            FOREIGN KEY (id_manga) REFERENCES mangas(id) ON DELETE CASCADE,
            FOREIGN KEY (id_genero) REFERENCES generos(id) ON DELETE CASCADE
        );
    `;
    db.exec(schema);

    // Migraciones: Asegurar que las nuevas columnas existan en instalaciones previas
    const columns = db.prepare("PRAGMA table_info(mangas)").all();
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('titulo_secundario')) {
        db.exec("ALTER TABLE mangas ADD COLUMN titulo_secundario TEXT;");
    }
    if (!columnNames.includes('enlace_web')) {
        db.exec("ALTER TABLE mangas ADD COLUMN enlace_web TEXT;");
    }
    if (!columnNames.includes('fecha_capitulo_update')) {
        db.exec("ALTER TABLE mangas ADD COLUMN fecha_capitulo_update DATETIME;");
    }
    if (!columnNames.includes('imagen_local')) {
        db.exec("ALTER TABLE mangas ADD COLUMN imagen_local TEXT;");
    }
    if (!columnNames.includes('enlace_web_alternativo')) {
        db.exec("ALTER TABLE mangas ADD COLUMN enlace_web_alternativo TEXT;");
    }
    if (!columnNames.includes('ruta_local')) {
        db.exec("ALTER TABLE mangas ADD COLUMN ruta_local TEXT;");
    }


    // Crear índices para optimización
    db.exec("CREATE INDEX IF NOT EXISTS idx_manga_titulo ON mangas(titulo);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_manga_favorito ON mangas(favorito);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_manga_fecha_update ON mangas(fecha_capitulo_update);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_manga_estado ON mangas(estado);");

    // La columna id_genero es obsoleta con la nueva tabla manga_generos, pero la dejamos para no romper nada viejo.
    // Si la columna id_genero existe, la eliminamos para limpiar la tabla de mangas
    // Limpieza de columnas obsoletas (autor, id_genero)
    if (columnNames.includes('autor') || columnNames.includes('id_genero')) {
        db.transaction(() => {
            db.exec(`
                CREATE TABLE mangas_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    titulo TEXT NOT NULL,
                    titulo_secundario TEXT,
                    imagen TEXT,
                    sinopsis TEXT,
                    estado TEXT DEFAULT 'Emisión',
                    capitulo_actual INTEGER DEFAULT 0,
                    favorito INTEGER DEFAULT 0,
                    categoria TEXT,
                    enlace_web TEXT,
                    enlace_web_alternativo TEXT,
                    ruta_local TEXT,
                    fecha_agregado DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fecha_capitulo_update DATETIME
                );

            `);
            db.exec(`
                INSERT INTO mangas_new (id, titulo, titulo_secundario, imagen, sinopsis, estado, capitulo_actual, favorito, categoria, enlace_web, enlace_web_alternativo, ruta_local, fecha_agregado, fecha_capitulo_update)
                SELECT id, titulo, titulo_secundario, imagen, sinopsis, estado, capitulo_actual, favorito, categoria, enlace_web, enlace_web_alternativo, ruta_local, fecha_agregado, fecha_capitulo_update FROM mangas;
            `);


            db.exec("DROP TABLE mangas;");
            db.exec("ALTER TABLE mangas_new RENAME TO mangas;");
        })();
    }

    // Insertar categorías por defecto si está vacío
    const countCat = db.prepare('SELECT COUNT(*) as total FROM categorias').get().total;
    if (countCat === 0) {
        db.exec("INSERT INTO categorias (nombre) VALUES ('Manga'), ('Manhwa');");
    }
};



// Generos CRUD
const getGeneros = () => {
    return db.prepare('SELECT * FROM generos ORDER BY nombre ASC').all();
};

const addGenero = (nombre) => {
    // Si contiene comas, manejar como múltiples
    if (nombre.includes(',')) {
        const nombres = nombre.split(',').map(n => n.trim()).filter(n => n !== '');
        const stmt = db.prepare('INSERT OR IGNORE INTO generos (nombre) VALUES (?)');
        const transaction = db.transaction((names) => {
            for (const n of names) stmt.run(n);
        });
        return transaction(nombres);
    }
    return db.prepare('INSERT INTO generos (nombre) VALUES (?)').run(nombre);
};

const deleteGenero = (id) => {
    return db.prepare('DELETE FROM generos WHERE id = ?').run(id);
};

const getMangaGeneros = (mangaId) => {
    return db.prepare(`
        SELECT g.* FROM generos g
        JOIN manga_generos mg ON g.id = mg.id_genero
        WHERE mg.id_manga = ?
    `).all(mangaId);
};
// Categorias CRUD
const getCategorias = () => {
    return db.prepare('SELECT * FROM categorias ORDER BY nombre ASC').all();
};

const addCategoria = (nombre) => {
    return db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre);
};

const deleteCategoria = (id) => {
    return db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
};


// Funciones CRUD

const getMangas = (limit = 100, offset = 0, order = 'recent') => {
    let orderBy = 'm.id DESC';
    switch (order) {
        case 'oldest': orderBy = 'm.id ASC'; break;
        case 'az': orderBy = 'm.titulo COLLATE NOCASE ASC'; break;
        case 'za': orderBy = 'm.titulo COLLATE NOCASE DESC'; break;
        case 'recent': default: orderBy = 'm.fecha_agregado DESC'; break;
    }

    const stmt = db.prepare(`
        SELECT m.*, GROUP_CONCAT(g.id) as genero_ids
        FROM mangas m
        LEFT JOIN manga_generos mg ON m.id = mg.id_manga
        LEFT JOIN generos g ON mg.id_genero = g.id
        GROUP BY m.id
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
    `);
    const mangas = stmt.all(limit, offset);
    return mangas;
};


const getMangasCount = () => {
    const stmt = db.prepare('SELECT COUNT(*) as total FROM mangas');
    return stmt.get().total;
};

const getFavoritos = () => {
    return db.prepare(`
        SELECT m.*, GROUP_CONCAT(mg.id_genero) as genero_ids 
        FROM mangas m
        LEFT JOIN manga_generos mg ON m.id = mg.id_manga
        WHERE m.favorito = 1
        GROUP BY m.id
        ORDER BY m.fecha_agregado DESC
    `).all();
};

const checkMangaExists = (titulo, titulo_secundario) => {
    // Busca si hay algún manga con el mismo título o título secundario (ignorando mayúsculas/minúsculas)
    let query = 'SELECT id, titulo FROM mangas WHERE titulo COLLATE NOCASE = ?';
    let params = [titulo];

    if (titulo_secundario && titulo_secundario.trim() !== '') {
        query += ' OR titulo_secundario COLLATE NOCASE = ? OR titulo COLLATE NOCASE = ? OR titulo_secundario COLLATE NOCASE = ?';
        params.push(titulo_secundario, titulo_secundario, titulo);
    }

    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result || null;
};


const addManga = (manga) => {
    const { titulo, titulo_secundario, imagen, sinopsis, estado, capitulo_actual, favorito, id_generos, enlace_web, enlace_web_alternativo, ruta_local, categoria } = manga;

    const transaction = db.transaction(() => {
        const stmt = db.prepare(`
            INSERT INTO mangas (titulo, titulo_secundario, imagen, sinopsis, estado, capitulo_actual, favorito, enlace_web, enlace_web_alternativo, ruta_local, categoria)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(titulo, titulo_secundario, imagen, sinopsis, estado, capitulo_actual, favorito, enlace_web, enlace_web_alternativo || null, ruta_local || null, categoria);

        const mangaId = result.lastInsertRowid;


        if (id_generos && id_generos.length > 0) {
            const genreStmt = db.prepare('INSERT INTO manga_generos (id_manga, id_genero) VALUES (?, ?)');
            for (const gId of id_generos.slice(0, 4)) {
                genreStmt.run(mangaId, gId);
            }
        }
        return result;
    });

    return transaction();
};


const deleteManga = (id) => {
    return db.prepare('DELETE FROM mangas WHERE id = ?').run(id);
};

const toggleFavorito = (id, status) => {
    return db.prepare('UPDATE mangas SET favorito = ? WHERE id = ?').run(status ? 1 : 0, id);
};

const updateMangaLocalImage = (id, imagen_local) => {
    return db.prepare('UPDATE mangas SET imagen_local = ? WHERE id = ?').run(imagen_local, id);
};

const updateManga = (id, manga) => {
    const { titulo, titulo_secundario, imagen, imagen_local, sinopsis, estado, capitulo_actual, favorito, id_generos, enlace_web, enlace_web_alternativo, ruta_local, categoria } = manga;

    const transaction = db.transaction(() => {
        const existing = db.prepare('SELECT capitulo_actual FROM mangas WHERE id = ?').get(id);
        const chapterChanged = existing && existing.capitulo_actual !== parseInt(capitulo_actual);

        const stmt = db.prepare(`
            UPDATE mangas 
            SET titulo = ?, titulo_secundario = ?, imagen = ?, imagen_local = ?, sinopsis = ?, estado = ?, 
                capitulo_actual = ?, favorito = ?, enlace_web = ?, enlace_web_alternativo = ?, ruta_local = ?, categoria = ?
                ${chapterChanged ? ', fecha_capitulo_update = CURRENT_TIMESTAMP' : ''}
            WHERE id = ?
        `);
        const result = stmt.run(titulo, titulo_secundario, imagen, imagen_local, sinopsis, estado, capitulo_actual, favorito, enlace_web, enlace_web_alternativo || null, ruta_local || null, categoria, id);


        // Actualizar géneros
        db.prepare('DELETE FROM manga_generos WHERE id_manga = ?').run(id);
        if (id_generos && id_generos.length > 0) {
            const genreStmt = db.prepare('INSERT INTO manga_generos (id_manga, id_genero) VALUES (?, ?)');
            for (const gId of id_generos.slice(0, 4)) {
                genreStmt.run(id, gId);
            }
        }
        return result;
    });

    return transaction();
};




const seed50 = () => {
    // Asegurar que existan géneros básicos
    const existingGenres = db.prepare('SELECT id FROM generos').all();
    if (existingGenres.length === 0) {
        const basics = ['Acción', 'Aventura', 'Drama', 'Romance', 'Fantasía', 'Comedia', 'Horror', 'Slice of Life'];
        const insertGen = db.prepare('INSERT INTO generos (nombre) VALUES (?)');
        basics.forEach(g => insertGen.run(g));
    }

    const titles = ['Solo Leveling', 'TBATE', 'Tower of God', 'Sweet Home', 'Eleceed', 'Wind Breaker', 'Lookism', 'The Boxer'];
    const cats = ['Manhwa', 'Manga', 'Webtoon'];
    const stats = ['Emisión', 'Finalizado', 'Pausado'];
    const generos = db.prepare('SELECT id FROM generos').all();

    const stmt = db.prepare(`
        INSERT INTO mangas (titulo, titulo_secundario, imagen, sinopsis, estado, capitulo_actual, favorito, categoria, enlace_web_alternativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const genStmt = db.prepare('INSERT INTO manga_generos (id_manga, id_genero) VALUES (?, ?)');

    for (let i = 1; i <= 50; i++) {
        const t = titles[i % titles.length] + ' Test ' + i;
        const img = `https://picsum.photos/seed/${i + 500}/300/450`;
        const res = stmt.run(t, 'Sub ' + i, img, 'Test data ' + i, stats[i % 4], i * 2, 0, cats[i % 3], null);

        if (generos.length > 0) {
            // Asignar 1-2 géneros aleatorios
            genStmt.run(res.lastInsertRowid, generos[i % generos.length].id);
            if (i % 2 === 0) genStmt.run(res.lastInsertRowid, generos[(i + 1) % generos.length].id);
        }
    }
};

module.exports = {

    initDB,
    getMangas,
    getMangasCount,
    getFavoritos,
    checkMangaExists,
    addManga,
    deleteManga,
    toggleFavorito,
    updateMangaLocalImage,
    updateManga,
    getGeneros,
    addGenero,
    deleteGenero,
    getMangaGeneros,
    getCategorias,
    addCategoria,
    deleteCategoria,
    seed50
};


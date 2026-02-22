// DOM Elements
const sectionTitle = document.getElementById('section-title');
const contentView = document.getElementById('content-view');
const navItems = document.querySelectorAll('.nav-item');
const themeToggle = document.querySelector('.theme-switch');
const searchInput = document.getElementById('search-input');
const filtersContainer = document.getElementById('filters-container');
const filterStatus = document.getElementById('filter-status');
const filterGenre = document.getElementById('filter-genre');
const filterCategory = document.getElementById('filter-category');
const filterUpdates = document.getElementById('filter-updates');

const sortOrder = document.getElementById('sort-order');

// Initialize Toast Container
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

// Initialize Lucide Icons
lucide.createIcons();

// State
let currentSection = 'directorio';
let allMangasData = [];
let currentPage = 1;
const itemsPerPage = 24; // Reducido para mejor rendimiento con cards pequeñas
let totalMangas = 0;

// Cache para datos frecuentes
let cachedGeneros = null;
let cachedCategorias = null;

// Helper: Normalizar texto para búsqueda (eliminar acentos)
function normalizeText(text) {
    if (!text) return "";
    return text.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Helper: Comprobar si fue actualizado en las últimas 48 horas
function isRecentlyUpdated(dateString) {
    if (!dateString) return false;
    const updateDate = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - updateDate) / (1000 * 60 * 60);
    return diffInHours <= 48;
}

// Helper: Copiar al portapapeles
function copyToClipboard(text, label = "Contenido") {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${label} copiado al portapapeles`, 'success', 'copy');
    }).catch(err => {
        showToast('Error al copiar', 'error', 'alert-circle');
    });
}


// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const section = item.getAttribute('data-section');
        if (currentSection === section) return;
        switchSection(section);
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
    });
});

// Theme Toggle Logic
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    const icon = themeToggle.querySelector('i');

    if (isLight) {
        icon.setAttribute('data-lucide', 'sun');
    } else {
        icon.setAttribute('data-lucide', 'moon');
    }
    lucide.createIcons();
    showToast(`Modo ${isLight ? 'Claro' : 'Oscuro'} activado`, 'info', isLight ? 'sun' : 'moon');
});

// Backup Database Logic
const btnBackup = document.getElementById('btn-backup');
if (btnBackup) {
    btnBackup.addEventListener('click', async () => {
        try {
            const result = await window.api.createBackup();
            if (result.success) {
                showToast(result.message, 'success', 'database-backup');
            } else if (result.message !== 'Operación cancelada') {
                showToast(result.message, 'error', 'alert-circle');
            }
        } catch (error) {
            showToast('Error de sistema al respaldar', 'error', 'alert-circle');
        }
    });
}

// Advanced Filter/Search Logic
async function applyFilters() {
    const query = normalizeText(searchInput.value);
    const status = filterStatus.value;
    const genreId = filterGenre.value;
    const category = filterCategory.value;
    const updateFilter = filterUpdates ? filterUpdates.value : 'all';
    const order = sortOrder.value;

    // Si es el directorio
    if (currentSection === 'directorio') {
        // Obtenemos el totalSIEMPRE
        totalMangas = await window.api.getMangasCount();

        // Si hay una búsqueda o filtro activo, ignoramos la paginación y traemos todo
        // Limit -1 en sqlite significa sin límite (o un número muy grande)
        if (query || status !== 'all' || genreId !== 'all' || category !== 'all' || updateFilter !== 'all') {
            const allRecords = await window.api.getMangas({ limit: 10000, offset: 0, order: order });
            allMangasData = allRecords;
        } else {
            // Sin filtros, aplicamos paginación normal
            const offset = (currentPage - 1) * itemsPerPage;
            allMangasData = await window.api.getMangas({ limit: itemsPerPage, offset: offset, order: order });
        }
    } else if (currentSection === 'favoritos') {
        allMangasData = await window.api.getFavoritos();
    }

    let filtered = allMangasData.filter(m => {
        const matchesSearch = normalizeText(m.titulo).includes(query) ||
            normalizeText(m.titulo_secundario).includes(query);

        const matchesStatus = status === 'all' || m.estado === status;
        const matchesCategory = category === 'all' || m.categoria === category;

        let matchesUpdates = true;
        if (updateFilter === 'actualizados') {
            matchesUpdates = isRecentlyUpdated(m.fecha_capitulo_update);
        }

        // Filtro de Género
        let matchesGenre = true;
        if (genreId !== 'all') {
            const mGenreIds = m.genero_ids ? m.genero_ids.split(',').map(id => id.trim()) : [];
            matchesGenre = mGenreIds.includes(genreId);
        }

        return matchesSearch && matchesStatus && matchesGenre && matchesUpdates && matchesCategory;
    });

    // Ordenamiento (Solo para filtrados locales o favoritos, ya que el directorio viene ordenado de base)
    if (currentSection !== 'directorio') {
        filtered.sort((a, b) => {
            if (order === 'recent') return b.id - a.id;
            if (order === 'oldest') return a.id - b.id;
            if (order === 'az') return a.titulo.localeCompare(b.titulo);
            if (order === 'za') return b.titulo.localeCompare(a.titulo);
            return 0;
        });
    }

    renderMangaList(filtered, false);
}

// Event Listeners for Filters
if (searchInput) searchInput.addEventListener('input', applyFilters);
if (filterStatus) filterStatus.addEventListener('change', applyFilters);
if (filterGenre) filterGenre.addEventListener('change', applyFilters);
if (filterCategory) filterCategory.addEventListener('change', applyFilters);
if (filterUpdates) filterUpdates.addEventListener('change', applyFilters);
if (sortOrder) sortOrder.addEventListener('change', applyFilters);


async function switchSection(section) {
    currentSection = section;
    contentView.style.opacity = '0';
    currentPage = 1;

    // Mostrar/ocultar filtros según sección
    filtersContainer.style.display = (section === 'directorio' || section === 'favoritos') ? 'flex' : 'none';

    // Cargar datos en cache si es necesario
    if (!cachedGeneros || !cachedCategorias) {
        [cachedGeneros, cachedCategorias] = await Promise.all([
            window.api.getGeneros(),
            window.api.getCategorias()
        ]);
    }

    // Actualizar selectores de filtros con cache
    filterGenre.innerHTML = '<option value="all">Todos los Géneros</option>' +
        cachedGeneros.map(g => `<option value="${g.id}">${g.nombre}</option>`).join('');

    filterCategory.innerHTML = '<option value="all">Todas las Categorías</option>' +
        cachedCategorias.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');

    switch (section) {
        case 'directorio':
            sectionTitle.innerText = 'Colección de Mangas';
            renderSkeletonGrid();
            await applyFilters();
            break;
        case 'favoritos':
            sectionTitle.innerText = 'Favoritos';
            renderSkeletonGrid();
            await applyFilters();
            break;
        case 'agregar':
            sectionTitle.innerText = 'Agregar Nuevo Manga';
            renderAddForm();
            break;
        case 'generos':
            sectionTitle.innerText = 'Gestión de Géneros';
            renderGenreSection();
            break;
        case 'categorias':
            sectionTitle.innerText = 'Gestión de Categorías';
            renderCategorySection();
            break;
    }

    requestAnimationFrame(() => {
        contentView.style.transform = 'translateY(0)';
        contentView.style.opacity = '1';
    });
}


// Rendering Functions
function renderSkeletonGrid() {
    contentView.innerHTML = `
    <div class="manga-grid">
        ${Array(12).fill('<div class="skeleton skeleton-card"></div>').join('')}
    </div>
    `;
}

async function renderMangaList(mangas, animate = true) {
    if (mangas.length === 0) {
        contentView.innerHTML = `
        <div class="loading-state">
            <i data-lucide="info" style="width: 48px; height: 48px; margin-bottom: 20px;"></i>
            <p>No se encontraron mangas.</p>
        </div>`;
        lucide.createIcons();
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'manga-grid';

    for (const [index, manga] of mangas.entries()) {
        const isNew = isRecentlyUpdated(manga.fecha_capitulo_update);
        const card = document.createElement('div');
        card.className = 'manga-card';
        card.id = `manga-card-${manga.id}`;

        if (animate) {
            card.style.animationDelay = `${index * 0.05}s`;
        } else {
            card.style.animation = 'none';
            card.style.opacity = '1';
        }

        // Obtener URL de imagen (priorizar local para offline)
        let displayImage = manga.imagen || 'https://via.placeholder.com/200x300?text=Sin+Portada';
        if (manga.imagen_local) {
            const localUrl = await window.api.getLocalImageUrl(manga.imagen_local);
            if (localUrl) displayImage = localUrl;
        }

        card.innerHTML = `
        ${isNew ? '<div class="up-badge">UP</div>' : ''}
        <div class="fav-badge" onclick="event.stopPropagation(); toggleFav(${manga.id}, ${manga.favorito})">
            <i data-lucide="heart" class="heart-icon" style="${manga.favorito ? 'fill: #ff4757; color: #ff4757;' : 'color: white;'}"></i>
        </div>
        <div class="card-options-btn" onclick="event.stopPropagation(); showContextMenu(event, ${JSON.stringify(manga).replace(/"/g, '&quot;')})">
            <i data-lucide="more-vertical"></i>
        </div>
        <div class="manga-image-container">
            <img src="${displayImage}" class="manga-image" alt="${manga.titulo}" onerror="this.src='https://via.placeholder.com/300x450?text=Error+Carga'">
        </div>
        <div class="manga-info">
            <h3 class="manga-title">${manga.titulo}</h3>
        </div>
    `;


        card.addEventListener('click', () => showDetails(manga));
        grid.appendChild(card);
    }

    contentView.innerHTML = '';
    contentView.appendChild(grid);

    // Añadir controles de paginación si estamos en el directorio
    if (currentSection === 'directorio' && totalMangas > itemsPerPage) {
        const totalPages = Math.ceil(totalMangas / itemsPerPage);
        const pagination = document.createElement('div');
        pagination.className = 'pagination-container';
        pagination.innerHTML = `
            <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} id="prev-page">
                <i data-lucide="chevron-left"></i> Anterior
            </button>
            <span class="page-info">Página ${currentPage} de ${totalPages}</span>
            <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} id="next-page">
                Siguiente <i data-lucide="chevron-right"></i>
            </button>
        `;
        contentView.appendChild(pagination);

        document.getElementById('prev-page')?.addEventListener('click', () => {
            currentPage--;
            applyFilters();
            grid.scrollIntoView({ behavior: 'smooth' });
        });
        document.getElementById('next-page')?.addEventListener('click', () => {
            currentPage++;
            applyFilters();
            grid.scrollIntoView({ behavior: 'smooth' });
        });
    }

    lucide.createIcons();
}

// Toast Function
function showToast(message, type = 'success', iconName = 'check-circle') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s ease-in reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function renderAddForm(editManga = null) {
    const isEdit = !!editManga;

    // Cargar datos en cache si es necesario
    if (!cachedGeneros || !cachedCategorias) {
        [cachedGeneros, cachedCategorias] = await Promise.all([
            window.api.getGeneros(),
            window.api.getCategorias()
        ]);
    }

    const activeGeneros = isEdit ? (await window.api.getMangaGeneros(editManga.id)).map(g => g.id) : [];

    contentView.innerHTML = `
    <div class="form-container" style="max-width: 750px; margin: 0 auto;">

        <h2 style="margin-bottom: 30px; font-weight: 700; color: #fff; border-bottom: 2px solid var(--accent-color); display: inline-block; padding-bottom: 8px;">${isEdit ? 'Editar Manga' : 'Añadir Nuevo Manga'}</h2>
        
        <form id="manga-form">
            <!-- Sección: Títulos -->
            <div class="form-group">
                <label>Título Principal</label>
                <input type="text" id="title" required value="${isEdit ? editManga.titulo : ''}" placeholder="Escribe el título aquí...">
            </div>
            <div class="form-group">
                <label>Título Secundario</label>
                <input type="text" id="sec-title" value="${isEdit ? (editManga.titulo_secundario || '') : ''}" placeholder="Escribe el título alternativo aquí...">
            </div>
            
            <div style="display: flex; align-items: center; gap: 10px; margin-top: -10px; margin-bottom: 25px;">
                <button type="button" id="check-exists-btn" style="padding: 8px 15px; font-size: 0.85rem; display: flex; align-items: center; gap: 5px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); color: #fff; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                    <i data-lucide="search" style="width: 14px; height: 14px;"></i> Comprobar Disponibilidad
                </button>
                <span id="check-result-msg" style="font-size: 0.85rem; font-weight: 500;"></span>
            </div>

            <div class="form-divider"></div>

            <!-- Sección: Metadatos -->
            <div class="form-row" style="display: flex; gap: 20px;">
                <div class="form-group" style="flex: 1;">
                    <label>Estado</label>
                    <select id="status">
                        <option value="Emisión" ${isEdit && editManga.estado === 'Emisión' ? 'selected' : ''}>Emisión</option>
                        <option value="Finalizado" ${isEdit && editManga.estado === 'Finalizado' ? 'selected' : ''}>Finalizado</option>
                        <option value="Pausado" ${isEdit && editManga.estado === 'Pausado' ? 'selected' : ''}>Pausado</option>
                        <option value="Cancelado" ${isEdit && editManga.estado === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Capítulos</label>
                    <div class="chapter-control-premium" style="display: flex; gap: 5px; background: rgba(0,0,0,0.2); border-radius: 12px; padding: 0 5px; border: 1px solid var(--border-color); height: 48px; width: 140px;">
                        <button type="button" class="chapter-btn" id="chapter-minus" style="background: transparent; border: none; color: #fff; cursor: pointer; padding: 0; width: 35px; height: 100%; font-size: 1.4rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">-</button>
                        <input type="number" id="chapter" value="${isEdit ? editManga.capitulo_actual : '0'}" style="flex: 1; border: none; background: transparent; text-align: center; color: #fff; font-weight: 700; font-size: 1.1rem; width: 50px; padding: 0; outline: none;">
                        <button type="button" class="chapter-btn" id="chapter-plus" style="background: transparent; border: none; color: #fff; cursor: pointer; padding: 0; width: 35px; height: 100%; font-size: 1.4rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">+</button>
                    </div>
                </div>


                <div class="form-group" style="flex: 1;">
                    <label>Categoría</label>
                    <select id="category">
                        ${cachedCategorias.map(c => `
                            <option value="${c.nombre}" ${isEdit && editManga.categoria === c.nombre ? 'selected' : ''}>${c.nombre}</option>
                        `).join('')}
                    </select>
                </div>
            </div>


            <div class="form-divider"></div>

            <!-- Sección: Géneros -->
            <label class="form-label" style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 12px; letter-spacing: 1px;">Géneros (Máximo 5)</label>
            <div class="genre-selector-premium" id="genre-chip-container" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                ${cachedGeneros.map(g => `
                    <div class="genre-chip-premium ${activeGeneros.includes(g.id) ? 'selected' : ''}" data-id="${g.id}">
                        <i data-lucide="${activeGeneros.includes(g.id) ? 'check' : 'plus'}"></i>
                        <span>${g.nombre}</span>
                        <input type="checkbox" name="genres" value="${g.id}" ${activeGeneros.includes(g.id) ? 'checked' : ''} style="display:none;">
                    </div>
                `).join('')}
            </div>
            <div class="genre-counter" id="genre-count-label" style="font-size: 0.8rem; color: var(--accent-color); font-weight: 500; margin-bottom: 30px;">Seleccionados: ${activeGeneros.length}/5</div>

            <div class="form-divider"></div>

            <!-- Sección: Enlaces y Multimedia -->
            <div class="form-group">
                <label>URL Portada</label>
                <input type="url" id="image" value="${isEdit ? (editManga.imagen || '') : ''}" placeholder="https://ejemplo.com/imagen.jpg">
            </div>
            <div class="form-group">
                <label>Enlace Web (Principal)</label>
                <input type="url" id="weblink" value="${isEdit ? (editManga.enlace_web || '') : ''}" placeholder="https://mangaplus.com/...">
            </div>
            <div class="form-group">
                <label>Enlace Web (Alternativo)</label>
                <input type="url" id="weblink-alt" value="${isEdit ? (editManga.enlace_web_alternativo || '') : ''}" placeholder="https://lectormanga.com/...">
            </div>
            <div class="form-group">
                <label>Ruta Local del Directorio</label>
                <input type="text" id="ruta-local" value="${isEdit ? (editManga.ruta_local || '') : ''}" placeholder="Ejemplo: D:\\Mangas\\Solo Leveling">
                <small style="color: var(--text-secondary); font-size: 0.75rem; margin-top: 5px; display: block;">Ruta exacta a la carpeta del manga (Ej: D:\\Mangas\\Solo Leveling)</small>
            </div>

            <div class="form-divider"></div>

            <!-- Sección: Sinopsis -->
            <div class="form-group">
                <label>Sinopsis</label>
                <textarea id="sinopsis" rows="6" placeholder="Escribe un breve resumen de la historia...">${isEdit ? (editManga.sinopsis || '') : ''}</textarea>
            </div>

            <div style="display: flex; gap: 15px; margin-top: 40px; border-top: 1px solid var(--border-color); padding-top: 25px;">
                <button type="submit" class="btn-primary" style="flex: 2; height: 50px;">
                    <i data-lucide="${isEdit ? 'save' : 'plus-circle'}" style="margin-right: 8px; width: 18px;"></i>
                    ${isEdit ? 'Guardar Cambios' : 'Registrar Manga'}
                </button>
                <button type="button" class="btn-secondary" style="flex: 1; height: 50px;" onclick="switchSection('directorio')">
                    Cancelar
                </button>
            </div>
        </form>
    </div>
    `;

    // Lógica Interactiva de Chips
    const chips = document.querySelectorAll('.genre-chip-premium');
    const label = document.getElementById('genre-count-label');

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const checkbox = chip.querySelector('input');
            const currentIcon = chip.querySelector('[data-lucide]');
            const selectedCount = document.querySelectorAll('input[name="genres"]:checked').length;

            if (!checkbox.checked && selectedCount >= 5) {
                showToast('Máximo 5 géneros permitidos', 'error', 'alert-circle');
                return;
            }

            // Invertir el estado (marcado/desmarcado)
            checkbox.checked = !checkbox.checked;
            chip.classList.toggle('selected', checkbox.checked);

            if (currentIcon) {
                const newIcon = document.createElement('i');
                newIcon.setAttribute('data-lucide', checkbox.checked ? 'check' : 'plus');
                currentIcon.replaceWith(newIcon);
            }

            lucide.createIcons();

            const newCount = document.querySelectorAll('input[name="genres"]:checked').length;
            label.innerText = `Seleccionados: ${newCount}/5`;
        });
    });

    // Controles de Capítulo
    document.getElementById('chapter-plus').onclick = () => document.getElementById('chapter').value++;
    document.getElementById('chapter-minus').onclick = () => {
        const input = document.getElementById('chapter');
        if (input.value > 0) input.value--;
    };

    // Comprobar disponibilidad
    document.getElementById('check-exists-btn').addEventListener('click', async () => {
        const titleInput = document.getElementById('title').value;
        const secTitleInput = document.getElementById('sec-title').value;
        const msgSpan = document.getElementById('check-result-msg');

        if (!titleInput.trim() && !secTitleInput.trim()) {
            msgSpan.textContent = 'Ingresa un título primero';
            msgSpan.style.color = '#ff4757';
            return;
        }

        msgSpan.textContent = 'Comprobando...';
        msgSpan.style.color = 'var(--text-secondary)';

        try {
            const exists = await window.api.checkMangaExists(titleInput, secTitleInput);
            if (exists && (!isEdit || exists.id !== editManga.id)) {
                msgSpan.textContent = `⚠️ Ya registrado como: "${exists.titulo}"`;
                msgSpan.style.color = '#ff4757';
                showToast('Manga ya registrado', 'error', 'alert-circle');
            } else {
                msgSpan.textContent = '✅ Disponible';
                msgSpan.style.color = '#2ed573';
            }
        } catch (error) {
            console.error(error);
            msgSpan.textContent = 'Error al comprobar';
            msgSpan.style.color = '#ff4757';
        }
    });

    document.getElementById('manga-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        let rutaLocalInput = document.getElementById('ruta-local').value.trim();
        const tituloSeguro = document.getElementById('title').value.replace(/[<>:"/\\|?*]+/g, '').trim();

        if (rutaLocalInput) {
            rutaLocalInput = rutaLocalInput.replace(/\//g, '\\');
        }

        const mangaData = {
            titulo: document.getElementById('title').value,
            titulo_secundario: document.getElementById('sec-title').value,
            estado: document.getElementById('status').value,
            id_generos: Array.from(document.querySelectorAll('input[name="genres"]:checked')).map(cb => parseInt(cb.value)),
            capitulo_actual: parseInt(document.getElementById('chapter').value),
            categoria: document.getElementById('category').value,
            imagen: document.getElementById('image').value,
            imagen_local: isEdit ? editManga.imagen_local : null,
            enlace_web: document.getElementById('weblink').value,
            enlace_web_alternativo: document.getElementById('weblink-alt').value,
            ruta_local: rutaLocalInput,
            sinopsis: document.getElementById('sinopsis').value,
            favorito: isEdit ? editManga.favorito : 0
        };

        if (isEdit) {
            await window.api.updateManga(editManga.id, mangaData);
            if (mangaData.imagen && mangaData.imagen !== editManga.imagen) {
                const localName = await window.api.downloadImage(mangaData.imagen, editManga.id);
                if (localName) await window.api.updateManga(editManga.id, { ...mangaData, imagen_local: localName });
            }
            showToast('Manga actualizado correctamente');
            switchSection('directorio');
        } else {
            const result = await window.api.addManga(mangaData);
            const mangaId = result.lastInsertRowid || result.id || result;
            if (mangaId && mangaData.imagen) {
                const localName = await window.api.downloadImage(mangaData.imagen, mangaId);
                if (localName) await window.api.updateManga(mangaId, { ...mangaData, imagen_local: localName });
            }
            showToast(`"${mangaData.titulo}" añadido correctamente`, 'success', 'check');
            renderAddForm();
        }
    });
}

async function renderCategorySection() {
    if (!cachedCategorias) cachedCategorias = await window.api.getCategorias();

    contentView.innerHTML = `
    <div class="form-container" style="max-width: 750px; margin: 0 auto; padding: 40px;">
        <h2 style="margin-bottom: 30px; font-weight: 700; color: #fff; border-bottom: 2px solid var(--accent-color); display: inline-block; padding-bottom: 8px;">Gestionar Categorías</h2>
        
        <div class="form-section">
            <h3 style="margin-bottom: 10px; font-size: 1.1rem; color: #fff;">Añadir Categoría</h3>
            <form id="add-category-form" style="display: flex; gap: 15px; align-items: center;">
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <input type="text" id="new-category-name" placeholder="Ej: Manga, Manhwa, Webtoon..." required style="height: 50px;">
                </div>
                <button type="submit" class="btn-primary" style="padding: 0 25px; height: 50px;">
                    <i data-lucide="plus" style="margin-right: 8px; width: 18px;"></i>
                    Añadir
                </button>
            </form>
        </div>
        
        <div class="form-divider"></div>
        
        <div class="form-section">
            <h3 style="margin-bottom: 20px; font-size: 1.1rem; color: #fff;">Categorías Existentes</h3>
            <div class="category-grid" style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${cachedCategorias.map(c => `
                    <div class="genre-tag" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 10px 18px; border-radius: 12px; display: flex; align-items: center; gap: 12px; transition: all 0.2s ease;">
                        <span class="genre-name" style="font-weight: 500; font-size: 0.9rem;">${c.nombre}</span>
                        <i data-lucide="x" class="category-delete" onclick="deleteCategory(${c.id})" style="width: 14px; color: #ff4757; cursor: pointer; opacity: 0.7;"></i>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
    `;
    lucide.createIcons();

    document.getElementById('add-category-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-category-name').value;
        await window.api.addCategoria(name);
        cachedCategorias = null; // Invalidar cache
        showToast(`Categoría "${name}" añadida`, 'success', 'folder');
        renderCategorySection();
    });
}

async function deleteCategory(id) {
    if (confirm('¿Eliminar esta categoría?')) {
        await window.api.deleteCategoria(id);
        cachedCategorias = null; // Invalidar cache
        showToast('Categoría eliminada', 'info', 'trash-2');
        renderCategorySection();
    }
}

async function renderGenreSection() {
    if (!cachedGeneros) cachedGeneros = await window.api.getGeneros();

    contentView.innerHTML = `
    <div class="form-container" style="max-width: 750px; margin: 0 auto; padding: 40px;">
        <h2 style="margin-bottom: 30px; font-weight: 700; color: #fff; border-bottom: 2px solid var(--accent-color); display: inline-block; padding-bottom: 8px;">Gestionar Géneros</h2>
        
        <div class="form-section">
            <h3 style="margin-bottom: 10px; font-size: 1.1rem; color: #fff;">Añadir Géneros</h3>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 20px; opacity: 0.8;">
                Escribe uno o varios géneros separados por coma.
            </p>
            <form id="add-genre-form" style="display: flex; gap: 15px; align-items: center;">
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <input type="text" id="new-genre-name" placeholder="Ej: Acción, Romance..." required style="height: 50px;">
                </div>
                <button type="submit" class="btn-primary" style="padding: 0 25px; height: 50px;">
                    <i data-lucide="plus" style="margin-right: 8px; width: 18px;"></i>
                    Añadir
                </button>
            </form>
        </div>
        
        <div class="form-divider"></div>
        
        <div class="form-section">
            <h3 style="margin-bottom: 20px; font-size: 1.1rem; color: #fff;">Géneros Existentes</h3>
            <div class="genre-grid" style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${cachedGeneros.map(g => `
                    <div class="genre-tag" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 10px 18px; border-radius: 12px; display: flex; align-items: center; gap: 12px; transition: all 0.2s ease;">
                        <span class="genre-name" style="font-weight: 500; font-size: 0.9rem;">${g.nombre}</span>
                        <i data-lucide="x" class="genre-delete" onclick="deleteGenre(${g.id})" style="width: 14px; color: #ff4757; cursor: pointer; opacity: 0.7;"></i>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
    `;
    lucide.createIcons();

    document.getElementById('add-genre-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-genre-name').value;
        await window.api.addGenero(name);
        cachedGeneros = null; // Invalidar cache
        showToast(name.includes(',') ? 'Géneros añadidos' : `Género "${name}" añadido`, 'success', 'tag');
        renderGenreSection();
    });
}

async function deleteGenre(id) {
    if (confirm('¿Eliminar este género?')) {
        await window.api.deleteGenero(id);
        cachedGeneros = null; // Invalidar cache
        showToast('Género eliminado', 'info', 'trash-2');
        renderGenreSection();
    }
}

async function showDetails(manga) {
    const mangaGeneros = await window.api.getMangaGeneros(manga.id);
    const statusClass = `status-${normalizeText(manga.estado)}`;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // Imagen prioritaria local
    let displayImage = manga.imagen || 'https://via.placeholder.com/200x300?text=Sin+Portada';
    if (manga.imagen_local) {
        const localUrl = await window.api.getLocalImageUrl(manga.imagen_local);
        if (localUrl) displayImage = localUrl;
    }

    overlay.innerHTML = `
    <div class="modal-content-premium">
        <div class="modal-body-premium">
            <div class="modal-sidebar-premium">
                <img src="${displayImage}" class="modal-image-premium" onerror="this.src='https://via.placeholder.com/300x450?text=Error+Carga'">
                <div class="modal-actions-premium">
                    ${manga.enlace_web ? `
                    <button class="premium-btn-link" onclick="${/^[a-zA-Z]:\\/.test(manga.enlace_web) ? `window.api.openDirectory('${manga.enlace_web.replace(/\\/g, '\\\\')}')` : `copyToClipboard('${manga.enlace_web}', 'Enlace Principal')`}" style="border:none; cursor:pointer; width:100%;">
                        <i data-lucide="${/^[a-zA-Z]:\\/.test(manga.enlace_web) ? 'folder-open' : 'copy'}"></i>
                        <span>${/^[a-zA-Z]:\\/.test(manga.enlace_web) ? 'Abrir Directorio' : 'Copiar Link'}</span>
                    </button>` : ''}
                    ${manga.enlace_web_alternativo ? `
                    <button class="premium-btn-link secondary" onclick="${/^[a-zA-Z]:\\/.test(manga.enlace_web_alternativo) ? `window.api.openDirectory('${manga.enlace_web_alternativo.replace(/\\/g, '\\\\')}')` : `copyToClipboard('${manga.enlace_web_alternativo}', 'Enlace Alt')`}" style="border:none; cursor:pointer; width:100%; color: white;">
                        <i data-lucide="${/^[a-zA-Z]:\\/.test(manga.enlace_web_alternativo) ? 'folder-open' : 'link'}"></i>
                        <span>${/^[a-zA-Z]:\\/.test(manga.enlace_web_alternativo) ? 'Abrir Directorio' : 'Copiar Alt'}</span>
                    </button>` : ''}
                    ${manga.ruta_local ? `
                    <button class="premium-btn-link" onclick="window.api.openDirectory('${manga.ruta_local.replace(/\\/g, '\\\\')}')" style="border:none; cursor:pointer; width:100%; color: white; background: rgba(46, 213, 115, 0.2);">
                        <i data-lucide="folder-open"></i>
                        <span>Abrir Ruta Local</span>
                    </button>` : ''}
                </div>

            </div>
            
            <div class="modal-main-premium">
                <div class="modal-header-premium">
                    ${isRecentlyUpdated(manga.fecha_capitulo_update) ? `
                    <span class="premium-update-badge">
                        <i data-lucide="zap"></i> ACTUALIZADO RECIENTEMENTE
                    </span>` : ''}
                    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 25px;">
                        <h2 class="premium-modal-title" style="margin:0;">${manga.titulo}</h2>
                        <span class="copy-icon-btn" title="Copiar Título" onclick="copyToClipboard('${manga.titulo.replace(/'/g, "\\'")}', 'Título')">
                            <i data-lucide="copy" style="width:14px;"></i>
                        </span>
                    </div>
                    <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 25px;">
                        <h4 class="premium-modal-subtitle" style="margin:0;">${manga.titulo_secundario || ''}</h4>
                        ${manga.titulo_secundario ? `
                        <span class="copy-icon-btn" title="Copiar Título Secundario" onclick="copyToClipboard('${manga.titulo_secundario.replace(/'/g, "\\'")}', 'Título Sec.')">
                            <i data-lucide="copy" style="width:14px;"></i>
                        </span>` : ''}
                    </div>
                </div>

                
                <div class="premium-stats-grid">
                    <div class="premium-stat-card">
                        <span class="stat-label">Estado</span>
                        <span class="status-badge ${statusClass}">${manga.estado}</span>
                    </div>
                    <div class="premium-stat-card">
                        <span class="stat-label">Capítulos</span>
                        <span class="stat-value">${manga.capitulo_actual}</span>
                    </div>
                    <div class="premium-stat-card">
                        <span class="stat-label">Categoría</span>
                        <span class="premium-category-tag">${manga.categoria || 'Manga'}</span>
                    </div>
                    <div class="premium-stat-card full-width">
                        <span class="stat-label">Géneros</span>
                        <div class="premium-genre-list">
                            ${mangaGeneros.length > 0 ?
            mangaGeneros.map(g => `<span>${g.nombre}</span>`).join('') :
            '<span class="empty">Sin géneros asignados</span>'}
                        </div>
                    </div>
                </div>

                <div class="premium-synopsis-container">
                    <span class="stat-label">Sinopsis</span>
                    <p class="premium-synopsis-text">${manga.sinopsis || 'No hay sinopsis disponible para este título.'}</p>
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.appendChild(overlay);
    lucide.createIcons();
}

function showContextMenu(e, manga) {
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="menu-item" onclick="sectionTitle.innerText='Editar Manga'; renderAddForm(${JSON.stringify(manga).replace(/"/g, '&quot;')})">
            <i data-lucide="edit-3" style="width: 16px;"></i><span>Editar</span>
        </div>
        <div class="menu-item delete" onclick="deleteManga(${manga.id})">
            <i data-lucide="trash-2" style="width: 16px;"></i><span>Eliminar</span>
        </div>
    `;
    document.body.appendChild(menu);
    lucide.createIcons();
    const x = Math.min(e.clientX, window.innerWidth - 170);
    menu.style.left = `${x}px`;
    menu.style.top = `${e.clientY}px`;
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

async function toggleFav(id, currentStatus) {
    const newStatus = !currentStatus;
    await window.api.toggleFavorito(id, newStatus);
    const card = document.getElementById(`manga-card-${id}`);
    if (card) {
        const heartIcon = card.querySelector('.heart-icon');
        if (heartIcon) {
            heartIcon.style.fill = newStatus ? '#ff4757' : 'none';
            heartIcon.style.color = newStatus ? '#ff4757' : 'white';
        }
        const badge = card.querySelector('.fav-badge');
        badge.setAttribute('onclick', `event.stopPropagation(); toggleFav(${id}, ${newStatus})`);
        if (currentSection === 'favoritos' && !newStatus) {
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
        }
    }
    showToast(`${newStatus ? 'Añadido a' : 'Eliminado de'} favoritos`, 'info', 'heart');
}

async function deleteManga(id) {
    if (confirm('¿Eliminar manga?')) {
        await window.api.deleteManga(id);
        showToast('Manga eliminado correctamente', 'info', 'trash-2');
        switchSection(currentSection);
    }
}

// Modified to remove auto-seed so the database is completely clean

switchSection('directorio');

// ==========================================================================
// RETROGROOVE - APLICACIÓN PRINCIPAL (TABLET VINYL EXPERIENCE)
// ==========================================================================

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

class VinylApp {
  constructor() {
    this.vinyls = [];
    this.filteredVinyls = [];
    this.settings = {};
    this.currentGenre = 'all';
    this.searchQuery = '';
    this.sortBy = 'featured';
    this.filterFormat = 'all';
    this.onlyInStock = false;
    this.viewMode = 'grid'; // 'grid' | 'list'
    this.currentDetailVinylId = null;
    this.isVinylSpinning = false;
    this.isSheetSyncing = false;
  }

  async init() {
    // Inicializar IndexedDB
    await DB.init();
    this.settings = await DB.getSettings();
    this.applyStoreSettings(this.settings);

    // Inicializar iconos y bindings
    this.bindDOMEvents();
    // Cargar y mostrar datos
    await this.loadAndRender();
    this.syncSheetCatalog();
    window.setInterval(() => {
      this.syncSheetCatalog(undefined, { silent: true });
    }, 5 * 60 * 1000);
    window.addEventListener('online', () => {
      this.syncSheetCatalog(undefined, { silent: true });
    });

    // Registrar Service Worker para soporte PWA si está en producción
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  applyStoreSettings(settings) {
    this.settings = settings;
    const storeTitleEl = document.getElementById('storeBrandTitle');
    const storeSubEl = document.getElementById('storeBrandSubtitle');
    if (storeTitleEl) storeTitleEl.textContent = settings.storeName || 'RETROGROOVE';
    if (storeSubEl) storeSubEl.textContent = settings.storeSubtitle || 'Catálogo de Vinilos';
  }

  async loadAndRender() {
    this.vinyls = (await DB.getAllVinyls()).filter(vinyl => vinyl.sku);
    this.updateStats();
    this.renderGenrePills();
    this.applyFilters();
  }

  async syncSheetCatalog(sheetUrl = this.settings.sheetUrl, { silent = false } = {}) {
    if (this.isSheetSyncing) return false;
    this.isSheetSyncing = true;
    const status = document.getElementById('sheetSyncStatus');
    if (status) status.textContent = 'Sincronizando con Google Sheets…';
    try {
      const count = await DB.syncFromGoogleSheet(sheetUrl);
      this.settings.sheetUrl = sheetUrl;
      await this.loadAndRender();
      const syncedAt = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      if (status) status.textContent = `Actualizado: ${syncedAt} · ${count} productos`;
      if (!silent) showToast(`Catálogo actualizado: ${count} productos de Google Sheets`, 'success');
      return true;
    } catch (err) {
      if (status) status.textContent = `No se pudo actualizar: ${err.message}`;
      if (!silent) showToast(`No se pudo actualizar el catálogo: ${err.message}`, 'error');
      return false;
    } finally {
      this.isSheetSyncing = false;
    }
  }

  updateStats() {
    const totalCountEl = document.getElementById('headerTotalCount');
    const inStockCountEl = document.getElementById('headerInStockCount');
    if (totalCountEl) totalCountEl.textContent = this.vinyls.length;
    if (inStockCountEl) {
      const inStock = this.vinyls.filter(v => v.stock > 0).length;
      inStockCountEl.textContent = inStock;
    }
  }

  // ==========================================================================
  // FILTRADO Y BÚSQUEDA
  // ==========================================================================
  renderGenrePills() {
    const container = document.getElementById('genreScrollContainer');
    if (!container) return;

    // Calcular géneros únicos y su conteo
    const genreCounts = {};
    this.vinyls.forEach(v => {
      const g = v.genre || 'Otros';
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    });

    const genres = Object.keys(genreCounts).sort();

    let html = `
      <button type="button" class="genre-pill ${this.currentGenre === 'all' ? 'active' : ''}" data-genre="all">
        <span>Todos los Vinilos</span>
        <span class="genre-count">${this.vinyls.length}</span>
      </button>
    `;

    genres.forEach(genre => {
      const count = genreCounts[genre];
      const isActive = this.currentGenre.toLowerCase() === genre.toLowerCase();
      html += `
        <button type="button" class="genre-pill ${isActive ? 'active' : ''}" data-genre="${genre}">
          <span>${genre}</span>
          <span class="genre-count">${count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    // Eventos táctiles para las píldoras de género
    container.querySelectorAll('.genre-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentGenre = btn.dataset.genre;
        this.renderGenrePills();
        this.applyFilters();
      });
    });
  }

  applyFilters() {
    let result = [...this.vinyls];

    // Filtro por género
    if (this.currentGenre !== 'all') {
      result = result.filter(v => (v.genre || '').toLowerCase() === this.currentGenre.toLowerCase());
    }

    // Filtro por búsqueda
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      result = result.filter(v => {
        const title = (v.title || '').toLowerCase();
        const artist = (v.artist || '').toLowerCase();
        const label = (v.label || '').toLowerCase();
        const year = String(v.year || '');
        const desc = (v.description || '').toLowerCase();
        return title.includes(q) || artist.includes(q) || label.includes(q) || year.includes(q) || desc.includes(q);
      });
    }

    // Filtro por formato
    if (this.filterFormat !== 'all') {
      result = result.filter(v => (v.format || '').toLowerCase().includes(this.filterFormat.toLowerCase()));
    }

    // Filtro solo en stock
    if (this.onlyInStock) {
      result = result.filter(v => v.stock > 0);
    }

    // Ordenamiento
    switch (this.sortBy) {
      case 'price-low':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'year-new':
        result.sort((a, b) => b.year - a.year);
        break;
      case 'year-old':
        result.sort((a, b) => a.year - b.year);
        break;
      case 'artist-az':
        result.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
        break;
      case 'title-az':
        result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'featured':
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        break;
    }

    this.filteredVinyls = result;
    this.renderCatalogGrid();
  }

  // ==========================================================================
  // RENDERIZADO DEL CATÁLOGO (GRID / LIST)
  // ==========================================================================
  renderCatalogGrid() {
    const grid = document.getElementById('vinylCatalogGrid');
    if (!grid) return;

    if (this.viewMode === 'list') {
      grid.classList.add('list-view');
    } else {
      grid.classList.remove('list-view');
    }

    if (this.filteredVinyls.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-wrap">
            ${ICONS.disc}
          </div>
          <h3 class="empty-title">No se encontraron productos</h3>
          <p class="empty-desc">Prueba con otra búsqueda o revisa que la hoja de Google Sheets tenga productos y precios válidos.</p>
        </div>
      `;
      return;
    }

    const currency = this.settings.currency || '$';

    grid.innerHTML = this.filteredVinyls.map(vinyl => {
      // Stock pill styling
      let stockClass = 'in-stock';
      let stockLabel = `En stock (${vinyl.stock})`;
      if (vinyl.stock <= 0) {
        stockClass = 'out-of-stock';
        stockLabel = 'Agotado';
      } else if (vinyl.stock <= 2) {
        stockClass = 'low-stock';
        stockLabel = `Últimas ${vinyl.stock} unid.`;
      }

      const coverSrc = vinyl.coverImage || generateVinylSvgCover(vinyl.title, vinyl.artist, vinyl.genre);
      const safeId = escapeHtml(vinyl.id);
      const safeTitle = escapeHtml(vinyl.title);
      const safeArtist = escapeHtml(vinyl.artist);
      const safeCover = escapeHtml(coverSrc);

      return `
        <article class="vinyl-card" data-id="${safeId}">
          <div class="card-sleeve-wrapper">
            <div class="vinyl-disc-peeking"></div>
            <div class="card-cover-container">
              <img src="${safeCover}" alt="${safeTitle}" class="card-cover-img" loading="lazy" onerror="this.onerror=null;this.src='./assets/icon-192.svg'">
              <span class="card-badge-format">${escapeHtml(vinyl.format || '12" LP')}</span>
              <span class="card-badge-condition">${escapeHtml(vinyl.condition || 'M')}</span>
            </div>
          </div>

          <div class="card-info">
            <div class="card-genre-row">
              <span>${escapeHtml(vinyl.genre || 'Música')}</span>
              <span class="card-year">${escapeHtml(vinyl.year || '')}</span>
            </div>
            
            <div class="card-title-group">
              <h2 class="card-title" title="${safeTitle}">${safeTitle}</h2>
              <p class="card-artist" title="${safeArtist}">${safeArtist}</p>
            </div>

            <div class="card-footer">
              <div class="card-price">
                <span class="currency-symbol">${escapeHtml(currency)}</span>${Math.round(Number(vinyl.price) || 0).toLocaleString('es-CL')}
              </div>
              <span class="card-stock-pill ${stockClass}">${stockLabel}</span>
            </div>
          </div>

        </article>
      `;
    }).join('');

    // Asignar eventos de click a las tarjetas
    grid.querySelectorAll('.vinyl-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.dataset.id;
        this.openVinylDetail(id);
      });
    });
  }

  // ==========================================================================
  // MODAL INTERACTIVO DE DETALLES Y TOCADISCOS
  // ==========================================================================
  async openVinylDetail(id) {
    this.currentDetailVinylId = id;
    const vinyl = await DB.getVinylById(id);
    if (!vinyl) return;

    const modal = document.getElementById('detailModalBackdrop');
    const currency = this.settings.currency || '$';

    document.getElementById('modalCoverImg').src = vinyl.coverImage || generateVinylSvgCover(vinyl.title, vinyl.artist, vinyl.genre);
    document.getElementById('modalCoverImg').onerror = () => {
      document.getElementById('modalCoverImg').src = generateVinylSvgCover(vinyl.title, vinyl.artist, vinyl.genre);
    };

    document.getElementById('modalDetailTitle').textContent = vinyl.title;
    document.getElementById('modalDetailArtist').textContent = vinyl.artist;
    document.getElementById('modalDetailGenre').textContent = vinyl.genre;
    document.getElementById('modalDetailFormatBadge').textContent = vinyl.format || '12" LP';
    document.getElementById('modalDetailConditionBadge').textContent = vinyl.condition || 'Mint (M)';
    const formattedPriceCLP = `${currency}${Math.round(Number(vinyl.price) || 0).toLocaleString('es-CL')}`;
    document.getElementById('modalDetailPrice').textContent = formattedPriceCLP;

    // Especificaciones
    document.getElementById('modalSpecYear').textContent = vinyl.year || '-';
    document.getElementById('modalSpecLabel').textContent = vinyl.label || '-';
    document.getElementById('modalSpecCat').textContent = vinyl.catalogNumber || '-';
    document.getElementById('modalSpecWeight').textContent = vinyl.weight || '180g';
    document.getElementById('modalSpecRpm').textContent = vinyl.rpm || '33 ⅓ RPM';
    document.getElementById('modalSpecStock').textContent = vinyl.stock > 0 ? `${vinyl.stock} unidades disponibles` : 'Agotado';

    // Descripción
    document.getElementById('modalDetailDesc').textContent = vinyl.description || 'Sin reseña adicional para esta edición.';

    // Tracklist
    const tracklistEl = document.getElementById('modalTracklist');
    if (vinyl.tracklist && vinyl.tracklist.length > 0) {
      tracklistEl.innerHTML = vinyl.tracklist.map((track, idx) => `
        <li class="track-item">
          <div>
            <span class="track-number">${track.side ? track.side + (idx + 1) : idx + 1}.</span>
            <span>${track.title}</span>
          </div>
          <span>${track.duration || ''}</span>
        </li>
      `).join('');
    } else {
      tracklistEl.innerHTML = `<li class="track-item" style="color:var(--text-muted);">Tracklist no registrado para esta edición</li>`;
    }

    // Botón de WhatsApp para reservar o pedir en mostrador
    const btnWhatsApp = document.getElementById('btnWhatsAppOrder');
    if (btnWhatsApp) {
      btnWhatsApp.onclick = () => {
        const phone = (this.settings.whatsappNumber || '').replace(/[^0-9]/g, '');
        const priceStr = `${currency}${Math.round(Number(vinyl.price) || 0).toLocaleString('es-CL')}`;
        const msg = encodeURIComponent(`¡Hola! Estoy usando la tablet del local y me gustaría consultar / reservar este vinilo:\n\n*${vinyl.title}* - ${vinyl.artist}\nFormato: ${vinyl.format} (${vinyl.year})\nPrecio: ${priceStr} CLP\nCódigo: ${vinyl.catalogNumber || vinyl.id}`);
        const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
        window.open(url, '_blank');
      };
    }

    // Reset turntable spinning
    this.isVinylSpinning = false;
    const vinylDiscEl = document.getElementById('turntableVinylDisc');
    const spinBtn = document.getElementById('btnToggleSpin');
    if (vinylDiscEl) vinylDiscEl.classList.remove('spinning');
    if (spinBtn) {
      spinBtn.classList.remove('playing');
      spinBtn.innerHTML = `${ICONS.play} <span>Hacer girar vinilo (33⅓ RPM)</span>`;
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  closeVinylDetail() {
    const modal = document.getElementById('detailModalBackdrop');
    if (modal) {
      modal.classList.remove('open');
    }
    document.body.style.overflow = '';
    this.isVinylSpinning = false;
  }

  toggleVinylSpin() {
    const vinylDiscEl = document.getElementById('turntableVinylDisc');
    const spinBtn = document.getElementById('btnToggleSpin');
    this.isVinylSpinning = !this.isVinylSpinning;

    if (this.isVinylSpinning) {
      vinylDiscEl.classList.add('spinning');
      spinBtn.classList.add('playing');
      spinBtn.innerHTML = `${ICONS.pause} <span>Detener giro</span>`;
      // Feedback sutil táctil
      if ('vibrate' in navigator) navigator.vibrate(20);
    } else {
      vinylDiscEl.classList.remove('spinning');
      spinBtn.classList.remove('playing');
      spinBtn.innerHTML = `${ICONS.play} <span>Hacer girar vinilo (33⅓ RPM)</span>`;
    }
  }

  // ==========================================================================
  // EVENTOS DEL DOM
  // ==========================================================================
  bindDOMEvents() {
    // Buscador
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClearBtn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (searchClear) {
          if (this.searchQuery.length > 0) {
            searchClear.classList.add('visible');
          } else {
            searchClear.classList.remove('visible');
          }
        }
        this.applyFilters();
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.classList.remove('visible');
        this.applyFilters();
      });
    }

    // Selector de ordenamiento
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.applyFilters();
      });
    }

    // Selector de formato
    const formatSelect = document.getElementById('formatFilterSelect');
    if (formatSelect) {
      formatSelect.addEventListener('change', (e) => {
        this.filterFormat = e.target.value;
        this.applyFilters();
      });
    }

    // Chip de filtro solo en stock
    const stockChip = document.getElementById('stockFilterChip');
    if (stockChip) {
      stockChip.addEventListener('click', () => {
        this.onlyInStock = !this.onlyInStock;
        stockChip.classList.toggle('active', this.onlyInStock);
        this.applyFilters();
      });
    }

    // Vistas Cuadrícula / Lista
    const btnViewGrid = document.getElementById('btnViewGrid');
    const btnViewList = document.getElementById('btnViewList');
    if (btnViewGrid && btnViewList) {
      btnViewGrid.addEventListener('click', () => {
        this.viewMode = 'grid';
        btnViewGrid.classList.add('active');
        btnViewList.classList.remove('active');
        this.renderCatalogGrid();
      });
      btnViewList.addEventListener('click', () => {
        this.viewMode = 'list';
        btnViewList.classList.add('active');
        btnViewGrid.classList.remove('active');
        this.renderCatalogGrid();
      });
    }

    // Modal de Detalle
    const btnCloseDetail = document.getElementById('btnCloseDetailModal');
    const detailBackdrop = document.getElementById('detailModalBackdrop');
    if (btnCloseDetail) {
      btnCloseDetail.addEventListener('click', () => this.closeVinylDetail());
    }
    if (detailBackdrop) {
      detailBackdrop.addEventListener('click', (e) => {
        if (e.target === detailBackdrop) this.closeVinylDetail();
      });
    }

    // Botón de giro del vinilo
    const btnToggleSpin = document.getElementById('btnToggleSpin');
    if (btnToggleSpin) {
      btnToggleSpin.addEventListener('click', () => this.toggleVinylSpin());
    }
  }
}

// Toast Notificaciones
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = ICONS.disc;
  if (type === 'success') icon = ICONS.check;
  if (type === 'error') icon = ICONS.x;

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = new VinylApp();
  window.app.init();
});

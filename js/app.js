// ==========================================================================
// HITWAY MUSIC & BOOKS - APLICACIÓN PRINCIPAL
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
    this.searchQuery = '';
    this.sortBy = 'artist-az';
    this.viewMode = 'grid'; // 'grid' | 'list'
    this.currentDetailVinylId = null;
    this.detailImages = [];
    this.currentImageIndex = 0;
    this.galleryTouchStartX = null;
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
    if (storeTitleEl) storeTitleEl.textContent = 'Hitway Music & Books';
    if (storeSubEl) storeSubEl.textContent = 'Catálogo de Música y Libros';
    document.title = 'Hitway Music & Books';
  }

  async loadAndRender() {
    this.vinyls = (await DB.getAllVinyls()).filter(vinyl => vinyl.sku);
    this.updateStats();
    this.applyFilters();
  }

  async syncSheetCatalog(sheetUrl = this.settings.sheetUrl, { silent = false } = {}) {
    if (this.isSheetSyncing) return false;
    this.isSheetSyncing = true;
    const status = document.getElementById('sheetSyncStatus');
    if (status) status.textContent = 'Sincronizando con Google Sheets…';
    try {
      const { count, productsWithoutPrice } = await DB.syncFromGoogleSheet(sheetUrl);
      this.settings.sheetUrl = sheetUrl;
      await this.loadAndRender();
      const syncedAt = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      const missingPriceMessage = productsWithoutPrice
        ? ` · ${productsWithoutPrice} sin precio`
        : '';
      if (status) status.textContent = `Actualizado: ${syncedAt} · ${count} productos${missingPriceMessage}`;
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
    if (totalCountEl) totalCountEl.textContent = this.vinyls.length;
  }

  // ==========================================================================
  // FILTRADO Y BÚSQUEDA
  // ==========================================================================
  applyFilters() {
    let result = [...this.vinyls];

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      result = result.filter(v => {
        const title = (v.title || '').toLowerCase();
        const artist = (v.artist || '').toLowerCase();
        return title.includes(q) || artist.includes(q);
      });
    }

    const comparePrice = (a, b, direction = 1) => {
      const hasPriceA = a.price !== null && a.price !== undefined && String(a.price).trim() !== '' && Number.isFinite(Number(a.price));
      const hasPriceB = b.price !== null && b.price !== undefined && String(b.price).trim() !== '' && Number.isFinite(Number(b.price));
      if (!hasPriceA && !hasPriceB) return 0;
      if (!hasPriceA) return 1;
      if (!hasPriceB) return -1;
      return direction * (Number(a.price) - Number(b.price));
    };
    switch (this.sortBy) {
      case 'price-low':
        result.sort(comparePrice);
        break;
      case 'price-high':
        result.sort((a, b) => comparePrice(a, b, -1));
        break;
      case 'artist-az':
        result.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'es', { sensitivity: 'base' }));
        break;
      default:
        this.sortBy = 'artist-az';
        result.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'es', { sensitivity: 'base' }));
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
      const coverSrc = vinyl.coverImage || generateVinylSvgCover(vinyl.title, vinyl.artist, vinyl.genre);
      const safeId = escapeHtml(vinyl.id);
      const safeTitle = escapeHtml(vinyl.title);
      const safeArtist = escapeHtml(vinyl.artist);
      const safeCover = escapeHtml(coverSrc);
      const imageCount = this.getProductImages(vinyl).length;

      return `
        <article class="vinyl-card" data-id="${safeId}">
          <div class="card-sleeve-wrapper">
            <div class="vinyl-disc-peeking"></div>
            <div class="card-cover-container">
              <img src="${safeCover}" alt="${safeTitle}" class="card-cover-img" loading="lazy" onerror="this.onerror=null;this.src='./assets/icon-192.svg'">
              <span class="card-badge-format">${escapeHtml(vinyl.format || '12" LP')}</span>
              <span class="card-badge-condition">${escapeHtml(vinyl.condition || 'M')}</span>
              ${imageCount > 1 ? `<span class="card-image-count">${imageCount} fotos</span>` : ''}
            </div>
          </div>

          <div class="card-info">
            <div class="card-genre-row">
              <span>${escapeHtml(vinyl.genre || 'Música')}</span>
            </div>
            
            <div class="card-title-group">
              <h2 class="card-title" title="${safeTitle}">${safeTitle}</h2>
              <p class="card-artist" title="${safeArtist}">${safeArtist}</p>
            </div>

            <div class="card-footer">
              <div class="card-price">
                ${this.renderPrice(vinyl.price, currency)}
              </div>
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

  getProductImages(vinyl) {
    const images = Array.isArray(vinyl.images) ? vinyl.images : [];
    return [...new Set([...images, vinyl.coverImage].filter(image => typeof image === 'string' && image.trim()))];
  }

  updateDetailGallery() {
    const imageEl = document.getElementById('modalCoverImg');
    const counterEl = document.getElementById('galleryCounter');
    const thumbnailsEl = document.getElementById('galleryThumbnails');
    const previousButton = document.getElementById('galleryPrev');
    const nextButton = document.getElementById('galleryNext');
    if (!imageEl || !this.detailImages.length) return;

    imageEl.src = this.detailImages[this.currentImageIndex];
    imageEl.alt = `${document.getElementById('modalDetailTitle').textContent} - Foto ${this.currentImageIndex + 1}`;
    imageEl.onerror = () => {
      imageEl.onerror = null;
      imageEl.src = './assets/icon-192.svg';
    };
    counterEl.textContent = `${this.currentImageIndex + 1} / ${this.detailImages.length}`;
    previousButton.hidden = this.detailImages.length < 2;
    nextButton.hidden = this.detailImages.length < 2;
    thumbnailsEl.hidden = this.detailImages.length < 2;
    thumbnailsEl.innerHTML = this.detailImages.map((image, index) => `
      <button type="button" class="gallery-thumbnail ${index === this.currentImageIndex ? 'active' : ''}"
        data-gallery-index="${index}" aria-label="Mostrar foto ${index + 1}"
        aria-current="${index === this.currentImageIndex ? 'true' : 'false'}">
        <img src="${escapeHtml(image)}" alt="" loading="lazy">
      </button>
    `).join('');
  }

  changeDetailImage(direction) {
    if (this.detailImages.length < 2) return;
    this.currentImageIndex = (this.currentImageIndex + direction + this.detailImages.length) % this.detailImages.length;
    this.updateDetailGallery();
  }

  // ==========================================================================
  // DETALLES DEL PRODUCTO
  // ==========================================================================
  async openVinylDetail(id) {
    this.currentDetailVinylId = id;
    const vinyl = await DB.getVinylById(id);
    if (!vinyl) return;

    const modal = document.getElementById('detailModalBackdrop');
    const currency = this.settings.currency || '$';

    document.getElementById('modalDetailTitle').textContent = vinyl.title;
    this.detailImages = this.getProductImages(vinyl);
    if (!this.detailImages.length) {
      this.detailImages = [generateVinylSvgCover(vinyl.title, vinyl.artist, vinyl.genre)];
    }
    this.currentImageIndex = 0;
    this.updateDetailGallery();
    document.getElementById('modalDetailArtist').textContent = vinyl.artist;
    document.getElementById('modalDetailGenre').textContent = vinyl.genre;
    document.getElementById('modalDetailFormatBadge').textContent = vinyl.format || '12" LP';
    document.getElementById('modalDetailConditionBadge').textContent = vinyl.condition || 'Mint (M)';
    document.getElementById('modalDetailPrice').textContent = this.formatPrice(vinyl.price, currency);
    document.getElementById('modalDetailTotal').textContent = this.formatPrice(
      vinyl.price === null || vinyl.price === undefined ? null : Math.round(Number(vinyl.price) * 1.19),
      currency
    );

    document.getElementById('modalDetailDesc').textContent = vinyl.description || 'Sin reseña adicional para esta edición.';

    const tracklistEl = document.getElementById('modalTracklist');
    if (vinyl.tracklist && vinyl.tracklist.length > 0) {
      tracklistEl.innerHTML = vinyl.tracklist.map((track, idx) => `
        <li class="track-item">
          <div>
            <span class="track-number">${escapeHtml(track.side ? `${track.side}${track.number || idx + 1}` : `${track.number || idx + 1}`)}.</span>
            <span>${escapeHtml(track.title)}</span>
          </div>
          <span>${escapeHtml(track.duration || '')}</span>
        </li>
      `).join('');
    } else {
      tracklistEl.innerHTML = `<li class="track-item" style="color:var(--text-muted);">Tracklist no registrado para esta edición</li>`;
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
    this.detailImages = [];
  }

  formatPrice(price, currency = this.settings.currency || '$') {
    if (price === null || price === undefined || !Number.isFinite(Number(price))) return 'Consultar precio';
    return `${currency}${Math.round(Number(price)).toLocaleString('es-CL')}`;
  }

  renderPrice(price, currency) {
    const basePrice = this.formatPrice(price, currency);
    const totalPrice = price === null || price === undefined
      ? 'Consultar precio'
      : this.formatPrice(Math.round(Number(price) * 1.19), currency);

    return `<span class="price-base-label">Precio + IVA</span>
      <span class="price-base">${escapeHtml(basePrice)}</span>
      <span class="price-total-label">Total (IVA 19%)</span>
      <span class="price-total">${escapeHtml(totalPrice)}</span>`;
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

    document.getElementById('galleryPrev')?.addEventListener('click', () => this.changeDetailImage(-1));
    document.getElementById('galleryNext')?.addEventListener('click', () => this.changeDetailImage(1));
    document.getElementById('galleryThumbnails')?.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('[data-gallery-index]') : null;
      if (!button) return;
      this.currentImageIndex = Number(button.dataset.galleryIndex);
      this.updateDetailGallery();
    });

    const productGallery = document.getElementById('productGallery');
    if (productGallery) {
      productGallery.addEventListener('touchstart', event => {
        this.galleryTouchStartX = event.changedTouches[0].clientX;
      }, { passive: true });
      productGallery.addEventListener('touchend', event => {
        if (this.galleryTouchStartX === null) return;
        const distance = event.changedTouches[0].clientX - this.galleryTouchStartX;
        this.galleryTouchStartX = null;
        if (Math.abs(distance) > 50) this.changeDetailImage(distance < 0 ? 1 : -1);
      }, { passive: true });
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

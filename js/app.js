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

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[char]);
}

function createXlsxBlob(files) {
  const encoder = new TextEncoder();
  const crc32 = data => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  files.forEach(([path, content]) => {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(12, 0x0021, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(14, 0x0021, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  });

  const centralDirectory = new Uint8Array(centralParts.reduce((size, part) => size + part.length, 0));
  let centralOffset = 0;
  centralParts.forEach(part => {
    centralDirectory.set(part, centralOffset);
    centralOffset += part.length;
  });
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);

  return new Blob([...localParts, centralDirectory, endRecord], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

function normalizeCartDiscountPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(10, Math.max(0, numericValue)) : 0;
}

function calculateQuoteTotals(cartRows, discountPercent = 0) {
  const appliedDiscountPercent = normalizeCartDiscountPercent(discountPercent);
  const hasMissingPrices = cartRows.some(({ vinyl }) =>
    vinyl.price === null || vinyl.price === undefined || !Number.isFinite(Number(vinyl.price))
  );
  const pricedRows = cartRows.filter(({ vinyl }) =>
    vinyl.price !== null && vinyl.price !== undefined && Number.isFinite(Number(vinyl.price))
  );
  const subtotal = pricedRows.reduce((sum, { vinyl, quantity }) => sum + Number(vinyl.price) * quantity, 0);
  const totalWithTax = pricedRows.reduce(
    (sum, { vinyl, quantity }) => sum + Math.round(Number(vinyl.price) * 1.19) * quantity,
    0
  );
  const discount = Math.round(subtotal * appliedDiscountPercent / 100);
  const discountedSubtotal = subtotal - discount;
  const discountedTotal = Math.round(totalWithTax * (100 - appliedDiscountPercent) / 100);

  return {
    hasMissingPrices,
    discountPercent: appliedDiscountPercent,
    subtotal,
    discount,
    discountedSubtotal,
    discountedTotal
  };
}

function buildQuoteWorkbook(cartRows, discountPercent = 0) {
  const totals = calculateQuoteTotals(cartRows, discountPercent);
  const discountLabel = totals.discountPercent.toLocaleString('es-CL');
  const worksheetRows = [
    ['Cotización - Hitway Music & Books'],
    ['Fecha', new Date().toLocaleDateString('es-CL')],
    ['Producto', 'Artista', 'Formato', 'SKU', 'Unidades', 'Precio unitario (sin IVA)', 'Total línea con IVA']
  ];

  cartRows.forEach(({ vinyl, quantity }) => {
    const hasPrice = vinyl.price !== null && vinyl.price !== undefined && Number.isFinite(Number(vinyl.price));
    worksheetRows.push([
      vinyl.title || vinyl.name || '',
      vinyl.artist || '',
      vinyl.format || '',
      vinyl.sku || '',
      quantity,
      hasPrice ? Number(vinyl.price) : 'Consultar precio',
      hasPrice ? Math.round(Number(vinyl.price) * 1.19) * quantity : 'Consultar precio'
    ]);
  });

  worksheetRows.push([]);
  worksheetRows.push(['', '', '', '', '', 'Subtotal', totals.hasMissingPrices ? 'Pendiente' : totals.subtotal]);
  worksheetRows.push(['', '', '', '', '', `Descuento (${discountLabel}%)`, totals.hasMissingPrices ? 'Pendiente' : -totals.discount]);
  worksheetRows.push(['', '', '', '', '', 'Subtotal con descuento', totals.hasMissingPrices ? 'Pendiente' : totals.discountedSubtotal]);
  worksheetRows.push(['', '', '', '', '', 'IVA (19%)', totals.hasMissingPrices ? 'Pendiente' : totals.discountedTotal - totals.discountedSubtotal]);
  worksheetRows.push(['', '', '', '', '', 'Total con IVA', totals.hasMissingPrices ? 'Pendiente' : totals.discountedTotal]);
  const columnName = index => {
    let name = '';
    for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
      name = String.fromCharCode(65 + (number - 1) % 26) + name;
    }
    return name;
  };
  const cells = (row, rowIndex) => row.map((value, colIndex) => {
    if (value === undefined || value === null || value === '') return '';
    const reference = `${columnName(colIndex)}${rowIndex + 1}`;
    if (typeof value === 'number') return `<c r="${reference}" s="1"><v>${value}</v></c>`;
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }).join('');
  const sheetRows = worksheetRows.map((row, index) => `<row r="${index + 1}">${cells(row, index)}</row>`).join('');
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData><autoFilter ref="A3:G${cartRows.length + 3}"/></worksheet>`;
  const workbookFiles = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cotización" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[$-es-CL]#,##0"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', worksheet]
  ];
  return createXlsxBlob(workbookFiles);
}

class VinylApp {
  constructor() {
    this.vinyls = [];
    this.filteredVinyls = [];
    this.settings = {};
    this.searchQuery = '';
    this.sortBy = 'artist-az';
    this.formatFilter = 'all';
    this.viewMode = 'grid'; // 'grid' | 'list'
    this.currentDetailVinylId = null;
    this.detailImages = [];
    this.currentImageIndex = 0;
    this.galleryTouchStartX = null;
    this.isSheetSyncing = false;
    this.cart = [];
    this.discountPercent = 0;
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
    if (storeSubEl) storeSubEl.textContent = 'Catálogo de CD y vinilos';
    document.title = 'Hitway Music & Books';
  }

  async loadAndRender() {
    this.vinyls = (await DB.getAllVinyls()).filter(vinyl => vinyl.sku);
    const availableIds = new Set(this.vinyls.map(vinyl => String(vinyl.id)));
    this.cart = this.cart.filter(item => availableIds.has(String(item.id)));
    this.updateStats();
    this.applyFilters();
    this.renderCart();
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

    if (this.formatFilter !== 'all') {
      result = result.filter(vinyl => vinyl.format?.trim().toUpperCase() === this.formatFilter);
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
              <span class="card-badge-format">${escapeHtml(vinyl.format || 'Formato no especificado')}</span>
              ${imageCount > 1 ? `<span class="card-image-count">${imageCount} fotos</span>` : ''}
            </div>
          </div>

          <div class="card-info">
            <div class="card-genre-row">
              <span>${escapeHtml(vinyl.format?.trim().toUpperCase() === 'CD' ? 'CD' : vinyl.genre || 'Vinilos')}</span>
            </div>
            
            <div class="card-title-group">
              <h2 class="card-title" title="${safeTitle}">${safeTitle}</h2>
              <p class="card-artist" title="${safeArtist}">${safeArtist}</p>
            </div>

            <div class="card-footer">
              <div class="card-price">
                ${this.renderPrice(vinyl.price, currency)}
              </div>
              <div class="product-cart-control" data-product-cart="${safeId}"></div>
            </div>
          </div>

        </article>
      `;
    }).join('');

    this.updateCartButtons();

    // Asignar eventos de click a las tarjetas
    grid.querySelectorAll('.vinyl-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!(e.target instanceof Element)) return;
        const cartControl = e.target.closest('.product-cart-control');
        if (cartControl) {
          e.stopPropagation();
        }
        const cartAction = e.target.closest('[data-product-cart-action]');
        if (cartAction) {
          this.handleProductCartAction(card.dataset.id, cartAction.dataset.productCartAction);
          return;
        }
        if (cartControl) return;
        const id = card.dataset.id;
        this.openVinylDetail(id);
      });
    });
  }

  addToCart(id) {
    const vinyl = this.vinyls.find(item => String(item.id) === String(id));
    if (!vinyl) {
      showToast('No se pudo agregar el producto. Actualiza el catálogo e inténtalo nuevamente.', 'error');
      return;
    }
    const item = this.cart.find(entry => String(entry.id) === String(id));
    if (item) item.quantity += 1;
    else this.cart.push({ id: vinyl.id, quantity: 1 });
    this.renderCart();
    if (!item) showToast(`${vinyl.title} agregado al carrito`, 'success');
  }

  removeFromCart(id) {
    const vinyl = this.vinyls.find(item => String(item.id) === String(id));
    const initialLength = this.cart.length;
    this.cart = this.cart.filter(item => String(item.id) !== String(id));
    if (this.cart.length !== initialLength) {
      this.renderCart();
      if (vinyl) showToast(`${vinyl.title} quitado del carrito`, 'success');
    }
  }

  changeCartQuantity(id, direction) {
    const item = this.cart.find(entry => String(entry.id) === String(id));
    if (direction > 0) {
      this.addToCart(id);
    } else if (item) {
      this.setCartQuantity(id, item.quantity - 1);
    }
  }

  handleProductCartAction(id, action) {
    if (action === 'add' || action === 'increase') {
      this.changeCartQuantity(id, 1);
    } else if (action === 'decrease') {
      this.changeCartQuantity(id, -1);
    }
  }

  updateCartButtons() {
    document.querySelectorAll('[data-product-cart]').forEach(container => {
      const id = container.dataset.productCart;
      const item = this.cart.find(entry => String(entry.id) === String(id));
      const vinyl = this.vinyls.find(product => String(product.id) === String(id));
      container.innerHTML = item
        ? `<div class="cart-quantity-control" aria-label="Unidades de ${escapeHtml(vinyl?.title || 'producto')} en cotización">
            <button type="button" data-product-cart-action="decrease" data-cart-id="${escapeHtml(id)}" aria-label="Quitar una unidad">−</button>
            <span aria-live="polite">${item.quantity}</span>
            <button type="button" data-product-cart-action="increase" data-cart-id="${escapeHtml(id)}" aria-label="Agregar una unidad">+</button>
          </div>`
        : `<button type="button" class="btn-add-cart" data-product-cart-action="add" data-cart-id="${escapeHtml(id)}" aria-label="Agregar ${escapeHtml(vinyl?.title || 'producto')} al carrito"><span aria-hidden="true">+</span> Agregar</button>`;
    });
    const detailControl = document.getElementById('detailCartControl');
    if (detailControl && this.currentDetailVinylId !== null) {
      detailControl.dataset.productCart = this.currentDetailVinylId;
    }
  }

  getCartRows() {
    return this.cart
      .map(item => ({
        vinyl: this.vinyls.find(vinyl => String(vinyl.id) === String(item.id)),
        quantity: item.quantity
      }))
      .filter(row => row.vinyl);
  }

  renderCart() {
    const countEl = document.getElementById('cartItemCount');
    const listEl = document.getElementById('cartItems');
    const subtotalEl = document.getElementById('cartSubtotal');
    const totalEl = document.getElementById('cartTotal');
    const noticeEl = document.getElementById('cartPriceNotice');
    const discountInput = document.getElementById('cartDiscountPercent');
    const discountSummary = document.getElementById('cartDiscountSummary');
    const discountLabel = document.getElementById('cartDiscountLabel');
    const discountAmount = document.getElementById('cartDiscountAmount');
    const exportButton = document.getElementById('btnExportQuote');
    const clearButton = document.getElementById('btnClearCart');
    if (!countEl || !listEl || !subtotalEl || !totalEl || !noticeEl || !discountInput || !discountSummary || !discountLabel || !discountAmount || !exportButton || !clearButton) return;

    this.updateCartButtons();
    const rows = this.getCartRows();
    const count = rows.reduce((sum, row) => sum + row.quantity, 0);
    countEl.textContent = count;
    countEl.setAttribute('aria-label', `${count} unidades`);
    exportButton.disabled = rows.length === 0;
    clearButton.disabled = rows.length === 0;
    discountInput.disabled = rows.length === 0;
    discountInput.value = String(this.discountPercent);

    if (!rows.length) {
      listEl.innerHTML = '<p class="cart-empty">Aún no has agregado productos.</p>';
      subtotalEl.textContent = this.formatPrice(0);
      totalEl.textContent = this.formatPrice(0);
      discountSummary.hidden = true;
      discountLabel.textContent = `${this.discountPercent}%`;
      discountAmount.textContent = `-${this.formatPrice(0)}`;
      noticeEl.hidden = true;
      return;
    }

    const totals = calculateQuoteTotals(rows, this.discountPercent);

    listEl.innerHTML = rows.map(({ vinyl, quantity }) => `
      <article class="cart-row" data-cart-id="${escapeHtml(vinyl.id)}">
        <div class="cart-product-info">
          <strong>${escapeHtml(vinyl.title || vinyl.name)}</strong>
          <span>${escapeHtml(vinyl.artist || '')} · ${escapeHtml(vinyl.format || '')}</span>
          <span>${escapeHtml(this.formatPrice(vinyl.price))} c/u + IVA</span>
        </div>
        <div class="cart-row-actions" aria-label="Cantidad solicitada">
          <button type="button" data-cart-action="decrease" data-cart-id="${escapeHtml(vinyl.id)}" aria-label="Restar una unidad">−</button>
          <input type="number" min="1" step="1" value="${quantity}" data-cart-quantity="${escapeHtml(vinyl.id)}" aria-label="Unidades de ${escapeHtml(vinyl.title)}">
          <button type="button" data-cart-action="increase" data-cart-id="${escapeHtml(vinyl.id)}" aria-label="Agregar una unidad">+</button>
          <button type="button" class="cart-remove" data-cart-action="remove" data-cart-id="${escapeHtml(vinyl.id)}" aria-label="Quitar ${escapeHtml(vinyl.title)}">Quitar</button>
        </div>
      </article>
    `).join('');
    subtotalEl.textContent = this.formatPrice(totals.discountedSubtotal);
    totalEl.textContent = this.formatPrice(totals.discountedTotal);
    discountLabel.textContent = `${Number(this.discountPercent).toLocaleString('es-CL')}%`;
    discountAmount.textContent = `-${this.formatPrice(totals.discount)}`;
    discountSummary.hidden = totals.discount === 0;
    noticeEl.hidden = !totals.hasMissingPrices;
  }

  setCartDiscount(value) {
    const numericValue = Number(value);
    const exceededLimit = Number.isFinite(numericValue) && numericValue > 10;
    this.discountPercent = normalizeCartDiscountPercent(value);
    const discountInput = document.getElementById('cartDiscountPercent');
    const limitNotice = document.getElementById('cartDiscountLimitNotice');
    if (discountInput && exceededLimit) discountInput.value = String(this.discountPercent);
    if (limitNotice) limitNotice.hidden = !exceededLimit;
    const rows = this.getCartRows();
    const totals = calculateQuoteTotals(rows, this.discountPercent);
    const discountLabel = document.getElementById('cartDiscountLabel');
    const discountSummary = document.getElementById('cartDiscountSummary');
    const discountAmount = document.getElementById('cartDiscountAmount');
    const subtotalEl = document.getElementById('cartSubtotal');
    const totalEl = document.getElementById('cartTotal');
    if (subtotalEl) subtotalEl.textContent = this.formatPrice(totals.discountedSubtotal);
    if (totalEl) totalEl.textContent = this.formatPrice(totals.discountedTotal);
    if (discountLabel) discountLabel.textContent = `${Number(this.discountPercent).toLocaleString('es-CL')}%`;
    if (discountAmount) discountAmount.textContent = `-${this.formatPrice(totals.discount)}`;
    if (discountSummary) discountSummary.hidden = totals.discount === 0;
  }

  setCartQuantity(id, quantity) {
    const item = this.cart.find(entry => String(entry.id) === String(id));
    if (!item) return;
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.cart = this.cart.filter(entry => String(entry.id) !== String(id));
    } else {
      item.quantity = quantity;
    }
    this.renderCart();
  }

  openCart() {
    this.renderCart();
    const modal = document.getElementById('cartModalBackdrop');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  closeCart() {
    const modal = document.getElementById('cartModalBackdrop');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = document.getElementById('detailModalBackdrop').classList.contains('open') ? 'hidden' : '';
  }

  exportQuote() {
    const rows = this.getCartRows();
    if (!rows.length) {
      showToast('Agrega productos antes de generar la cotización.', 'error');
      return;
    }
    const blob = buildQuoteWorkbook(rows, this.discountPercent);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cotizacion-hitway-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Cotización Excel descargada', 'success');
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

    document.getElementById('detailCartControl').dataset.productCart = vinyl.id;
    document.getElementById('modalDetailTitle').textContent = vinyl.title;
    this.detailImages = this.getProductImages(vinyl);
    if (!this.detailImages.length) {
      this.detailImages = [generateVinylSvgCover(vinyl.title, vinyl.artist, vinyl.genre)];
    }
    this.currentImageIndex = 0;
    this.updateDetailGallery();
    document.getElementById('modalDetailArtist').textContent = vinyl.artist;
    document.getElementById('modalDetailGenre').textContent = vinyl.genre;
    document.getElementById('modalDetailGenre').hidden = vinyl.format?.trim().toUpperCase() === 'CD';
    document.getElementById('modalDetailFormatBadge').textContent = vinyl.format || 'Formato no especificado';
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
    this.updateCartButtons();
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

    const formatFilterSelect = document.getElementById('formatFilterSelect');
    if (formatFilterSelect) {
      formatFilterSelect.addEventListener('change', event => {
        this.formatFilter = event.target.value;
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
    document.getElementById('detailCartControl')?.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('[data-product-cart-action]');
      if (!button || this.currentDetailVinylId === null) return;
      this.handleProductCartAction(this.currentDetailVinylId, button.dataset.productCartAction);
    });

    document.getElementById('btnOpenCart')?.addEventListener('click', () => this.openCart());
    document.getElementById('btnCloseCart')?.addEventListener('click', () => this.closeCart());
    document.getElementById('cartModalBackdrop')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) this.closeCart();
    });
    document.getElementById('btnClearCart')?.addEventListener('click', () => {
      this.cart = [];
      this.discountPercent = 0;
      const limitNotice = document.getElementById('cartDiscountLimitNotice');
      if (limitNotice) limitNotice.hidden = true;
      this.renderCart();
    });
    document.getElementById('cartDiscountPercent')?.addEventListener('input', event => {
      if (!(event.target instanceof HTMLInputElement)) return;
      this.setCartDiscount(event.target.value);
    });
    document.getElementById('cartDiscountPercent')?.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) return;
      event.target.value = String(this.discountPercent);
    });
    document.getElementById('btnExportQuote')?.addEventListener('click', () => this.exportQuote());
    document.getElementById('cartItems')?.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('[data-cart-action]');
      if (!button) return;
      const { cartAction, cartId } = button.dataset;
      const item = this.cart.find(entry => String(entry.id) === String(cartId));
      if (!item) return;
      if (cartAction === 'increase') this.setCartQuantity(cartId, item.quantity + 1);
      if (cartAction === 'decrease') this.setCartQuantity(cartId, item.quantity - 1);
      if (cartAction === 'remove') this.setCartQuantity(cartId, 0);
    });
    document.getElementById('cartItems')?.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-cart-quantity]')) return;
      const quantity = Number(event.target.value);
      if (!Number.isInteger(quantity) || quantity < 1) {
        this.renderCart();
        return;
      }
      this.setCartQuantity(event.target.dataset.cartQuantity, quantity);
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (document.getElementById('cartModalBackdrop').classList.contains('open')) this.closeCart();
      else if (document.getElementById('detailModalBackdrop').classList.contains('open')) this.closeVinylDetail();
    });

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

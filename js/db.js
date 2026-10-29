// ==========================================================================
// HITWAY MUSIC & BOOKS - BASE DE DATOS Y PERSISTENCIA (INDEXEDDB + FALLBACK)
// Catálogo con productos genéricos e ilustraciones vectoriales SVG puras
// (Sin fotos personales ni dependencias de imágenes externas)
// ==========================================================================

const DB_NAME = 'RetroGroove_VinylDB';
const DB_VERSION = 3; // Versión 3: Precios en Pesos Chilenos (CLP)
const STORE_VINYLS = 'vinyls';
const STORE_SETTINGS = 'settings';
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/17tInd6wve8A5iExr2whiEkE1OIgo0rn-/edit?gid=937471658#gid=937471658';

function parseSheetCsv(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
  }
  return rows;
}

function normalizeSheetHeader(value) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseSheetPrice(value, rowNumber) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d-]/g, '');
  const price = Number(normalized);
  if (!normalized || !Number.isSafeInteger(price) || price < 0) {
    throw new Error(`El precio de la fila ${rowNumber} no es válido.`);
  }
  return price;
}

function parseSheetProducts(csv) {
  const rows = parseSheetCsv(csv);
  if (rows.length < 2) throw new Error('La hoja no contiene productos para sincronizar.');

  const headers = rows[0].map(normalizeSheetHeader);
  const columns = {
    product: headers.findIndex(header => ['PRODUCTO', 'PRODUCT', 'TITULO'].includes(header)),
    sku: headers.findIndex(header => ['SKU', 'CODIGO', 'CODIGOPRODUCTO'].includes(header)),
    image: headers.findIndex(header => ['IMAGEN', 'IMAGENES', 'IMAGE', 'IMAGES'].includes(header)),
    price: headers.findIndex(header => ['PRECIO', 'PRICE'].includes(header))
  };
  if (columns.product < 0 || columns.sku < 0 || columns.price < 0) {
    throw new Error('La hoja debe tener encabezados PRODUCTO, SKU y PRECIO.');
  }

  const products = new Map();
  let currentProduct = null;

  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const productName = (cells[columns.product] || '').trim();
    const sku = (cells[columns.sku] || '').trim();
    const image = columns.image >= 0 ? (cells[columns.image] || '').trim() : '';

    if (productName || sku) {
      if (!productName || !sku) {
        throw new Error(`Falta PRODUCTO o SKU en la fila ${rowNumber}.`);
      }
      const priceValue = (cells[columns.price] || '').trim();
      currentProduct = {
        name: productName,
        sku,
        price: parseSheetPrice(priceValue, rowNumber),
        images: []
      };
      const existing = products.get(sku);
      if (existing && existing.name !== productName) {
        throw new Error(`El SKU "${sku}" está repetido con productos distintos.`);
      }
      if (existing) {
        existing.price = currentProduct.price;
        currentProduct = existing;
      } else {
        products.set(sku, currentProduct);
      }
    } else if (cells[columns.price] && cells[columns.price].trim() && currentProduct) {
      currentProduct.price = parseSheetPrice(cells[columns.price], rowNumber);
    }

    if (image && currentProduct) {
      if (!/^https?:\/\//i.test(image)) {
        throw new Error(`La imagen de la fila ${rowNumber} debe ser una URL http o https.`);
      }
      currentProduct.images.push(image);
    }
  });

  if (!products.size) throw new Error('No se encontraron productos con PRODUCTO y SKU.');
  return [...products.values()];
}

// ==========================================================================
// GENERADOR DE PORTADAS GENÉRICAS EN SVG PURO
// Cada vinilo tiene un diseño geométrico, elegante y único sin fotos externas
// ==========================================================================
function generateGenericCoverSvg(title, artist, genre, styleIndex = 0) {
  const styles = [
    // Estilo 0: Círculos concéntricos dorados sobre azul noche
    {
      bg1: "#0f172a", bg2: "#1e293b",
      accent: "#f5c563", secondary: "#38bdf8",
      pattern: (acc, sec) => `
        <circle cx="300" cy="260" r="180" fill="none" stroke="${sec}" stroke-width="2" opacity="0.3"/>
        <circle cx="300" cy="260" r="140" fill="none" stroke="${acc}" stroke-width="3" opacity="0.6"/>
        <circle cx="300" cy="260" r="90" fill="none" stroke="${sec}" stroke-width="1.5" opacity="0.5"/>
        <circle cx="300" cy="260" r="50" fill="${acc}" opacity="0.85"/>
        <circle cx="300" cy="260" r="14" fill="#0f172a"/>
        <line x1="120" y1="260" x2="480" y2="260" stroke="${acc}" stroke-width="2" opacity="0.4"/>
      `
    },
    // Estilo 1: Ondas sonoras analógicas sobre terracota / vino
    {
      bg1: "#3b0712", bg2: "#1c0409",
      accent: "#f59e0b", secondary: "#f43f5e",
      pattern: (acc, sec) => `
        <rect x="80" y="240" width="16" height="60" rx="8" fill="${acc}" opacity="0.8"/>
        <rect x="110" y="210" width="16" height="120" rx="8" fill="${sec}" opacity="0.9"/>
        <rect x="140" y="180" width="16" height="180" rx="8" fill="${acc}"/>
        <rect x="170" y="220" width="16" height="100" rx="8" fill="${sec}" opacity="0.8"/>
        <rect x="200" y="160" width="16" height="220" rx="8" fill="${acc}"/>
        <rect x="230" y="190" width="16" height="160" rx="8" fill="${sec}" opacity="0.9"/>
        <rect x="260" y="140" width="16" height="260" rx="8" fill="${acc}"/>
        <rect x="290" y="120" width="16" height="300" rx="8" fill="${sec}"/>
        <rect x="320" y="150" width="16" height="240" rx="8" fill="${acc}"/>
        <rect x="350" y="180" width="16" height="180" rx="8" fill="${sec}" opacity="0.9"/>
        <rect x="380" y="210" width="16" height="120" rx="8" fill="${acc}"/>
        <rect x="410" y="230" width="16" height="80" rx="8" fill="${sec}" opacity="0.8"/>
      `
    },
    // Estilo 2: Minimalista Bauhaus verde bosque y ámbar
    {
      bg1: "#062e24", bg2: "#021a14",
      accent: "#34d399", secondary: "#f5c563",
      pattern: (acc, sec) => `
        <rect x="140" y="120" width="220" height="220" rx="110" fill="${acc}" opacity="0.25"/>
        <polygon points="300,100 440,320 160,320" fill="none" stroke="${sec}" stroke-width="4"/>
        <circle cx="300" cy="220" r="60" fill="${acc}" opacity="0.8"/>
        <circle cx="300" cy="220" r="18" fill="#062e24"/>
      `
    },
    // Estilo 3: Arcoíris retro geométrico sobre carbón
    {
      bg1: "#18181b", bg2: "#09090b",
      accent: "#e5a93b", secondary: "#a855f7",
      pattern: (acc, sec) => `
        <path d="M 120 340 A 180 180 0 0 1 480 340" fill="none" stroke="#ef4444" stroke-width="12" opacity="0.8"/>
        <path d="M 140 340 A 160 160 0 0 1 460 340" fill="none" stroke="#f97316" stroke-width="12" opacity="0.85"/>
        <path d="M 160 340 A 140 140 0 0 1 440 340" fill="none" stroke="#eab308" stroke-width="12" opacity="0.9"/>
        <path d="M 180 340 A 120 120 0 0 1 420 340" fill="none" stroke="#10b981" stroke-width="12" opacity="0.85"/>
        <path d="M 200 340 A 100 100 0 0 1 400 340" fill="none" stroke="#3b82f6" stroke-width="12" opacity="0.8"/>
        <path d="M 220 340 A 80 80 0 0 1 380 340" fill="none" stroke="${sec}" stroke-width="12" opacity="0.8"/>
      `
    },
    // Estilo 4: Sol naciente y cuadrícula retro
    {
      bg1: "#2e1065", bg2: "#170338",
      accent: "#f472b6", secondary: "#38bdf8",
      pattern: (acc, sec) => `
        <circle cx="300" cy="240" r="110" fill="${acc}" opacity="0.85"/>
        <line x1="80" y1="240" x2="520" y2="240" stroke="${sec}" stroke-width="2"/>
        <line x1="120" y1="280" x2="480" y2="280" stroke="${sec}" stroke-width="1.5" opacity="0.7"/>
        <line x1="160" y1="320" x2="440" y2="320" stroke="${sec}" stroke-width="1" opacity="0.5"/>
        <line x1="300" y1="240" x2="160" y2="380" stroke="${sec}" stroke-width="1.5" opacity="0.6"/>
        <line x1="300" y1="240" x2="440" y2="380" stroke="${sec}" stroke-width="1.5" opacity="0.6"/>
        <line x1="300" y1="240" x2="300" y2="380" stroke="${sec}" stroke-width="1.5" opacity="0.6"/>
      `
    },
    // Estilo 5: Prismas abstractos cobalto y oro
    {
      bg1: "#1e1b4b", bg2: "#0f0e26",
      accent: "#fbbf24", secondary: "#818cf8",
      pattern: (acc, sec) => `
        <polygon points="300,110 450,270 300,430 150,270" fill="none" stroke="${acc}" stroke-width="3"/>
        <polygon points="300,160 400,270 300,380 200,270" fill="none" stroke="${sec}" stroke-width="2" opacity="0.7"/>
        <circle cx="300" cy="270" r="45" fill="${acc}" opacity="0.8"/>
        <circle cx="300" cy="270" r="12" fill="#1e1b4b"/>
      `
    },
    // Estilo 6: Discos concéntricos con degradado cálido
    {
      bg1: "#431407", bg2: "#1a0602",
      accent: "#fb923c", secondary: "#fde047",
      pattern: (acc, sec) => `
        <circle cx="300" cy="250" r="160" fill="none" stroke="${acc}" stroke-width="8" stroke-dasharray="25 15"/>
        <circle cx="300" cy="250" r="110" fill="none" stroke="${sec}" stroke-width="5" stroke-dasharray="15 10"/>
        <circle cx="300" cy="250" r="60" fill="${acc}" opacity="0.9"/>
        <circle cx="300" cy="250" r="18" fill="#1a0602"/>
      `
    },
    // Estilo 7: Vintage Monocromo con acento esmeralda
    {
      bg1: "#132320", bg2: "#091210",
      accent: "#10b981", secondary: "#a7f3d0",
      pattern: (acc, sec) => `
        <rect x="150" y="130" width="300" height="240" fill="none" stroke="${sec}" stroke-width="3" opacity="0.5"/>
        <circle cx="300" cy="250" r="85" fill="${acc}" opacity="0.75"/>
        <line x1="150" y1="130" x2="450" y2="370" stroke="${sec}" stroke-width="1.5" opacity="0.4"/>
        <circle cx="300" cy="250" r="20" fill="#091210"/>
      `
    }
  ];

  const st = styles[Math.abs(styleIndex) % styles.length];
  const safeTitle = (title || "Vinilo").replace(/[<>&"]/g, '');
  const safeArtist = (artist || "Artista").replace(/[<>&"]/g, '');
  const safeGenre = (genre || "Música").replace(/[<>&"]/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="100%" height="100%">
    <defs>
      <linearGradient id="bgGrad_${styleIndex}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${st.bg1}" />
        <stop offset="100%" stop-color="${st.bg2}" />
      </linearGradient>
      <radialGradient id="ringLight" cx="50%" cy="50%" r="50%">
        <stop offset="65%" stop-color="transparent" />
        <stop offset="100%" stop-color="rgba(255,255,255,0.08)" />
      </radialGradient>
    </defs>
    
    <!-- Fondo y marco de la funda -->
    <rect width="600" height="600" fill="url(#bgGrad_${styleIndex})"/>
    <rect x="20" y="20" width="560" height="560" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
    <circle cx="300" cy="300" r="280" fill="url(#ringLight)"/>

    <!-- Motivo gráfico geométrico central -->
    ${st.pattern(st.accent, st.secondary)}

    <!-- Insignia de género y formato -->
    <rect x="44" y="44" width="130" height="26" rx="4" fill="rgba(0,0,0,0.4)" stroke="${st.accent}" stroke-width="1"/>
    <text x="109" y="61" fill="${st.accent}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" letter-spacing="1.5" text-anchor="middle">${safeGenre.toUpperCase()}</text>
    
    <text x="556" y="61" fill="rgba(255,255,255,0.5)" font-size="12" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" letter-spacing="2" text-anchor="end">12" LP • 33⅓ RPM</text>

    <!-- Información del producto con tipografía de portada de vinilo -->
    <rect x="36" y="440" width="528" height="124" rx="8" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="56" y="482" fill="#ffffff" font-size="28" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="800">${safeTitle.length > 28 ? safeTitle.substring(0, 26) + '...' : safeTitle}</text>
    <text x="56" y="515" fill="${st.accent}" font-size="17" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="600">${safeArtist}</text>
    <text x="56" y="542" fill="rgba(255,255,255,0.45)" font-size="12" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="500">EDICIÓN DE COLECCIÓN EN ALTA FIDELIDAD</text>
    <circle cx="530" cy="502" r="18" fill="none" stroke="${st.accent}" stroke-width="2"/>
    <polygon points="526,494 538,502 526,510" fill="${st.accent}"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Wrapper retrocompatible
function generateVinylSvgCover(title, artist, genre) {
  const hash = Math.abs((title + artist).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0));
  return generateGenericCoverSvg(title, artist, genre, hash % 8);
}

// ==========================================================================
// CATÁLOGO DEMO GENÉRICO INICIAL
// Precios en Pesos Chilenos (CLP) sin decimales y portadas vectoriales puras
// ==========================================================================
const DEFAULT_VINYLS = [
  {
    id: "vin-001",
    title: "Colección Clásica Vol. 1",
    artist: "Ensamble Acústico",
    genre: "Rock Clásico",
    year: 1980,
    label: "Sello Independiente",
    catalogNumber: "GEN-101",
    format: "12\" LP",
    weight: "180g Audiophile",
    rpm: "33 ⅓ RPM",
    condition: "Mint (M)",
    price: 28990,
    stock: 5,
    status: "in_stock",
    coverImage: generateGenericCoverSvg("Colección Clásica Vol. 1", "Ensamble Acústico", "Rock Clásico", 0),
    discColor: "#111111",
    featured: true,
    description: "Edición genérica prensada en vinilo virgen de 180 gramos. Excelente respuesta dinámica de frecuencias y sonido analógico cálido.",
    tracklist: [
      { side: "A", title: "Pista de Apertura", duration: "4:12" },
      { side: "A", title: "Ritmo Moderado", duration: "3:45" },
      { side: "A", title: "Tema Melódico", duration: "5:02" },
      { side: "B", title: "Frecuencia Serena", duration: "4:30" },
      { side: "B", title: "Cierre Acústico", duration: "3:58" }
    ]
  },
  {
    id: "vin-002",
    title: "Sesiones de Jazz Nocturno",
    artist: "Cuarteto de Medianoche",
    genre: "Jazz",
    year: 1975,
    label: "Discos de Jazz",
    catalogNumber: "GEN-202",
    format: "12\" LP Gatefold",
    weight: "180g Audiophile",
    rpm: "33 ⅓ RPM",
    condition: "Near Mint (NM)",
    price: 34990,
    stock: 4,
    status: "in_stock",
    coverImage: generateGenericCoverSvg("Sesiones de Jazz Nocturno", "Cuarteto de Medianoche", "Jazz", 1),
    discColor: "#1e293b",
    featured: true,
    description: "Sesión instrumental de vientos, contrabajo y piano acústico grabada en directo en cinta analógica.",
    tracklist: [
      { side: "A", title: "Improvisación en Si Menor", duration: "6:15" },
      { side: "A", title: "Caminata Urbana", duration: "4:50" },
      { side: "B", title: "Balada para Contrabajo", duration: "5:40" },
      { side: "B", title: "Final Sincopado", duration: "7:10" }
    ]
  },
  {
    id: "vin-003",
    title: "Frecuencias & Sintetizadores",
    artist: "Laboratorio Electrónico",
    genre: "Electrónica & Disco",
    year: 1984,
    label: "Módulo Sonoro",
    catalogNumber: "GEN-303",
    format: "2xLP Gatefold",
    weight: "180g Doble Vinilo",
    rpm: "33 ⅓ RPM",
    condition: "Mint (M)",
    price: 38990,
    stock: 3,
    status: "in_stock",
    coverImage: generateGenericCoverSvg("Frecuencias & Sintetizadores", "Laboratorio Electrónico", "Electrónica & Disco", 2),
    discColor: "#f5c563",
    featured: true,
    description: "Paisajes sonoros generados con sintetizadores modulares analógicos clásicos y cajas de ritmo vintage.",
    tracklist: [
      { side: "A", title: "Secuencia Cero", duration: "5:20" },
      { side: "A", title: "Ondas Moduladas", duration: "4:45" },
      { side: "B", title: "Polirritmia Analógica", duration: "6:10" },
      { side: "B", title: "Espacio Profundo", duration: "5:00" }
    ]
  },
  {
    id: "vin-004",
    title: "Groove Rítmico & Metales",
    artist: "Colectivo Funk",
    genre: "Soul & R&B",
    year: 1978,
    label: "Groove Studio",
    catalogNumber: "GEN-404",
    format: "12\" LP",
    weight: "180g Remaster",
    rpm: "33 ⅓ RPM",
    condition: "Very Good Plus (VG+)",
    price: 27500,
    stock: 6,
    status: "in_stock",
    coverImage: generateGenericCoverSvg("Groove Rítmico & Metales", "Colectivo Funk", "Soul & R&B", 3),
    discColor: "#111111",
    featured: false,
    description: "Líneas de bajo con cuerpo, sección de metales brillante y baterías con compás marcado.",
    tracklist: [
      { side: "A", title: "Pulso Constante", duration: "3:55" },
      { side: "A", title: "Metales en Fuga", duration: "4:15" },
      { side: "B", title: "Melodía de Oro", duration: "4:40" },
      { side: "B", title: "Despedida Soul", duration: "3:30" }
    ]
  },
  {
    id: "vin-005",
    title: "Ecos del Folklore & Cuerdas",
    artist: "Ensamble del Sur",
    genre: "Rock Latino",
    year: 1992,
    label: "Producción Continental",
    catalogNumber: "GEN-505",
    format: "12\" LP",
    weight: "140g Estándar",
    rpm: "33 ⅓ RPM",
    condition: "Near Mint (NM)",
    price: 31990,
    stock: 2,
    status: "low_stock",
    coverImage: generateGenericCoverSvg("Ecos del Folklore & Cuerdas", "Ensamble del Sur", "Rock Latino", 4),
    discColor: "#b45309",
    featured: true,
    description: "Fusión de guitarras acústicas, percusión tradicional y armonías instrumentales representativas.",
    tracklist: [
      { side: "A", title: "Viento de la Cordillera", duration: "4:30" },
      { side: "A", title: "Río Manso", duration: "3:50" },
      { side: "B", title: "Chacarera Instrumental", duration: "3:40" },
      { side: "B", title: "Sol de la Tarde", duration: "5:10" }
    ]
  },
  {
    id: "vin-006",
    title: "Sinfonía Contemporánea",
    artist: "Orquesta Filarmónica Moderna",
    genre: "Instrumental",
    year: 2005,
    label: "Opus Sonora",
    catalogNumber: "GEN-606",
    format: "12\" LP Gatefold",
    weight: "180g Audiophile",
    rpm: "33 ⅓ RPM",
    condition: "Mint (M)",
    price: 36990,
    stock: 4,
    status: "in_stock",
    coverImage: generateGenericCoverSvg("Sinfonía Contemporánea", "Orquesta Filarmónica Moderna", "Instrumental", 5),
    discColor: "#1e1b4b",
    featured: false,
    description: "Composiciones para cuerdas, maderas y percusión sinfónica con arreglos modernos y amplio rango dinámico.",
    tracklist: [
      { side: "A", title: "Movimiento I - Amanecer", duration: "7:40" },
      { side: "A", title: "Movimiento II - Coral", duration: "6:20" },
      { side: "B", title: "Movimiento III - Scherzo", duration: "5:15" },
      { side: "B", title: "Movimiento IV - Coda", duration: "8:30" }
    ]
  },
  {
    id: "vin-007",
    title: "Baladas Acústicas de Salón",
    artist: "Trío de Guitarras",
    genre: "Pop & Acústico",
    year: 1988,
    label: "Acústica Independiente",
    catalogNumber: "GEN-707",
    format: "12\" LP",
    weight: "140g Estándar",
    rpm: "33 ⅓ RPM",
    condition: "Very Good Plus (VG+)",
    price: 24990,
    stock: 5,
    status: "in_stock",
    coverImage: generateGenericCoverSvg("Baladas Acústicas de Salón", "Trío de Guitarras", "Pop & Acústico", 6),
    discColor: "#111111",
    featured: false,
    description: "Arreglos íntimos para guitarras de seis cuerdas y bajo acústico. Atmósfera cálida para tocadiscos de salón.",
    tracklist: [
      { side: "A", title: "Luz de Lámpara", duration: "3:40" },
      { side: "A", title: "Susurro Acústico", duration: "4:05" },
      { side: "B", title: "Paseo Lluvioso", duration: "4:25" },
      { side: "B", title: "Tema Final", duration: "3:15" }
    ]
  },
  {
    id: "vin-008",
    title: "Ritmos Tropicales & Raíces",
    artist: "Orquesta del Mar",
    genre: "Mundo & Tradicional",
    year: 1982,
    label: "Discos Costeros",
    catalogNumber: "GEN-808",
    format: "12\" LP",
    weight: "180g Remaster",
    rpm: "33 ⅓ RPM",
    condition: "Near Mint (NM)",
    price: 29990,
    stock: 3,
    status: "in_stock",
    coverImage: generateGenericCoverSvg("Ritmos Tropicales & Raíces", "Orquesta del Mar", "Mundo & Tradicional", 7),
    discColor: "#042f2e",
    featured: false,
    description: "Percusiones tradicionales, congas, timbales y piano acústico capturados con calidez en cinta análoga.",
    tracklist: [
      { side: "A", title: "Amanecer Costero", duration: "4:50" },
      { side: "A", title: "Sabor de Calle", duration: "4:10" },
      { side: "B", title: "Son de Medianoche", duration: "5:20" },
      { side: "B", title: "Descarga Rítmica", duration: "6:00" }
    ]
  }
];

const DEFAULT_SETTINGS = {
  storeName: "Hitway",
  storeSubtitle: "Catálogo de Música y Libros",
  currency: "$",
  currencyCode: "CLP",
  adminPin: "1234",
  kioskLock: false,
  sheetUrl: DEFAULT_SHEET_URL
};

// ==========================================================================
// CAPA INDEXEDDB CON MIGRACIÓN A CATÁLOGO GENÉRICO
// ==========================================================================

class VinylStorage {
  constructor() {
    this.db = null;
    this.isIndexedDBSupported = typeof indexedDB !== 'undefined';
  }

  async init() {
    if (!this.isIndexedDBSupported) {
      this.initLocalStorageFallback();
      return true;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_VINYLS)) {
          const vinylStore = db.createObjectStore(STORE_VINYLS, { keyPath: 'id' });
          vinylStore.createIndex('genre', 'genre', { unique: false });
          vinylStore.createIndex('artist', 'artist', { unique: false });
          vinylStore.createIndex('price', 'price', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };

      request.onsuccess = async (e) => {
        this.db = e.target.result;
        const count = await this.countVinyls();
        const all = await this.getAllVinyls();
        
        // Comprobar si hay álbumes antiguos o precios en formato decimal para migrarlos a CLP
        const hasCommercialAlbums = all.some(v => 
          (v.title && (v.title.includes('Dark Side') || v.title.includes('Kind of Blue') || v.title.includes('Random Access'))) ||
          (v.coverImage && v.coverImage.includes('unsplash.com'))
        );
        const hasOldDecimalPrices = all.some(v => v.price && v.price < 500);

        if (count === 0 || hasCommercialAlbums || hasOldDecimalPrices) {
          console.log("Inicializando catálogo genérico de vinilos con precios en Pesos Chilenos (CLP)...");
          await this.resetDefaults();
        }
        resolve(true);
      };

      request.onerror = (e) => {
        console.error("Error al abrir IndexedDB:", e);
        this.initLocalStorageFallback();
        resolve(true);
      };
    });
  }

  initLocalStorageFallback() {
    const stored = localStorage.getItem('retrogroove_vinyls');
    let needsReset = !stored;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.some(v => (v.coverImage && v.coverImage.includes('unsplash.com')) || (v.price && v.price < 500))) {
          needsReset = true;
        }
      } catch (err) {
        needsReset = true;
      }
    }
    if (needsReset) {
      localStorage.setItem('retrogroove_vinyls', JSON.stringify(DEFAULT_VINYLS));
    }
    if (!localStorage.getItem('retrogroove_settings')) {
      localStorage.setItem('retrogroove_settings', JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  async countVinyls() {
    if (!this.db) {
      const stored = localStorage.getItem('retrogroove_vinyls');
      return stored ? JSON.parse(stored).length : 0;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_VINYLS, 'readonly');
      const store = tx.objectStore(STORE_VINYLS);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  }

  async getAllVinyls() {
    if (!this.db) {
      const data = localStorage.getItem('retrogroove_vinyls');
      return data ? JSON.parse(data) : [...DEFAULT_VINYLS];
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_VINYLS, 'readonly');
      const store = tx.objectStore(STORE_VINYLS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async getVinylById(id) {
    if (!this.db) {
      const all = await this.getAllVinyls();
      return all.find(v => v.id === id) || null;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_VINYLS, 'readonly');
      const store = tx.objectStore(STORE_VINYLS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async putVinyl(vinyl) {
    if (!this.db) {
      const all = await this.getAllVinyls();
      const index = all.findIndex(v => v.id === vinyl.id);
      if (index >= 0) {
        all[index] = vinyl;
      } else {
        all.unshift(vinyl);
      }
      localStorage.setItem('retrogroove_vinyls', JSON.stringify(all));
      return vinyl;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_VINYLS, 'readwrite');
      const store = tx.objectStore(STORE_VINYLS);
      const req = store.put(vinyl);
      req.onsuccess = () => resolve(vinyl);
      req.onerror = (e) => reject(e);
    });
  }

  async deleteVinyl(id) {
    if (!this.db) {
      let all = await this.getAllVinyls();
      all = all.filter(v => v.id !== id);
      localStorage.setItem('retrogroove_vinyls', JSON.stringify(all));
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_VINYLS, 'readwrite');
      const store = tx.objectStore(STORE_VINYLS);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  async replaceVinyls(vinyls) {
    if (!this.db) {
      localStorage.setItem('retrogroove_vinyls', JSON.stringify(vinyls));
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_VINYLS, 'readwrite');
      const store = tx.objectStore(STORE_VINYLS);
      store.clear();
      vinyls.forEach(vinyl => store.put(vinyl));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el catálogo sincronizado.'));
      tx.onabort = () => reject(tx.error || new Error('Se canceló la actualización del catálogo.'));
    });
  }

  async syncFromGoogleSheet(sheetUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(sheetUrl);
    } catch {
      throw new Error('La URL de Google Sheets no es válida.');
    }
    const sheetMatch = parsedUrl.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (parsedUrl.hostname !== 'docs.google.com' || !sheetMatch) {
      throw new Error('Ingresa una URL válida de Google Sheets.');
    }

    const gid = parsedUrl.searchParams.get('gid') || parsedUrl.hash.match(/gid=(\d+)/)?.[1] || '0';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetMatch[1])}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    const response = await fetch(csvUrl, { cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Google no permite leer la hoja. Compártela como "Cualquier persona con el enlace" y permiso de lector.');
      }
      throw new Error(`Google Sheets respondió con el error ${response.status}.`);
    }

    const csv = await response.text();
    if (/^\s*<!doctype html|^\s*<html/i.test(csv)) {
      throw new Error('Google devolvió una página en vez de la hoja. Comprueba que esté compartida como "Cualquier persona con el enlace".');
    }

    const importedProducts = parseSheetProducts(csv);
    const existingVinyls = await this.getAllVinyls();
    const existingBySku = new Map(existingVinyls.map(vinyl => [String(vinyl.sku || vinyl.catalogNumber || '').trim(), vinyl]));
    const productsWithoutPrice = importedProducts.filter(product => product.price === null).length;
    const vinyls = importedProducts.map((product, index) => {
      const existing = existingBySku.get(product.sku);
      const [artistPart, ...titleParts] = product.name.replace(/\s*\|\s*VINILO\s*$/i, '').split(/\s+-\s+/);
      const artist = titleParts.length ? artistPart.trim() : 'Vinilos Munita';
      const title = titleParts.length ? titleParts.join(' - ').trim() : artistPart.trim();
      const coverImage = product.images[0] || existing?.coverImage ||
        generateGenericCoverSvg(title, artist, existing?.genre || 'Vinilos', index);
      const stock = existing ? Number(existing.stock) || 0 : 1;

      return {
        ...(existing || {}),
        id: existing?.id || `sheet-${product.sku}`,
        sku: product.sku,
        title,
        artist,
        catalogNumber: product.sku,
        price: product.price,
        stock,
        status: stock <= 0 ? 'out_of_stock' : (stock <= 2 ? 'low_stock' : 'in_stock'),
        genre: existing?.genre || 'Vinilos',
        year: existing?.year || new Date().getFullYear(),
        label: existing?.label || 'Vinilos Munita',
        format: existing?.format || '12" LP',
        weight: existing?.weight || '180g',
        rpm: existing?.rpm || '33 ⅓ RPM',
        condition: existing?.condition || 'Nuevo',
        featured: existing?.featured || false,
        coverImage,
        images: product.images,
        description: existing?.description || `SKU: ${product.sku}`,
        tracklist: existing?.tracklist || []
      };
    });

    await this.replaceVinyls(vinyls);
    return { count: vinyls.length, productsWithoutPrice };
  }

  async resetDefaults() {
    if (!this.db) {
      localStorage.setItem('retrogroove_vinyls', JSON.stringify(DEFAULT_VINYLS));
      localStorage.setItem('retrogroove_settings', JSON.stringify(DEFAULT_SETTINGS));
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_VINYLS, STORE_SETTINGS], 'readwrite');
      const vinylStore = tx.objectStore(STORE_VINYLS);
      const clearReq = vinylStore.clear();

      clearReq.onsuccess = async () => {
        for (const item of DEFAULT_VINYLS) {
          vinylStore.put(item);
        }
        await this.saveSetting('storeSettings', DEFAULT_SETTINGS);
        resolve(true);
      };
      clearReq.onerror = (e) => reject(e);
    });
  }

  async getSettings() {
    if (!this.db) {
      const s = localStorage.getItem('retrogroove_settings');
      return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_SETTINGS };
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_SETTINGS, 'readonly');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.get('storeSettings');
      req.onsuccess = () => resolve({ ...DEFAULT_SETTINGS, ...(req.result ? req.result.value : {}) });
      req.onerror = () => resolve({ ...DEFAULT_SETTINGS });
    });
  }

  async saveSetting(key, value) {
    if (!this.db) {
      localStorage.setItem('retrogroove_settings', JSON.stringify(value));
      return value;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(value);
      req.onerror = (e) => reject(e);
    });
  }

  async exportJSON() {
    const vinyls = await this.getAllVinyls();
    const settings = await this.getSettings();
    const payload = {
      version: 2,
      exportDate: new Date().toISOString(),
      store: settings.storeName || "Catálogo de Vinilos",
      vinylCount: vinyls.length,
      settings,
      vinyls
    };
    return JSON.stringify(payload, null, 2);
  }

  async importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.vinyls || !Array.isArray(data.vinyls)) {
        throw new Error("El archivo JSON no contiene un catálogo válido de vinilos.");
      }
      for (const v of data.vinyls) {
        if (!v.id) v.id = 'vin-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        await this.putVinyl(v);
      }
      if (data.settings) {
        await this.saveSetting('storeSettings', { ...DEFAULT_SETTINGS, ...data.settings });
      }
      return { success: true, count: data.vinyls.length };
    } catch (err) {
      console.error("Error al importar JSON:", err);
      return { success: false, error: err.message };
    }
  }
}

// ==========================================================================
// COMPRESOR Y PROCESADOR DE IMÁGENES
// ==========================================================================
async function compressImageFile(file, maxDimension = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const webpData = canvas.toDataURL('image/webp', quality);
          if (webpData.startsWith('data:image/webp')) {
            resolve(webpData);
            return;
          }
        } catch (err) {}
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error("No se pudo procesar la imagen seleccionada."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Error leyendo el archivo."));
    reader.readAsDataURL(file);
  });
}

// Validar que una URL cargue una imagen real
function testImageUrl(url) {
  return new Promise((resolve) => {
    if (!url || !url.trim()) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url.trim();
  });
}

// Instancia global
const DB = new VinylStorage();

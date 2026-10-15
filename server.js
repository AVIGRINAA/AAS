const express = require('express');
const axios = require('axios');
const ftp = require('basic-ftp');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const path = require('path');

const app = express();
app.use(express.json({ limit: '500mb' }));
const PORT = 3000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
});

// ─── Chain configurations ─────────────────────────────────────────────
const CHAINS = [
  {
    id: 'rami_levy',
    name: 'רמי לוי',
    chainId: '7290058140886',
    system: 'cerberus',
    ftpHost: 'url.retail.publishedprices.co.il',
    ftpUser: 'RamiLevi',
    website: 'https://url.publishedprices.co.il/login',
    websiteUser: 'RamiLevi',
    color: '#E74C3C',
  },
  {
    id: 'osher_ad',
    name: 'אושר עד',
    chainId: '7290103152017',
    system: 'cerberus',
    ftpHost: 'url.retail.publishedprices.co.il',
    ftpUser: 'osherad',
    website: 'https://url.publishedprices.co.il/login',
    websiteUser: 'osherad',
    color: '#3498DB',
  },
  {
    id: 'shefa_birkat_hashem',
    name: 'שפע ברכת השם',
    chainId: '7290058134977',
    system: 'bina',
    urlPrefix: 'shefabirkathashem',
    website: 'http://shefabirkathashem.binaprojects.com/Main.aspx',
    color: '#2ECC71',
  },
  {
    id: 'shuk_hair',
    name: 'שוק העיר',
    chainId: '7290058148776',
    system: 'bina',
    urlPrefix: 'shuk-hayir',
    website: 'http://shuk-hayir.binaprojects.com/Main.aspx',
    color: '#F39C12',
  },
  {
    id: 'netiv_hased',
    name: 'יש חסד',
    chainId: '7290058160839',
    system: 'web',
    url: 'https://app.netiv-hesed.com/',
    website: 'https://app.netiv-hesed.com/',
    color: '#9B59B6',
  },
];

const BNEI_BRAK_PATTERNS = ['בני ברק', 'בני-ברק', 'bnei brak', 'bnei-brak'];

function isBneiBrak(city) {
  if (!city) return false;
  const lower = city.toLowerCase().trim();
  return BNEI_BRAK_PATTERNS.some(p => lower.includes(p));
}

// ─── Cerberus (FTP) ──────────────────────────────────────────────────
async function fetchCerberusStores(chain) {
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: chain.ftpHost,
      user: chain.ftpUser,
      password: '',
      secure: false,
    });
    const files = await client.list();
    const storesFile = files.find(f => /stores/i.test(f.name) && f.name.endsWith('.xml'));
    if (!storesFile) throw new Error('Stores file not found');

    const chunks = [];
    await client.downloadTo(storesFile.name, path.join('/tmp', storesFile.name));
    const fs = require('fs');
    const raw = fs.readFileSync(path.join('/tmp', storesFile.name), 'utf-8');
    fs.unlinkSync(path.join('/tmp', storesFile.name));

    const parsed = xmlParser.parse(raw);
    const storeList = parsed.Stores?.Store || [];
    const stores = (Array.isArray(storeList) ? storeList : [storeList])
      .filter(s => isBneiBrak(s.City))
      .map(s => ({
        chainId: chain.chainId,
        chainName: chain.name,
        storeId: String(s.StoreId || ''),
        storeName: s.StoreName || '',
        address: s.Address || '',
        city: s.City || '',
        zipCode: s.ZipCode || '',
        subChainId: String(s.SubChainId || ''),
      }));

    client.close();
    return stores;
  } catch (err) {
    client.close();
    throw err;
  }
}

async function fetchCerberusPrices(chain, storeId) {
  const client = new ftp.Client(60000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: chain.ftpHost,
      user: chain.ftpUser,
      password: '',
      secure: false,
    });
    const files = await client.list();
    // Find latest PriceFull file for this store
    const priceFiles = files
      .filter(f => /pricef/i.test(f.name) && f.name.includes(storeId))
      .sort((a, b) => (b.name > a.name ? 1 : -1));
    if (priceFiles.length === 0) throw new Error(`No price file for store ${storeId}`);

    const fileName = priceFiles[0].name;
    const tmpPath = path.join('/tmp', fileName);
    await client.downloadTo(tmpPath, fileName);
    client.close();

    const fs = require('fs');
    let raw = fs.readFileSync(tmpPath);
    if (fileName.endsWith('.gz')) {
      raw = zlib.gunzipSync(raw);
    }
    fs.unlinkSync(tmpPath);

    const parsed = xmlParser.parse(raw.toString('utf-8'));
    const items = parsed.Prices?.Item || [];
    const itemList = Array.isArray(items) ? items : [items];

    return itemList.map(item => ({
      itemCode: String(item.ItemCode || ''),
      itemName: item.ItemName || '',
      manufacturer: item.ManufacturerName || '',
      itemPrice: parseFloat(item.ItemPrice) || 0,
      unitPrice: parseFloat(item.UnitOfMeasurePrice) || 0,
      unitQty: item.UnitQty || '',
      unitOfMeasure: item.UnitOfMeasure || '',
      updateDate: item.ItemUpdateDate || '',
      isWeighted: item.bIsWeighted === '1' || item.bIsWeighted === 'true',
    }));
  } catch (err) {
    client.close();
    throw err;
  }
}

// ─── Bina (HTTP/ASPX) ─────────────────────────────────────────────────
async function fetchBinaFileList(chain, fileTypeId) {
  const baseUrl = `http://${chain.urlPrefix}.binaprojects.com`;
  const url = `${baseUrl}/MainIO_Hok.aspx?_=${chain.chainId}&wReshet=הכל&WFileType=${fileTypeId}&WDate=&WStore=`;
  const response = await axios.get(url, { timeout: 30000 });
  return response.data;
}

async function fetchBinaStores(chain) {
  // fileTypeId 1 = Stores
  const files = await fetchBinaFileList(chain, 1);
  if (!files || files.length === 0) throw new Error('No stores files found');

  const storeFile = files[0];
  const baseUrl = `http://${chain.urlPrefix}.binaprojects.com`;
  const downloadUrl = `${baseUrl}/Download.aspx?FileNm=${storeFile.FileNm}`;

  // Resolve the actual download URL
  const resolveResponse = await axios.get(downloadUrl, { timeout: 30000 });
  const spath = resolveResponse.data[0]?.SPath;
  if (!spath) throw new Error('Could not resolve store file URL');

  const fileResponse = await axios.get(spath, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  let buf = Buffer.from(fileResponse.data);
  if (storeFile.FileNm.endsWith('.gz')) {
    buf = zlib.gunzipSync(buf);
  }

  const parsed = xmlParser.parse(buf.toString('utf-8'));
  const storeList = parsed.Stores?.Store || [];
  const stores = (Array.isArray(storeList) ? storeList : [storeList])
    .filter(s => isBneiBrak(s.City))
    .map(s => ({
      chainId: chain.chainId,
      chainName: chain.name,
      storeId: String(s.StoreId || ''),
      storeName: s.StoreName || '',
      address: s.Address || '',
      city: s.City || '',
      zipCode: s.ZipCode || '',
      subChainId: String(s.SubChainId || ''),
    }));

  return stores;
}

async function fetchBinaPrices(chain, storeId) {
  // fileTypeId 4 = PriceFull
  const files = await fetchBinaFileList(chain, 4);
  const storeFiles = files.filter(f => f.FileNm.includes(storeId));
  if (storeFiles.length === 0) throw new Error(`No price file for store ${storeId}`);

  const file = storeFiles[0];
  const baseUrl = `http://${chain.urlPrefix}.binaprojects.com`;
  const downloadUrl = `${baseUrl}/Download.aspx?FileNm=${file.FileNm}`;

  const resolveResponse = await axios.get(downloadUrl, { timeout: 30000 });
  const spath = resolveResponse.data[0]?.SPath;
  if (!spath) throw new Error('Could not resolve price file URL');

  const fileResponse = await axios.get(spath, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  let buf = Buffer.from(fileResponse.data);
  if (file.FileNm.endsWith('.gz')) {
    buf = zlib.gunzipSync(buf);
  }

  const parsed = xmlParser.parse(buf.toString('utf-8'));
  const items = parsed.Prices?.Item || [];
  const itemList = Array.isArray(items) ? items : [items];

  return itemList.map(item => ({
    itemCode: String(item.ItemCode || ''),
    itemName: item.ItemName || '',
    manufacturer: item.ManufacturerName || '',
    itemPrice: parseFloat(item.ItemPrice) || 0,
    unitPrice: parseFloat(item.UnitOfMeasurePrice) || 0,
    unitQty: item.UnitQty || '',
    unitOfMeasure: item.UnitOfMeasure || '',
    updateDate: item.ItemUpdateDate || '',
    isWeighted: item.bIsWeighted === '1' || item.bIsWeighted === 'true',
  }));
}

// ─── Netiv Hased (Web scraping) ──────────────────────────────────────
async function fetchNetivHasedFileList(chain) {
  const today = new Date().toISOString().split('T')[0];
  const url = `${chain.url}?Date=${today}`;
  const response = await axios.get(url, { timeout: 30000 });
  const html = response.data;

  // Extract file links from HTML table
  const linkRegex = /href="([^"]*\.(?:xml|gz))"/gi;
  const links = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({
      url: match[1].startsWith('http') ? match[1] : `${chain.url}${match[1]}`,
      name: match[1].split('/').pop(),
    });
  }
  return links;
}

async function fetchNetivHasedStores(chain) {
  const files = await fetchNetivHasedFileList(chain);
  const storesFile = files.find(f => /stores/i.test(f.name));
  if (!storesFile) throw new Error('Stores file not found');

  const response = await axios.get(storesFile.url, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  let buf = Buffer.from(response.data);
  if (storesFile.name.endsWith('.gz')) {
    buf = zlib.gunzipSync(buf);
  }

  const parsed = xmlParser.parse(buf.toString('utf-8'));
  const storeList = parsed.Stores?.Store || [];
  const stores = (Array.isArray(storeList) ? storeList : [storeList])
    .filter(s => isBneiBrak(s.City))
    .map(s => ({
      chainId: chain.chainId,
      chainName: chain.name,
      storeId: String(s.StoreId || ''),
      storeName: s.StoreName || '',
      address: s.Address || '',
      city: s.City || '',
      zipCode: s.ZipCode || '',
      subChainId: String(s.SubChainId || ''),
    }));

  return stores;
}

async function fetchNetivHasedPrices(chain, storeId) {
  const files = await fetchNetivHasedFileList(chain);
  const priceFiles = files
    .filter(f => /pricef/i.test(f.name) && f.name.includes(storeId))
    .sort((a, b) => (b.name > a.name ? 1 : -1));
  if (priceFiles.length === 0) throw new Error(`No price file for store ${storeId}`);

  const file = priceFiles[0];
  const response = await axios.get(file.url, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  let buf = Buffer.from(response.data);
  if (file.name.endsWith('.gz')) {
    buf = zlib.gunzipSync(buf);
  }

  const parsed = xmlParser.parse(buf.toString('utf-8'));
  const items = parsed.Prices?.Item || [];
  const itemList = Array.isArray(items) ? items : [items];

  return itemList.map(item => ({
    itemCode: String(item.ItemCode || ''),
    itemName: item.ItemName || '',
    manufacturer: item.ManufacturerName || '',
    itemPrice: parseFloat(item.ItemPrice) || 0,
    unitPrice: parseFloat(item.UnitOfMeasurePrice) || 0,
    unitQty: item.UnitQty || '',
    unitOfMeasure: item.UnitOfMeasure || '',
    updateDate: item.ItemUpdateDate || '',
    isWeighted: item.bIsWeighted === '1' || item.bIsWeighted === 'true',
  }));
}

// ─── Generic fetch dispatcher ─────────────────────────────────────────
async function fetchStores(chain) {
  switch (chain.system) {
    case 'cerberus': return fetchCerberusStores(chain);
    case 'bina': return fetchBinaStores(chain);
    case 'web': return fetchNetivHasedStores(chain);
    default: throw new Error(`Unknown system: ${chain.system}`);
  }
}

async function fetchPrices(chain, storeId) {
  switch (chain.system) {
    case 'cerberus': return fetchCerberusPrices(chain, storeId);
    case 'bina': return fetchBinaPrices(chain, storeId);
    case 'web': return fetchNetivHasedPrices(chain, storeId);
    default: throw new Error(`Unknown system: ${chain.system}`);
  }
}

// ─── API endpoints ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/chains', (req, res) => {
  res.json(CHAINS.map(c => ({
    id: c.id,
    name: c.name,
    chainId: c.chainId,
    system: c.system,
    website: c.website,
    color: c.color,
  })));
});

app.post('/api/update/:chainId', async (req, res) => {
  const chain = CHAINS.find(c => c.id === req.params.chainId);
  if (!chain) return res.status(404).json({ error: 'Chain not found' });

  try {
    const stores = await fetchStores(chain);
    if (stores.length === 0) {
      return res.json({
        chain: chain.name,
        stores: [],
        prices: {},
        message: 'לא נמצאו סניפים בבני ברק',
      });
    }

    const prices = {};
    for (const store of stores) {
      try {
        const items = await fetchPrices(chain, store.storeId);
        prices[store.storeId] = items;
      } catch (err) {
        console.error(`Error fetching prices for ${chain.name} store ${store.storeId}:`, err.message);
        prices[store.storeId] = { error: err.message };
      }
    }

    res.json({
      chain: chain.name,
      chainId: chain.chainId,
      stores,
      prices,
      updateDate: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Update failed for ${chain.name}:`, err.message);
    res.status(500).json({
      error: err.message,
      hint: `ניתן להוריד קבצים ידנית מ: ${chain.website}`,
    });
  }
});

app.post('/api/update', async (req, res) => {
  const chainIds = req.body.chains || CHAINS.map(c => c.id);
  const results = {};

  for (const chainId of chainIds) {
    const chain = CHAINS.find(c => c.id === chainId);
    if (!chain) continue;
    try {
      const stores = await fetchStores(chain);
      const prices = {};
      for (const store of stores) {
        try {
          prices[store.storeId] = await fetchPrices(chain, store.storeId);
        } catch (err) {
          prices[store.storeId] = { error: err.message };
        }
      }
      results[chainId] = {
        chain: chain.name,
        chainId: chain.chainId,
        stores,
        prices,
        updateDate: new Date().toISOString(),
      };
    } catch (err) {
      results[chainId] = { error: err.message };
    }
  }

  res.json(results);
});

// ─── Static files ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Supermarket price comparison app running on port ${PORT}`);
});

// ─── XML / Gzip parser (browser-side) ────────────────────────────────
window.Parser = (function () {

  async function decompressGzip(file) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const stream = file.stream().pipeThrough(ds);
      return await new Response(stream).text();
    }
    // Fallback: no DecompressionStream — can't decompress
    throw new Error('הדפדפן לא תומך בפתיחת קבצים דחוסים (.gz). נא לחלץ את הקובץ ל-XML תחילה.');
  }

  async function readFile(file) {
    if (file.name.endsWith('.gz')) {
      return await decompressGzip(file);
    }
    return await file.text();
  }

  function parseXml(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    // Check for parse errors
    if (doc.querySelector('parsererror')) {
      throw new Error('שגיאה בפענוח קובץ ה-XML');
    }

    return doc;
  }

  function extractStores(doc, chainName, chainId) {
    const stores = [];
    const storeNodes = doc.querySelectorAll('Store');
    storeNodes.forEach(node => {
      const city = getText(node, 'City');
      stores.push({
        key: `${chainId}_${getText(node, 'StoreId')}`,
        chainId: chainId,
        chainName: chainName,
        storeId: getText(node, 'StoreId'),
        storeName: getText(node, 'StoreName'),
        address: getText(node, 'Address'),
        city: city,
        zipCode: getText(node, 'ZipCode'),
        subChainId: getText(node, 'SubChainId'),
      });
    });
    return stores;
  }

  function extractPrices(doc, chainName, chainId, storeId, storeName) {
    const prices = [];
    const itemNodes = doc.querySelectorAll('Item');
    itemNodes.forEach(node => {
      const itemCode = getText(node, 'ItemCode');
      if (!itemCode) return;
      prices.push({
        key: `${chainId}_${storeId}_${itemCode}`,
        chainId: chainId,
        chainName: chainName,
        storeId: storeId,
        storeName: storeName,
        chainId_storeId: `${chainId}_${storeId}`,
        itemCode: itemCode,
        itemName: getText(node, 'ItemName'),
        manufacturer: getText(node, 'ManufacturerName'),
        itemPrice: parseFloat(getText(node, 'ItemPrice')) || 0,
        unitPrice: parseFloat(getText(node, 'UnitOfMeasurePrice')) || 0,
        unitQty: getText(node, 'UnitQty'),
        unitOfMeasure: getText(node, 'UnitOfMeasure'),
        updateDate: getText(node, 'ItemUpdateDate'),
        isWeighted: getText(node, 'bIsWeighted') === '1',
      });
    });
    return prices;
  }

  function getText(parent, tagName) {
    const el = parent.querySelector(tagName);
    return el ? el.textContent.trim() : '';
  }

  // Detect file type from name
  function detectFileType(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.includes('store')) return 'stores';
    if (lower.includes('pricef') || lower.includes('pricefull')) return 'prices_full';
    if (lower.includes('price')) return 'prices';
    if (lower.includes('promo')) return 'promos';
    return 'unknown';
  }

  return {
    readFile,
    parseXml,
    extractStores,
    extractPrices,
    detectFileType,
  };
})();

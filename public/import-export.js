// ─── Import / Export ─────────────────────────────────────────────────
window.ImportExport = (function () {

  async function handleImport(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const previewEl = document.getElementById('import-preview');
    previewEl.innerHTML = '';

    let totalStores = 0;
    let totalPrices = 0;
    const productsMap = new Map();

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.textContent = `מעבד: ${file.name}...`;
      previewEl.appendChild(item);

      try {
        const fileType = Parser.detectFileType(file.name);
        const content = await Parser.readFile(file);
        const doc = Parser.parseXml(content);

        if (fileType === 'stores') {
          // Try to detect chain from XML content
          const chainId = getTextFromDoc(doc, 'ChainId') || 'unknown';
          const chainName = guessChainName(file.name, chainId);
          const stores = Parser.extractStores(doc, chainName, chainId);
          await DB.bulkPut('stores', stores);
          totalStores += stores.length;
          item.textContent = `✓ ${file.name}: ${stores.length} סניפים`;
          item.style.background = '#d4edda';
        } else if (fileType === 'prices_full' || fileType === 'prices') {
          const chainId = getTextFromDoc(doc, 'ChainId') || 'unknown';
          const storeId = getTextFromDoc(doc, 'StoreId') || 'unknown';
          const chainName = guessChainName(file.name, chainId);
          const storeName = '';
          const prices = Parser.extractPrices(doc, chainName, chainId, storeId, storeName);
          await DB.bulkPut('prices', prices);
          totalPrices += prices.length;

          // Collect unique products
          for (const p of prices) {
            if (!productsMap.has(p.itemCode)) {
              productsMap.set(p.itemCode, {
                itemCode: p.itemCode,
                itemName: p.itemName,
                manufacturer: p.manufacturer,
                unitQty: p.unitQty,
                unitOfMeasure: p.unitOfMeasure,
              });
            }
          }

          item.textContent = `✓ ${file.name}: ${prices.length} מחירים`;
          item.style.background = '#d4edda';
        } else {
          item.textContent = `⚠ ${file.name}: סוג קובץ לא מזוהה`;
          item.style.background = '#fff3cd';
        }
      } catch (err) {
        item.textContent = `✗ ${file.name}: ${err.message}`;
        item.style.background = '#f8d7da';
      }
    }

    // Save products
    if (productsMap.size > 0) {
      await DB.bulkPut('products', Array.from(productsMap.values()));
    }

    // Save metadata
    if (totalStores > 0 || totalPrices > 0) {
      await DB.put('meta', {
        chainId: 'import',
        chainName: 'ייבוא ידני',
        lastUpdate: new Date().toISOString(),
        storeCount: totalStores,
        productCount: totalPrices,
      });
    }

    const summary = document.createElement('div');
    summary.className = 'preview-item';
    summary.style.background = '#d1ecf1';
    summary.style.fontWeight = '600';
    summary.textContent = `סיכום: ${totalStores} סניפים, ${totalPrices} מחירים`;
    previewEl.appendChild(summary);

    App.refreshStatus();
    Search.refreshCache();
  }

  async function exportData() {
    const stores = await DB.getAll('stores');
    const prices = await DB.getAll('prices');
    const products = await DB.getAll('products');
    const meta = await DB.getAll('meta');

    const data = {
      version: 1,
      exportDate: new Date().toISOString(),
      stores,
      prices,
      products,
      meta,
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supermarket-prices-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.stores) await DB.bulkPut('stores', data.stores);
      if (data.prices) await DB.bulkPut('prices', data.prices);
      if (data.products) await DB.bulkPut('products', data.products);
      if (data.meta) await DB.bulkPut('meta', data.meta);

      alert(`ייבוא הושלם: ${data.stores?.length || 0} סניפים, ${data.prices?.length || 0} מחירים, ${data.products?.length || 0} מוצרים`);
      App.refreshStatus();
      Search.refreshCache();
    } catch (err) {
      alert('שגיאה בייבוא: ' + err.message);
    }
  }

  async function clearAll() {
    if (!confirm('האם אתה בטוח? פעולה זו תמחק את כל הנתונים!')) return;
    await DB.clearAll();
    App.refreshStatus();
    Search.refreshCache();
    alert('כל הנתונים נמחקו');
  }

  function getTextFromDoc(doc, tagName) {
    const el = doc.querySelector(tagName);
    return el ? el.textContent.trim() : '';
  }

  function guessChainName(fileName, chainId) {
    const lower = fileName.toLowerCase();
    if (lower.includes('rami') || chainId === '7290058140886') return 'רמי לוי';
    if (lower.includes('osher') || chainId === '7290103152017') return 'אושר עד';
    if (lower.includes('shefa') || chainId === '7290058134977') return 'שפע ברכת השם';
    if (lower.includes('shuk') || chainId === '7290058148776') return 'שוק העיר';
    if (lower.includes('hesed') || lower.includes('netiv') || chainId === '7290058160839') return 'יש חסד';
    return chainId || 'לא ידוע';
  }

  return { handleImport, exportData, importJson, clearAll };
})();

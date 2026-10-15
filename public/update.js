// ─── Online Update ──────────────────────────────────────────────────
window.Update = (function () {
  let chains = [];
  let isOnline = false;

  async function init() {
    try {
      const res = await fetch('/api/health', { timeout: 5000 });
      isOnline = res.ok;
    } catch {
      isOnline = false;
    }

    const statusEl = document.getElementById('conn-status');
    statusEl.className = isOnline ? 'online' : 'offline';
    statusEl.title = isOnline ? 'מחובר לשרת' : 'לא מחובר - מצב אופליין';

    if (isOnline) {
      try {
        const res = await fetch('/api/chains');
        chains = await res.json();
      } catch {
        isOnline = false;
      }
    }

    renderChainList();
  }

  function renderChainList() {
    const el = document.getElementById('chain-list');
    if (!isOnline || chains.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <h2>עדכון אונליין לא זמין</h2>
          <p>האפליקציה פועלת במצב אופליין או שהשרת אינו זמין.</p>
          <p>ניתן לעדכן מחירים על ידי הורדה ידנית של קבצים מאתרי הרשתות וייבוא דרך לשונית "ייבוא / ייצוא".</p>
          <p style="margin-top:12px;">קישורים לאתרי הרשתות:</p>
          <p><a href="https://url.publishedprices.co.il/login" target="_blank">רמי לוי / אושר עד</a></p>
          <p><a href="http://shefabirkathashem.binaprojects.com/Main.aspx" target="_blank">שפע ברכת השם</a></p>
          <p><a href="http://shuk-hayir.binaprojects.com/Main.aspx" target="_blank">שוק העיר</a></p>
          <p><a href="https://app.netiv-hesed.com/" target="_blank">יש חסד</a></p>
        </div>`;
      document.getElementById('update-all-btn').disabled = true;
      return;
    }

    el.innerHTML = chains.map(c => `
      <div class="chain-item">
        <div class="chain-name">
          <span class="chain-dot" style="background:${c.color}"></span>
          ${c.name}
        </div>
        <div>
          <span class="chain-status" id="status-${c.id}">מוכן</span>
          <button class="update-btn" id="btn-${c.id}" onclick="Update.updateChain('${c.id}')">עדכן</button>
        </div>
      </div>`).join('');
  }

  async function updateChain(chainId) {
    const chain = chains.find(c => c.id === chainId);
    if (!chain) return;

    const btn = document.getElementById(`btn-${chainId}`);
    const status = document.getElementById(`status-${chainId}`);
    btn.disabled = true;
    status.textContent = 'מעדכן...';

    addProgress(`${chain.name}: מתחיל עדכון...`, 'loading');

    try {
      const res = await fetch(`/api/update/${chainId}`, { method: 'POST' });
      const data = await res.json();

      if (data.error) {
        status.textContent = 'שגיאה';
        addProgress(`${chain.name}: שגיאה - ${data.error}`, 'error');
        if (data.hint) addProgress(`💡 ${data.hint}`, 'error');
        btn.disabled = false;
        return;
      }

      // Save stores
      if (data.stores && data.stores.length > 0) {
        await DB.bulkPut('stores', data.stores);
        addProgress(`${chain.name}: נמצאו ${data.stores.length} סניפים בבני ברק`, 'success');
      } else {
        addProgress(`${chain.name}: לא נמצאו סניפים בבני ברק`, 'error');
        status.textContent = 'אין סניפים';
        btn.disabled = false;
        return;
      }

      // Save prices
      let totalProducts = 0;
      const allProducts = new Map();

      for (const store of data.stores) {
        const storePrices = data.prices[store.storeId];
        if (!storePrices || storePrices.error) {
          addProgress(`${chain.name} - ${store.storeName}: דילוג (שגיאה בהורדת מחירים)`, 'error');
          continue;
        }

        const priceRecords = storePrices.map(p => ({
          ...p,
          key: `${chain.chainId}_${store.storeId}_${p.itemCode}`,
          chainId: chain.chainId,
          chainName: chain.name,
          storeId: store.storeId,
          storeName: store.storeName,
          chainId_storeId: `${chain.chainId}_${store.storeId}`,
        }));

        await DB.bulkPut('prices', priceRecords);
        totalProducts += priceRecords.length;

        // Collect unique products
        for (const p of priceRecords) {
          if (!allProducts.has(p.itemCode)) {
            allProducts.set(p.itemCode, {
              itemCode: p.itemCode,
              itemName: p.itemName,
              manufacturer: p.manufacturer,
              unitQty: p.unitQty,
              unitOfMeasure: p.unitOfMeasure,
            });
          }
        }

        addProgress(`${chain.name} - ${store.storeName}: ${priceRecords.length} מוצרים`, 'success');
      }

      // Save products
      await DB.bulkPut('products', Array.from(allProducts.values()));

      // Save metadata
      await DB.put('meta', {
        chainId: chain.chainId,
        chainName: chain.name,
        lastUpdate: data.updateDate || new Date().toISOString(),
        storeCount: data.stores.length,
        productCount: totalProducts,
      });

      status.textContent = `עודכן (${totalProducts} מוצרים)`;
      addProgress(`${chain.name}: עדכון הושלם - ${totalProducts} מוצרים`, 'success');

      App.refreshStatus();
      Search.refreshCache();
    } catch (err) {
      status.textContent = 'שגיאה';
      addProgress(`${chain.name}: שגיאת תקשורת - ${err.message}`, 'error');
    }

    btn.disabled = false;
  }

  async function updateAll() {
    if (!isOnline || chains.length === 0) return;
    const btn = document.getElementById('update-all-btn');
    btn.disabled = true;
    btn.textContent = 'מעדכן...';

    for (const chain of chains) {
      await updateChain(chain.id);
    }

    btn.disabled = false;
    btn.textContent = 'עדכן הכל';
  }

  function addProgress(message, type) {
    const el = document.getElementById('update-progress');
    const item = document.createElement('div');
    item.className = `progress-item ${type}`;
    item.textContent = message;
    el.appendChild(item);
    el.scrollTop = el.scrollHeight;
  }

  return { init, updateChain, updateAll, renderChainList };
})();

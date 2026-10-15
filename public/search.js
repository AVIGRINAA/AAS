// ─── Search & Compare ────────────────────────────────────────────────
window.Search = (function () {
  let allProducts = null;

  async function ensureProductCache() {
    if (allProducts !== null) return;
    allProducts = await DB.getAll('products');
  }

  async function refreshCache() {
    allProducts = null;
    await ensureProductCache();
  }

  async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const resultsEl = document.getElementById('search-results');
    resultsEl.innerHTML = '<div class="no-results">מחפש...</div>';

    await ensureProductCache();

    if (!allProducts || allProducts.length === 0) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <h2>אין נתונים במערכת</h2>
          <p>כדי לחפש מוצרים, יש לעדכן מחירים תחילה.</p>
          <p>עבור ללשונית "עדכון מחירים" או "ייבוא / ייצוא" כדי לטעון נתונים.</p>
        </div>`;
      return;
    }

    const lower = query.toLowerCase();
    const matches = allProducts.filter(p =>
      p.itemName && p.itemName.toLowerCase().includes(lower)
    ).slice(0, 30);

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="no-results">לא נמצאו מוצרים</div>';
      return;
    }

    resultsEl.innerHTML = '';
    for (const product of matches) {
      const card = await buildProductCard(product);
      resultsEl.appendChild(card);
    }
  }

  async function buildProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    // Get all prices for this product
    const prices = await DB.getByIndex('prices', 'itemCode', product.itemCode);
    const validPrices = prices.filter(p => p.itemPrice > 0);

    if (validPrices.length === 0) {
      card.innerHTML = `
        <h3>${escapeHtml(product.itemName)}</h3>
        <div class="barcode">ברקוד: ${product.itemCode}</div>
        <div class="no-results">אין מחיר זמין</div>`;
      return card;
    }

    // Sort by price (cheapest first)
    validPrices.sort((a, b) => a.itemPrice - b.itemPrice);
    const cheapest = validPrices[0].itemPrice;
    const mostExpensive = validPrices[validPrices.length - 1].itemPrice;

    let priceRowsHtml = '';
    for (const p of validPrices) {
      const isCheapest = p.itemPrice === cheapest && validPrices.length > 1;
      const isExpensive = p.itemPrice === mostExpensive && p.itemPrice !== cheapest && validPrices.length > 1;
      const unitInfo = p.unitPrice > 0 ? `<span class="unit-price">(${p.unitPrice} ₪ / ${p.unitOfMeasure || 'יח'})</span>` : '';
      const dateInfo = p.updateDate ? `<span class="update-date">${formatDate(p.updateDate)}</span>` : '';

      priceRowsHtml += `
        <div class="price-row">
          <span class="store-name">${escapeHtml(p.chainName)} - ${escapeHtml(p.storeName)}</span>
          <span>
            <span class="price ${isCheapest ? 'cheapest' : ''} ${isExpensive ? 'expensive' : ''}">${p.itemPrice.toFixed(2)} ₪</span>
            ${unitInfo}
            ${dateInfo}
          </span>
        </div>`;
    }

    card.innerHTML = `
      <h3>${escapeHtml(product.itemName)}</h3>
      <div class="barcode">ברקוד: ${product.itemCode}${product.manufacturer ? ' | ' + escapeHtml(product.manufacturer) : ''}</div>
      ${priceRowsHtml}`;

    // Add "Add to list" button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ הוסף לרשימה';
    addBtn.style.cssText = 'margin-top:8px;padding:4px 12px;background:#27ae60;color:#fff;border:none;border-radius:4px;cursor:pointer;font-family:inherit;';
    addBtn.onclick = () => {
      ShoppingList.addItem(product.itemCode, product.itemName);
      addBtn.textContent = '✓ נוסף';
      addBtn.disabled = true;
    };
    card.appendChild(addBtn);

    return card;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('he-IL');
    } catch {
      return dateStr;
    }
  }

  return {
    performSearch,
    refreshCache,
    ensureProductCache,
  };
})();

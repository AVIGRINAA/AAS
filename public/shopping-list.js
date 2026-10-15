// ─── Shopping List ──────────────────────────────────────────────────
window.ShoppingList = (function () {
  let items = []; // [{ itemCode, itemName }]

  function render() {
    const listEl = document.getElementById('shopping-list');
    const totalsEl = document.getElementById('list-totals');

    if (items.length === 0) {
      listEl.innerHTML = '<div class="no-results">רשימת הקניות ריקה. חפש מוצר והוסף אותו לרשימה.</div>';
      totalsEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = items.map((item, i) => `
      <div class="list-item">
        <span class="name">${escapeHtml(item.itemName)}</span>
        <button class="remove" onclick="ShoppingList.remove(${i})">הסר</button>
      </div>`).join('');

    // Calculate totals per store
    calculateTotals();
  }

  async function calculateTotals() {
    const totalsEl = document.getElementById('list-totals');
    totalsEl.innerHTML = '<div class="no-results">מחשב סכומים...</div>';

    // Get all stores
    const stores = await DB.getAll('stores');
    if (stores.length === 0) {
      totalsEl.innerHTML = '<div class="no-results">אין סניפים במערכת</div>';
      return;
    }

    // For each store, sum prices of all items in the list
    const storeTotals = [];
    for (const store of stores) {
      let total = 0;
      let foundCount = 0;
      let missingItems = [];

      for (const item of items) {
        const priceKey = `${store.chainId}_${store.storeId}_${item.itemCode}`;
        const priceRecord = await DB.get('prices', priceKey);
        if (priceRecord && priceRecord.itemPrice > 0) {
          total += priceRecord.itemPrice;
          foundCount++;
        } else {
          missingItems.push(item.itemName);
        }
      }

      if (foundCount > 0) {
        storeTotals.push({
          store: store,
          total: total,
          foundCount: foundCount,
          totalCount: items.length,
          missingItems: missingItems,
        });
      }
    }

    if (storeTotals.length === 0) {
      totalsEl.innerHTML = '<div class="no-results">לא נמצאו מחירים למוצרים ברשימה</div>';
      return;
    }

    storeTotals.sort((a, b) => a.total - b.total);
    const cheapest = storeTotals[0].total;

    totalsEl.innerHTML = storeTotals.map(s => {
      const isCheapest = s.total === cheapest;
      const missingText = s.missingItems.length > 0
        ? ` (${s.missingItems.length} מ-${s.totalCount} חסרים)`
        : ` (${s.foundCount}/${s.totalCount})`;
      return `
        <div class="total-card ${isCheapest ? 'cheapest' : ''}">
          <span class="store">${escapeHtml(s.store.chainName)} - ${escapeHtml(s.store.storeName)}${missingText}</span>
          <span class="total">${s.total.toFixed(2)} ₪</span>
        </div>`;
    }).join('');
  }

  function addItem(itemCode, itemName) {
    if (items.some(i => i.itemCode === itemCode)) return;
    items.push({ itemCode, itemName });
    render();
  }

  function remove(index) {
    items.splice(index, 1);
    render();
  }

  async function addFromSearch() {
    const input = document.getElementById('list-add-input');
    const query = input.value.trim();
    if (!query) return;

    await Search.ensureProductCache();
    const allProducts = await DB.getAll('products');
    const lower = query.toLowerCase();
    const match = allProducts.find(p => p.itemName && p.itemName.toLowerCase().includes(lower));
    if (match) {
      addItem(match.itemCode, match.itemName);
      input.value = '';
      document.getElementById('list-suggestions').style.display = 'none';
    } else {
      alert('מוצר לא נמצא. חפש דרך לשונית "חיפוש מוצר" והוסף משם.');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  return { render, addItem, remove, addFromSearch };
})();

// ─── Main App ────────────────────────────────────────────────────────
window.App = (function () {

  async function init() {
    // Initialize IndexedDB
    await DB.open();

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Search on Enter
    document.getElementById('search-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') Search.performSearch();
    });

    // Shopping list add on Enter
    document.getElementById('list-add-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') ShoppingList.addFromSearch();
    });

    // Shopping list suggestions
    document.getElementById('list-add-input').addEventListener('input', (e) => {
      handleSuggestions(e.target.value);
    });

    // Initialize modules
    await Update.init();
    ShoppingList.render();
    refreshStatus();
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
  }

  async function refreshStatus() {
    const storeCount = await DB.count('stores');
    const priceCount = await DB.count('prices');
    const productCount = await DB.count('products');

    document.getElementById('store-count').textContent = `${storeCount} סניפים`;
    document.getElementById('product-count').textContent = `${productCount} מוצרים`;

    // Get last update date
    const meta = await DB.getAll('meta');
    if (meta.length > 0) {
      const latest = meta.reduce((a, b) =>
        (a.lastUpdate || '') > (b.lastUpdate || '') ? a : b
      );
      if (latest.lastUpdate) {
        const d = new Date(latest.lastUpdate);
        document.getElementById('last-update').textContent =
          `עדכון אחרון: ${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
      }
    } else {
      document.getElementById('last-update').textContent = 'לא עודכן';
    }
  }

  async function handleSuggestions(query) {
    const el = document.getElementById('list-suggestions');
    if (!query || query.trim().length < 2) {
      el.style.display = 'none';
      return;
    }

    await Search.ensureProductCache();
    const allProducts = await DB.getAll('products');
    const lower = query.toLowerCase();
    const matches = allProducts
      .filter(p => p.itemName && p.itemName.toLowerCase().includes(lower))
      .slice(0, 8);

    if (matches.length === 0) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'block';
    el.innerHTML = matches.map(p =>
      `<div class="suggestion" onclick="ShoppingList.addItem('${p.itemCode}', ${JSON.stringify(p.itemName).replace(/'/g, '&#39;')})">${escapeHtml(p.itemName)}</div>`
    ).join('');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  return { init, switchTab, refreshStatus };
})();

// Initialize on page load
document.addEventListener('DOMContentLoaded', App.init);

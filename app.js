// ============================================================
// StockFlow — Inventory Console
// Backed by Supabase (Postgres + Auth). Requires config.js to be
// loaded first with a valid SUPABASE_URL / SUPABASE_ANON_KEY.
// ============================================================

const COLOR_PALETTE = ['#2455c7', '#0e7c66', '#6d3fd6', '#c9720a', '#4f7a1f', '#b3261e', '#0f6e5c', '#a3336b'];

// ---------------- Table instances ----------------
// Two independent product tables (Dashboard + Products page), each with
// its own search / category filter / sort state so they don't interfere.
const TABLE_CONFIGS = {
    dashboard: { tbody: 'dashProductTableBody', search: 'dashSearchInput', filter: 'dashCategoryFilter', section: 'page-dashboard' },
    products: { tbody: 'productTableBody', search: 'searchInput', filter: 'categoryFilter', section: 'page-products' }
};

const tableState = {
    dashboard: { search: '', category: '', sortKey: 'name', sortDir: 'asc' },
    products: { search: '', category: '', sortKey: 'name', sortDir: 'asc' }
};

// ---------------- App state ----------------
let state = {
    page: 'dashboard',
    pendingDeleteId: null,
    pendingDeleteName: '',
    pendingDeleteCategoryId: null,
    pendingDeleteCategoryName: ''
};

let categoryChartInstance = null;
let valuationChartInstance = null;

const PAGE_META = {
    dashboard: { title: 'Dashboard', subtitle: 'Real-time overview of stock levels, valuation and reorder health.' },
    products: { title: 'Products', subtitle: 'Search, filter and manage every item in your inventory.' },
    categories: { title: 'Categories', subtitle: 'Group products, track category totals and keep tagging consistent.' },
    analytics: { title: 'Analytics', subtitle: 'Valuation trends, stock health and your highest-value products.' }
};

// ============================================================
// SUPABASE DATA LAYER
// ============================================================

// Supabase stores min_stock (snake_case); the UI works in minStock (camelCase).
function dbProductToApp(row) {
    return {
        id: row.id,
        name: row.name,
        category: row.category,
        price: Number(row.price),
        quantity: row.quantity,
        minStock: row.min_stock
    };
}

function appProductToDb(payload) {
    return {
        name: payload.name,
        category: payload.category,
        price: payload.price,
        quantity: payload.quantity,
        min_stock: payload.minStock
    };
}

async function getStoredProducts() {
    const { data, error } = await supabaseClient.from('products').select('*').order('name');
    if (error) {
        showToast(error.message, 'error');
        return [];
    }
    return (data || []).map(dbProductToApp);
}

async function getStoredCategories() {
    const { data, error } = await supabaseClient.from('categories').select('*').order('name');
    if (error) {
        showToast(error.message, 'error');
        return [];
    }
    return data || [];
}

async function insertProduct(payload) {
    const { error } = await supabaseClient.from('products').insert(appProductToDb(payload));
    return error;
}

async function updateProductRow(id, payload) {
    const { error } = await supabaseClient.from('products').update(appProductToDb(payload)).eq('id', id);
    return error;
}

async function deleteProductRow(id) {
    const { error } = await supabaseClient.from('products').delete().eq('id', id);
    return error;
}

async function insertCategory(payload) {
    const { error } = await supabaseClient.from('categories').insert({ name: payload.name, color: payload.color });
    return error;
}

async function updateCategoryRow(id, payload) {
    // Renaming here also renames the category on every product that uses it —
    // handled automatically by the "on update cascade" foreign key in schema.sql.
    const { error } = await supabaseClient.from('categories').update({ name: payload.name, color: payload.color }).eq('id', id);
    return error;
}

async function deleteCategoryRow(id) {
    const { error } = await supabaseClient.from('categories').delete().eq('id', id);
    return error;
}

function nextCategoryColor(categories) {
    const used = categories.map(c => c.color);
    const free = COLOR_PALETTE.find(c => !used.includes(c));
    return free || COLOR_PALETTE[categories.length % COLOR_PALETTE.length];
}

// ---------------- Formatting helpers ----------------
function formatCurrency(value) {
    const num = Number(value) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function findCategory(categories, name) {
    return categories.find(c => c.name === name);
}

function categoryColor(categories, name) {
    const found = findCategory(categories, name);
    return found ? found.color : '#52596b';
}

function stockLevel(p) {
    if (p.quantity <= 0) return 'critical';
    if (p.quantity <= p.minStock) return 'low';
    return 'ok';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str == null ? '' : String(str);
    return div.innerHTML;
}

// ---------------- Toasts ----------------
function showToast(message, type = 'success') {
    const stack = document.getElementById('toastStack');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warn: 'fa-triangle-exclamation' };
    const toast = document.createElement('div');
    toast.className = `sf-toast ${type !== 'success' ? 'toast-' + type : ''}`.trim();
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}"></i><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 220);
    }, 2600);
}

// ============================================================
// AUTH
// ============================================================
async function requireSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    return session;
}

function renderUserBadge(session) {
    const email = session.user.email || 'You';
    document.getElementById('userAvatar').innerText = email.slice(0, 2).toUpperCase();
    document.getElementById('userName').innerText = email;
}

document.getElementById('logoutBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
});

supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = 'login.html';
});

// ============================================================
// PAGE NAVIGATION
// ============================================================
function goToPage(page) {
    state.page = page;

    document.querySelectorAll('.page-section').forEach(sec => sec.setAttribute('hidden', ''));
    document.getElementById(`page-${page}`)?.removeAttribute('hidden');

    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`.sidebar .nav-link[data-nav="${page}"]`)?.classList.add('active');

    const meta = PAGE_META[page] || { title: page, subtitle: '' };
    document.getElementById('pageTitle').innerText = meta.title;
    document.getElementById('pageSubtitle').innerText = meta.subtitle;

    document.getElementById('addProductBtn').hidden = page === 'categories' || page === 'analytics';
    document.getElementById('addCategoryBtn').hidden = page !== 'categories';

    closeSidebar();
    renderAll();
}

document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        goToPage(link.dataset.nav);
    });
});

// ============================================================
// MASTER RENDER — always keeps every section in sync, regardless
// of which page is currently visible, so switching pages never
// shows stale data.
// ============================================================
async function renderAll() {
    const products = await getStoredProducts();
    const categories = await getStoredCategories();

    Object.keys(TABLE_CONFIGS).forEach(key => {
        populateCategoryFilter(key, products, categories);
        renderProductTable(key, products, categories);
        updateSortIcons(key);
    });

    populateProductCategorySelect(categories);
    renderMetrics(products);
    renderCategoryChart(products, categories);
    renderWatchlist(products);
    renderCategoriesGrid(products, categories);
    renderAnalytics(products, categories);
}

// ---------------- Category dropdown (filters on Dashboard + Products tables) ----------------
function populateCategoryFilter(key, products, categories) {
    const select = document.getElementById(TABLE_CONFIGS[key].filter);
    if (!select) return;
    const current = tableState[key].category;
    const names = categories.map(c => c.name);
    select.innerHTML = '<option value="">All categories</option>' +
        names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    select.value = names.includes(current) ? current : '';
    tableState[key].category = select.value;
}

// ---------------- Category dropdown (Add/Edit product modal) ----------------
function populateProductCategorySelect(categories) {
    const select = document.getElementById('prodCategory');
    const current = select.value;
    select.innerHTML = categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
    if (categories.some(c => c.name === current)) select.value = current;
}

// ---------------- Filtering & sorting ----------------
function getVisibleProducts(key, products) {
    const s = tableState[key];
    let list = [...products];

    if (s.category) {
        list = list.filter(p => p.category === s.category);
    }
    if (s.search) {
        const q = s.search.toLowerCase();
        list = list.filter(p =>
            p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
        );
    }

    list.sort((a, b) => {
        let va = a[s.sortKey];
        let vb = b[s.sortKey];
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return s.sortDir === 'asc' ? -1 : 1;
        if (va > vb) return s.sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    return list;
}

// ---------------- Product directory table (shared renderer) ----------------
function renderProductTable(key, allProducts, categories) {
    const tableBody = document.getElementById(TABLE_CONFIGS[key].tbody);
    if (!tableBody) return;

    const products = getVisibleProducts(key, allProducts);
    tableBody.innerHTML = '';

    if (products.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <i class="fa-solid fa-box-open"></i>
                        <strong>No products found</strong>
                        <span>Try a different search, or add a new product to get started.</span>
                    </div>
                </td>
            </tr>`;
        return;
    }

    products.forEach((p) => {
        const level = stockLevel(p);
        const gaugePct = Math.min(100, Math.round((p.quantity / Math.max(p.minStock * 2, 1)) * 100));
        const color = categoryColor(categories, p.category);
        const row = document.createElement('tr');
        row.className = level !== 'ok' ? 'row-low-stock' : '';
        row.innerHTML = `
            <td>
                <span class="product-name-cell">${escapeHtml(p.name)}</span>
                <span class="product-sku">SKU-${String(p.id).slice(-5)}</span>
            </td>
            <td><span class="cat-pill" style="background:${color}1a;color:${color}">${escapeHtml(p.category)}</span></td>
            <td class="price-cell">${formatCurrency(p.price)}</td>
            <td>
                <div class="stock-gauge">
                    <div class="stock-gauge-track">
                        <div class="stock-gauge-fill level-${level}" style="width:${gaugePct}%"></div>
                    </div>
                    <span class="stock-gauge-num">${p.quantity}</span>
                </div>
            </td>
            <td>
                ${level !== 'ok'
                    ? '<span class="badge-soft-danger"><i class="fa-solid fa-circle me-1" style="font-size:6px;"></i>Low Stock</span>'
                    : '<span class="badge-soft-success"><i class="fa-solid fa-circle me-1" style="font-size:6px;"></i>In Stock</span>'}
            </td>
            <td>
                <div class="action-cell">
                    <button class="btn-icon-sm" title="Edit" onclick="openEditModal(${p.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon-sm danger" title="Delete" onclick="openDeleteModal(${p.id})"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function updateSortIcons(key) {
    const section = document.getElementById(TABLE_CONFIGS[key].section);
    if (!section) return;
    section.querySelectorAll('th[data-sort]').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (th.dataset.sort === tableState[key].sortKey) {
            icon.className = `fa-solid sort-icon active ${tableState[key].sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'}`;
        } else {
            icon.className = 'fa-solid fa-sort sort-icon';
        }
    });
}

// ---------------- Dashboard: metrics / chart / watchlist ----------------
function renderMetrics(products) {
    const totalValuation = products.reduce((sum, p) => sum + p.price * p.quantity, 0);
    const lowStockCount = products.filter(p => p.quantity <= p.minStock).length;

    document.getElementById('metricTotalItems').innerText = products.length;
    document.getElementById('metricLowStock').innerText = lowStockCount;
    document.getElementById('metricTotalValuation').innerText = formatCurrency(totalValuation);
}

function renderCategoryChart(products, categories) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const totalsByCategory = {};
    products.forEach(p => {
        totalsByCategory[p.category] = (totalsByCategory[p.category] || 0) + p.quantity;
    });

    const labels = Object.keys(totalsByCategory);
    const data = Object.values(totalsByCategory);

    if (categoryChartInstance) categoryChartInstance.destroy();
    if (labels.length === 0) return;

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: labels.map(name => categoryColor(categories, name)),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 10, font: { size: 11, family: 'Inter' }, padding: 12 }
                }
            }
        }
    });
}

function renderWatchlist(products) {
    const container = document.getElementById('watchlist');
    if (!container) return;
    const lowStock = products
        .filter(p => p.quantity <= p.minStock)
        .sort((a, b) => (a.quantity - a.minStock) - (b.quantity - b.minStock));

    if (lowStock.length === 0) {
        container.innerHTML = `
            <div class="watchlist-empty">
                <i class="fa-solid fa-circle-check"></i>
                All products are above their reorder threshold.
            </div>`;
        return;
    }

    container.innerHTML = lowStock.map(p => `
        <div class="watchlist-item">
            <div>
                <div class="watchlist-item-name">${escapeHtml(p.name)}</div>
                <div class="watchlist-item-meta">Reorder below ${p.minStock} units</div>
            </div>
            <div class="watchlist-item-qty">${p.quantity}</div>
        </div>
    `).join('');
}

// ---------------- Categories page ----------------
function renderCategoriesGrid(products, categories) {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    if (categories.length === 0) {
        grid.innerHTML = `
            <div class="col-12">
                <div class="empty-state">
                    <i class="fa-solid fa-layer-group"></i>
                    <strong>No categories yet</strong>
                    <span>Add a category to start grouping your products.</span>
                </div>
            </div>`;
        return;
    }

    grid.innerHTML = categories.map(cat => {
        const catProducts = products.filter(p => p.category === cat.name);
        const totalUnits = catProducts.reduce((sum, p) => sum + p.quantity, 0);
        const totalValue = catProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);
        return `
        <div class="col-md-6 col-xl-4">
            <div class="metric-card category-card">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="cat-dot" style="background:${cat.color}"></span>
                        <span class="category-card-name">${escapeHtml(cat.name)}</span>
                    </div>
                    <div class="action-cell">
                        <button class="btn-icon-sm" title="Edit" onclick="openEditCategoryModal(${cat.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon-sm danger" title="Delete" onclick="openDeleteCategoryModal(${cat.id})"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </div>
                <div class="category-card-stats">
                    <div>
                        <span class="category-stat-value">${catProducts.length}</span>
                        <span class="category-stat-label">Products</span>
                    </div>
                    <div>
                        <span class="category-stat-value">${totalUnits}</span>
                        <span class="category-stat-label">Units</span>
                    </div>
                    <div>
                        <span class="category-stat-value">${formatCurrency(totalValue)}</span>
                        <span class="category-stat-label">Value</span>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ---------------- Analytics page ----------------
function renderAnalytics(products, categories) {
    const canvas = document.getElementById('valuationChart');
    if (!canvas) return; // analytics DOM not present yet

    const totalUnits = products.reduce((sum, p) => sum + p.quantity, 0);
    const avgPrice = products.length ? products.reduce((sum, p) => sum + p.price, 0) / products.length : 0;
    const healthyCount = products.filter(p => stockLevel(p) === 'ok').length;
    const healthScore = products.length ? Math.round((healthyCount / products.length) * 100) : 0;

    document.getElementById('metricAvgPrice').innerText = formatCurrency(avgPrice);
    document.getElementById('metricTotalUnits').innerText = totalUnits;
    document.getElementById('metricHealthScore').innerText = `${healthScore}%`;

    const totalsByCategory = {};
    products.forEach(p => {
        totalsByCategory[p.category] = (totalsByCategory[p.category] || 0) + p.price * p.quantity;
    });
    const labels = Object.keys(totalsByCategory);
    const data = Object.values(totalsByCategory);

    if (valuationChartInstance) valuationChartInstance.destroy();
    if (labels.length > 0) {
        valuationChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: labels.map(name => categoryColor(categories, name)),
                    borderRadius: 6,
                    barThickness: 34
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } },
                    x: { ticks: { font: { size: 11, family: 'Inter' } } }
                }
            }
        });
    }

    const counts = { ok: 0, low: 0, critical: 0 };
    products.forEach(p => counts[stockLevel(p)]++);
    const total = products.length || 1;
    const rows = [
        { key: 'ok', label: 'In Stock', cls: 'level-ok' },
        { key: 'low', label: 'Low Stock', cls: 'level-low' },
        { key: 'critical', label: 'Out of Stock', cls: 'level-critical' }
    ];

    document.getElementById('healthBreakdown').innerHTML = rows.map(r => `
        <div class="health-row">
            <span class="health-label">${r.label}</span>
            <div class="health-track">
                <div class="health-fill ${r.cls}" style="width:${Math.round((counts[r.key] / total) * 100)}%"></div>
            </div>
            <span class="health-count">${counts[r.key]}</span>
        </div>
    `).join('');

    const top = [...products]
        .sort((a, b) => (b.price * b.quantity) - (a.price * a.quantity))
        .slice(0, 5);

    const topBody = document.getElementById('topProductsTableBody');
    if (top.length === 0) {
        topBody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fa-solid fa-ranking-star"></i>
                        <strong>No products yet</strong>
                        <span>Add products to see your highest-value items here.</span>
                    </div>
                </td>
            </tr>`;
        return;
    }

    topBody.innerHTML = top.map(p => {
        const color = categoryColor(categories, p.category);
        return `
        <tr>
            <td><span class="product-name-cell">${escapeHtml(p.name)}</span></td>
            <td><span class="cat-pill" style="background:${color}1a;color:${color}">${escapeHtml(p.category)}</span></td>
            <td class="price-cell">${formatCurrency(p.price)}</td>
            <td class="qty-cell">${p.quantity}</td>
            <td class="text-end price-cell">${formatCurrency(p.price * p.quantity)}</td>
        </tr>`;
    }).join('');
}

// ============================================================
// PRODUCT FORM VALIDATION
// ============================================================
function validateForm() {
    let valid = true;
    const fields = [
        { el: document.getElementById('prodName'), check: v => v.trim().length > 0 },
        { el: document.getElementById('prodQuantity'), check: v => v !== '' && Number(v) >= 0 },
        { el: document.getElementById('prodMinStock'), check: v => v !== '' && Number(v) >= 0 },
        { el: document.getElementById('prodPrice'), check: v => v !== '' && Number(v) >= 0 }
    ];
    fields.forEach(({ el, check }) => {
        if (!check(el.value)) {
            el.classList.add('is-invalid');
            valid = false;
        } else {
            el.classList.remove('is-invalid');
        }
    });
    return valid;
}

function clearValidation() {
    document.querySelectorAll('#addProductForm .is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

// ---------------- Add / Edit product ----------------
async function openAddModal() {
    document.getElementById('addProductForm').reset();
    document.getElementById('prodId').value = '';
    document.getElementById('productModalTitle').innerText = 'Add New Product';
    document.getElementById('saveProductBtn').innerText = 'Save Product';
    document.getElementById('prodMinStock').value = 5;
    populateProductCategorySelect(await getStoredCategories());
    clearValidation();
}

async function openEditModal(id) {
    const products = await getStoredProducts();
    const product = products.find(p => p.id === id);
    if (!product) return;

    populateProductCategorySelect(await getStoredCategories());
    document.getElementById('prodId').value = product.id;
    document.getElementById('prodName').value = product.name;
    document.getElementById('prodCategory').value = product.category;
    document.getElementById('prodQuantity').value = product.quantity;
    document.getElementById('prodMinStock').value = product.minStock;
    document.getElementById('prodPrice').value = product.price;
    document.getElementById('productModalTitle').innerText = 'Edit Product';
    document.getElementById('saveProductBtn').innerText = 'Update Product';
    clearValidation();

    new bootstrap.Modal(document.getElementById('addProductModal')).show();
}

document.getElementById('addProductForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateForm()) return;

    const id = document.getElementById('prodId').value;
    const payload = {
        name: document.getElementById('prodName').value.trim(),
        category: document.getElementById('prodCategory').value,
        quantity: parseInt(document.getElementById('prodQuantity').value, 10),
        minStock: parseInt(document.getElementById('prodMinStock').value, 10),
        price: parseFloat(document.getElementById('prodPrice').value)
    };

    const error = id ? await updateProductRow(Number(id), payload) : await insertProduct(payload);
    if (error) {
        showToast(error.message, 'error');
        return;
    }

    await renderAll();
    showToast(id ? `${payload.name} updated` : `${payload.name} added to inventory`, 'success');

    this.reset();
    bootstrap.Modal.getInstance(document.getElementById('addProductModal'))?.hide();
});

document.getElementById('addProductModal').addEventListener('show.bs.modal', async function (e) {
    if (!e.relatedTarget) return; // opened programmatically via openEditModal, already populated
    await openAddModal();
});

// ---------------- Delete product ----------------
async function openDeleteModal(id) {
    const products = await getStoredProducts();
    const product = products.find(p => p.id === id);
    if (!product) return;

    state.pendingDeleteId = id;
    state.pendingDeleteName = product.name;
    document.getElementById('deleteConfirmText').innerText =
        `"${product.name}" will be permanently removed from your inventory.`;

    new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async function () {
    if (state.pendingDeleteId == null) return;
    const id = state.pendingDeleteId;
    const name = state.pendingDeleteName;

    const error = await deleteProductRow(id);
    if (error) {
        showToast(error.message, 'error');
        return;
    }

    await renderAll();
    showToast(`${name || 'Product'} removed`, 'warn');
    state.pendingDeleteId = null;
    bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'))?.hide();
});

// ============================================================
// CATEGORY CRUD
// ============================================================
function renderSwatchRow(selected) {
    const row = document.getElementById('swatchRow');
    row.innerHTML = COLOR_PALETTE.map(color => `
        <button type="button" class="swatch-btn ${color === selected ? 'selected' : ''}"
            style="background:${color}" data-color="${color}" onclick="selectSwatch('${color}')"></button>
    `).join('');
    document.getElementById('catColor').value = selected;
}

function selectSwatch(color) {
    document.getElementById('catColor').value = color;
    document.querySelectorAll('.swatch-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === color);
    });
}

async function openAddCategoryModal() {
    const categories = await getStoredCategories();
    document.getElementById('categoryForm').reset();
    document.getElementById('catId').value = '';
    document.getElementById('categoryModalTitle').innerText = 'Add New Category';
    document.getElementById('saveCategoryBtn').innerText = 'Save Category';
    renderSwatchRow(nextCategoryColor(categories));
    clearCategoryValidation();
}

async function openEditCategoryModal(id) {
    const categories = await getStoredCategories();
    const cat = categories.find(c => c.id === id);
    if (!cat) return;

    document.getElementById('catId').value = cat.id;
    document.getElementById('catName').value = cat.name;
    document.getElementById('categoryModalTitle').innerText = 'Edit Category';
    document.getElementById('saveCategoryBtn').innerText = 'Update Category';
    renderSwatchRow(cat.color);
    clearCategoryValidation();

    new bootstrap.Modal(document.getElementById('categoryModal')).show();
}

function clearCategoryValidation() {
    document.getElementById('catName').classList.remove('is-invalid');
}

document.getElementById('categoryModal').addEventListener('show.bs.modal', async function (e) {
    if (!e.relatedTarget) return; // opened programmatically via openEditCategoryModal
    await openAddCategoryModal();
});

document.getElementById('categoryForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const nameInput = document.getElementById('catName');
    const name = nameInput.value.trim();
    const color = document.getElementById('catColor').value || COLOR_PALETTE[0];
    const id = document.getElementById('catId').value;

    if (!name) {
        nameInput.classList.add('is-invalid');
        showToast('Enter a category name', 'error');
        return;
    }
    nameInput.classList.remove('is-invalid');

    const payload = { name, color };
    const error = id ? await updateCategoryRow(Number(id), payload) : await insertCategory(payload);
    if (error) {
        // Postgres unique_violation
        showToast(error.code === '23505' ? 'That category name already exists' : error.message, 'error');
        return;
    }

    await renderAll();
    showToast(id ? `${name} updated` : `${name} added`, 'success');

    this.reset();
    bootstrap.Modal.getInstance(document.getElementById('categoryModal'))?.hide();
});

async function openDeleteCategoryModal(id) {
    const categories = await getStoredCategories();
    const cat = categories.find(c => c.id === id);
    if (!cat) return;

    state.pendingDeleteCategoryId = id;
    state.pendingDeleteCategoryName = cat.name;
    document.getElementById('deleteCategoryTitle').innerText = 'Remove this category?';
    document.getElementById('deleteCategoryText').innerText =
        `"${cat.name}" will be removed. This is blocked if any product still uses it.`;
    document.getElementById('confirmDeleteCategoryBtn').hidden = false;

    new bootstrap.Modal(document.getElementById('deleteCategoryModal')).show();
}

document.getElementById('confirmDeleteCategoryBtn').addEventListener('click', async function () {
    if (!state.pendingDeleteCategoryId) return;
    const id = state.pendingDeleteCategoryId;
    const name = state.pendingDeleteCategoryName;

    const error = await deleteCategoryRow(id);
    if (error) {
        // Postgres foreign_key_violation — products still reference this category
        const message = error.code === '23503'
            ? `"${name}" is still used by one or more products. Reassign or delete them first.`
            : error.message;
        showToast(message, 'error');
        bootstrap.Modal.getInstance(document.getElementById('deleteCategoryModal'))?.hide();
        return;
    }

    await renderAll();
    showToast(`${name} removed`, 'warn');
    state.pendingDeleteCategoryId = null;
    bootstrap.Modal.getInstance(document.getElementById('deleteCategoryModal'))?.hide();
});

// ============================================================
// RESET / SEARCH / FILTER / SORT / SIDEBAR
// ============================================================
document.getElementById('resetDataBtn').addEventListener('click', async () => {
    // Wipe existing rows (categories after products, since products
    // reference categories by name)
    await supabaseClient.from('products').delete().neq('id', 0);
    await supabaseClient.from('categories').delete().neq('id', 0);

    const { error: catErr } = await supabaseClient.from('categories').insert([
        { name: 'Electronics', color: '#2455c7' },
        { name: 'Office Supplies', color: '#6d3fd6' },
        { name: 'Hardware', color: '#4f7a1f' }
    ]);
    if (catErr) { showToast(catErr.message, 'error'); return; }

    const { error: prodErr } = await supabaseClient.from('products').insert([
        { name: 'Dell Monitor 24"', category: 'Electronics', price: 12000.00, quantity: 12, min_stock: 3 },
        { name: 'Wireless Mouse', category: 'Electronics', price: 850.00, quantity: 3, min_stock: 5 },
        { name: 'A4 Paper Bundle', category: 'Office Supplies', price: 250.00, quantity: 45, min_stock: 10 },
        { name: 'Mobile Cover', category: 'Hardware', price: 250.00, quantity: 15, min_stock: 5 },
        { name: 'Mechanical Keyboard', category: 'Electronics', price: 3200.00, quantity: 2, min_stock: 4 },
        { name: 'Stapler Pins Box', category: 'Office Supplies', price: 60.00, quantity: 5, min_stock: 8 }
    ]);
    if (prodErr) { showToast(prodErr.message, 'error'); return; }

    Object.keys(tableState).forEach(key => {
        tableState[key].search = '';
        tableState[key].category = '';
        const input = document.getElementById(TABLE_CONFIGS[key].search);
        if (input) input.value = '';
    });

    await renderAll();
    showToast('Sample data restored', 'success');
});

// Map a search/filter input's DOM id back to its table key.
function tableKeyForInputId(id) {
    return Object.keys(TABLE_CONFIGS).find(key =>
        TABLE_CONFIGS[key].search === id || TABLE_CONFIGS[key].filter === id
    );
}

document.addEventListener('input', function (e) {
    const key = e.target && e.target.id && tableKeyForInputId(e.target.id);
    if (!key || TABLE_CONFIGS[key].search !== e.target.id) return;
    tableState[key].search = e.target.value;
    renderAll();
});

document.addEventListener('change', function (e) {
    const key = e.target && e.target.id && tableKeyForInputId(e.target.id);
    if (!key || TABLE_CONFIGS[key].filter !== e.target.id) return;
    tableState[key].category = e.target.value;
    renderAll();
});

document.addEventListener('click', function (e) {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const section = th.closest('.page-section');
    const key = section && Object.keys(TABLE_CONFIGS).find(k => TABLE_CONFIGS[k].section === section.id);
    if (!key) return;

    const s = tableState[key];
    const sortKey = th.dataset.sort;
    if (s.sortKey === sortKey) {
        s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        s.sortKey = sortKey;
        s.sortDir = 'asc';
    }
    renderAll();
});

function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarBackdrop').classList.add('show');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.remove('show');
}

document.getElementById('hamburgerBtn').addEventListener('click', openSidebar);
document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);

// ---------------- Initial load ----------------
document.addEventListener('DOMContentLoaded', async () => {
    const session = await requireSession();
    if (!session) return; // requireSession already redirected to login.html
    renderUserBadge(session);
    goToPage('dashboard');
});

// ============================================================
// StockFlow — Inventory Console
// Client-side inventory manager backed by localStorage.
// ============================================================

const STORAGE_KEY = 'stockflow_products';

const initialProducts = [
    { id: 1, name: 'Dell Monitor 24"', category: 'Electronics', price: 12000.00, quantity: 12, minStock: 3 },
    { id: 2, name: 'Wireless Mouse', category: 'Electronics', price: 850.00, quantity: 3, minStock: 5 },
    { id: 3, name: 'A4 Paper Bundle', category: 'Office Supplies', price: 250.00, quantity: 45, minStock: 10 },
    { id: 4, name: 'Mobile Cover', category: 'Hardware', price: 250.00, quantity: 15, minStock: 5 },
    { id: 5, name: 'Mechanical Keyboard', category: 'Electronics', price: 3200.00, quantity: 2, minStock: 4 },
    { id: 6, name: 'Stapler Pins Box', category: 'Office Supplies', price: 60.00, quantity: 5, minStock: 8 }
];

// ---------------- State ----------------
let state = {
    search: '',
    category: '',
    sortKey: 'name',
    sortDir: 'asc',
    pendingDeleteId: null
};

let categoryChartInstance = null;

// ---------------- Storage helpers ----------------
function getStoredProducts() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialProducts));
        return [...initialProducts];
    }
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [...initialProducts];
    } catch (e) {
        return [...initialProducts];
    }
}

function saveProducts(products) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    renderApp();
}

// ---------------- Formatting helpers ----------------
function formatCurrency(value) {
    const num = Number(value) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function categoryClass(category) {
    const map = {
        'Electronics': 'cat-electronics',
        'Office Supplies': 'cat-office-supplies',
        'Hardware': 'cat-hardware'
    };
    return map[category] || 'cat-default';
}

function stockLevel(p) {
    if (p.quantity <= 0) return 'critical';
    if (p.quantity <= p.minStock) return 'low';
    return 'ok';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

// ---------------- Toasts ----------------
function showToast(message, type = 'success') {
    const stack = document.getElementById('toastStack');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warn: 'fa-triangle-exclamation' };
    const toast = document.createElement('div');
    toast.className = `sf-toast toast-${type === 'success' ? '' : type}`.trim();
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.success}"></i><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 220);
    }, 2600);
}

// ---------------- Category filter options ----------------
function populateCategoryFilter(products) {
    const select = document.getElementById('categoryFilter');
    const current = state.category;
    const categories = [...new Set(products.map(p => p.category))].sort();
    select.innerHTML = '<option value="">All categories</option>' +
        categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    select.value = categories.includes(current) ? current : '';
    state.category = select.value;
}

// ---------------- Filtering & sorting ----------------
function getVisibleProducts(products) {
    let list = [...products];

    if (state.category) {
        list = list.filter(p => p.category === state.category);
    }
    if (state.search) {
        const q = state.search.toLowerCase();
        list = list.filter(p =>
            p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
        );
    }

    list.sort((a, b) => {
        let va = a[state.sortKey];
        let vb = b[state.sortKey];
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
        if (va > vb) return state.sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    return list;
}

// ---------------- Rendering ----------------
function renderApp() {
    const products = getStoredProducts();
    populateCategoryFilter(products);
    const visible = getVisibleProducts(products);

    renderTable(visible);
    renderMetrics(products);
    renderCategoryChart(products);
    renderWatchlist(products);
    updateSortIcons();
}

function renderTable(products) {
    const tableBody = document.getElementById('productTableBody');
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
        const row = document.createElement('tr');
        row.className = level !== 'ok' ? 'row-low-stock' : '';
        row.innerHTML = `
            <td>
                <span class="product-name-cell">${escapeHtml(p.name)}</span>
                <span class="product-sku">SKU-${String(p.id).slice(-5)}</span>
            </td>
            <td><span class="cat-pill ${categoryClass(p.category)}">${escapeHtml(p.category)}</span></td>
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

function renderMetrics(products) {
    const totalValuation = products.reduce((sum, p) => sum + p.price * p.quantity, 0);
    const lowStockCount = products.filter(p => p.quantity <= p.minStock).length;

    document.getElementById('metricTotalItems').innerText = products.length;
    document.getElementById('metricLowStock').innerText = lowStockCount;
    document.getElementById('metricTotalValuation').innerText = formatCurrency(totalValuation);
}

function renderCategoryChart(products) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const totalsByCategory = {};
    products.forEach(p => {
        totalsByCategory[p.category] = (totalsByCategory[p.category] || 0) + p.quantity;
    });

    const labels = Object.keys(totalsByCategory);
    const data = Object.values(totalsByCategory);
    const palette = ['#0e7c66', '#c9720a', '#6d3fd6', '#2455c7', '#4f7a1f', '#b3261e'];

    if (categoryChartInstance) categoryChartInstance.destroy();

    if (labels.length === 0) {
        return;
    }

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: labels.map((_, i) => palette[i % palette.length]),
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

function updateSortIcons() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (th.dataset.sort === state.sortKey) {
            icon.className = `fa-solid sort-icon active ${state.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'}`;
        } else {
            icon.className = 'fa-solid fa-sort sort-icon';
        }
    });
}

// ---------------- Form validation ----------------
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

// ---------------- Add / Edit modal ----------------
function openAddModal() {
    document.getElementById('addProductForm').reset();
    document.getElementById('prodId').value = '';
    document.getElementById('productModalTitle').innerText = 'Add New Product';
    document.getElementById('saveProductBtn').innerText = 'Save Product';
    document.getElementById('prodMinStock').value = 5;
    clearValidation();
}

function openEditModal(id) {
    const products = getStoredProducts();
    const product = products.find(p => p.id === id);
    if (!product) return;

    document.getElementById('prodId').value = product.id;
    document.getElementById('prodName').value = product.name;
    document.getElementById('prodCategory').value = product.category;
    document.getElementById('prodQuantity').value = product.quantity;
    document.getElementById('prodMinStock').value = product.minStock;
    document.getElementById('prodPrice').value = product.price;
    document.getElementById('productModalTitle').innerText = 'Edit Product';
    document.getElementById('saveProductBtn').innerText = 'Update Product';
    clearValidation();

    const modal = new bootstrap.Modal(document.getElementById('addProductModal'));
    modal.show();
}

function clearValidation() {
    document.querySelectorAll('#addProductForm .is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

document.getElementById('addProductForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateForm()) return;

    const products = getStoredProducts();
    const id = document.getElementById('prodId').value;

    const payload = {
        name: document.getElementById('prodName').value.trim(),
        category: document.getElementById('prodCategory').value,
        quantity: parseInt(document.getElementById('prodQuantity').value, 10),
        minStock: parseInt(document.getElementById('prodMinStock').value, 10),
        price: parseFloat(document.getElementById('prodPrice').value)
    };

    if (id) {
        const idx = products.findIndex(p => p.id === Number(id));
        if (idx !== -1) {
            products[idx] = { ...products[idx], ...payload };
            saveProducts(products);
            showToast(`${payload.name} updated`, 'success');
        }
    } else {
        products.push({ id: Date.now(), ...payload });
        saveProducts(products);
        showToast(`${payload.name} added to inventory`, 'success');
    }

    this.reset();
    const modalEl = document.getElementById('addProductModal');
    bootstrap.Modal.getInstance(modalEl)?.hide();
});

document.getElementById('addProductModal').addEventListener('show.bs.modal', function (e) {
    if (!e.relatedTarget) return; // opened programmatically via openEditModal, already populated
    openAddModal();
});

// ---------------- Delete flow ----------------
function openDeleteModal(id) {
    const products = getStoredProducts();
    const product = products.find(p => p.id === id);
    if (!product) return;

    state.pendingDeleteId = id;
    document.getElementById('deleteConfirmText').innerText =
        `“${product.name}” will be permanently removed from your inventory.`;

    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    modal.show();
}

document.getElementById('confirmDeleteBtn').addEventListener('click', function () {
    if (state.pendingDeleteId == null) return;
    let products = getStoredProducts();
    const product = products.find(p => p.id === state.pendingDeleteId);
    products = products.filter(p => p.id !== state.pendingDeleteId);
    saveProducts(products);
    showToast(`${product ? product.name : 'Product'} removed`, 'warn');
    state.pendingDeleteId = null;
    bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'))?.hide();
});

// ---------------- Reset sample data ----------------
document.getElementById('resetDataBtn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    state.search = '';
    state.category = '';
    document.getElementById('searchInput').value = '';
    renderApp();
    showToast('Sample data restored', 'success');
});

// ---------------- Search & filter handlers ----------------
document.getElementById('searchInput').addEventListener('input', function (e) {
    state.search = e.target.value;
    renderApp();
});

document.getElementById('categoryFilter').addEventListener('change', function (e) {
    state.category = e.target.value;
    renderApp();
});

// ---------------- Sortable headers ----------------
document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortKey = key;
            state.sortDir = 'asc';
        }
        renderApp();
    });
});

// ---------------- Sidebar nav (mobile + placeholder sections) ----------------
document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        closeSidebar();
        if (link.dataset.nav !== 'dashboard') {
            showToast('This section is not built yet in the demo', 'warn');
        }
    });
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
document.addEventListener('DOMContentLoaded', renderApp);

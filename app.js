// Initial Seed Data
const initialProducts = [
    { id: 1, name: 'Dell Monitor 24"', category: 'Electronics', price: 12000.00, quantity: 12, minStock: 3 },
    { id: 2, name: 'Wireless Mouse', category: 'Electronics', price: 850.00, quantity: 3, minStock: 5 },
    { id: 3, name: 'A4 Paper Bundle', category: 'Office Supplies', price: 250.00, quantity: 45, minStock: 10 },
    { id: 4, name: 'Mobile Cover', category: 'Hardware', price: 250.00, quantity: 15, minStock: 5 }
];

// Initialize Data from LocalStorage
function getStoredProducts() {
    const stored = localStorage.getItem('stockflow_products');
    if (!stored) {
        localStorage.setItem('stockflow_products', JSON.stringify(initialProducts));
        return initialProducts;
    }
    return JSON.parse(stored);
}

function saveProducts(products) {
    localStorage.setItem('stockflow_products', JSON.stringify(products));
    renderApp();
}

let chartInstance = null;

// Render Dashboard, Table, and Chart
function renderApp() {
    const products = getStoredProducts();
    const tableBody = document.getElementById('productTableBody');
    tableBody.innerHTML = '';

    let totalValuation = 0;
    let lowStockCount = 0;

    const labels = [];
    const chartData = [];

    products.forEach((p) => {
        totalValuation += p.price * p.quantity;
        if (p.quantity <= p.minStock) lowStockCount++;

        labels.push(p.name);
        chartData.push(p.quantity);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="fw-semibold text-dark">${p.name}</span></td>
            <td><span class="text-muted">${p.category}</span></td>
            <td><span class="fw-medium">₹${p.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></td>
            <td><span class="fw-bold">${p.quantity}</span></td>
            <td>
                ${p.quantity <= p.minStock 
                    ? '<span class="badge-soft-danger"><i class="fa-solid fa-circle me-1" style="font-size:6px;"></i>Low Stock</span>'
                    : '<span class="badge-soft-success"><i class="fa-solid fa-circle me-1" style="font-size:6px;"></i>In Stock</span>'}
            </td>
            <td>
                <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Update KPI Cards
    document.getElementById('metricTotalItems').innerText = products.length;
    document.getElementById('metricLowStock').innerText = lowStockCount;
    document.getElementById('metricTotalValuation').innerText = `₹${totalValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Render Chart
    renderChart(labels, chartData);
}

function renderChart(labels, data) {
    const ctx = document.getElementById('stockChart').getContext('2d');
    if (chartInstance) {
        chartInstance.destroy();
    }
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stock Level',
                data: data,
                backgroundColor: '#4f46e5',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true },
                x: { ticks: { font: { size: 10 } } }
            }
        }
    });
}

// Add New Product Handler
document.getElementById('addProductForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const products = getStoredProducts();

    const newProd = {
        id: Date.now(),
        name: document.getElementById('prodName').value,
        category: document.getElementById('prodCategory').value,
        quantity: parseInt(document.getElementById('prodQuantity').value),
        minStock: parseInt(document.getElementById('prodMinStock').value),
        price: parseFloat(document.getElementById('prodPrice').value)
    };

    products.push(newProd);
    saveProducts(products);

    // Reset Form and Hide Modal
    this.reset();
    const modalEl = document.getElementById('addProductModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
});

// Delete Product Handler
function deleteProduct(id) {
    let products = getStoredProducts();
    products = products.filter(p => p.id !== id);
    saveProducts(products);
}

// Reset Data Button
document.getElementById('resetDataBtn').addEventListener('click', () => {
    localStorage.removeItem('stockflow_products');
    renderApp();
});

// Search Filter Handler
document.getElementById('searchInput').addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#productTableBody tr');
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
});

// Initial Load
document.addEventListener('DOMContentLoaded', renderApp);

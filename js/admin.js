import CONFIG from './config.js';
import { isSupabaseConfigured } from './utils/supabase.js';
import { fetchRows, insertRow, updateRow, deleteRow, getSubscribers, removeSubscriber } from './utils/store.js';
import { sendPromoEmails } from './utils/email.js';
import { CATEGORY_SLUGS } from './utils/menu.js';
import { escapeHtml, formatPrice } from './utils/cart.js';

const loginView = document.getElementById('admin-login');
const dashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

function isLoggedIn() {
    return sessionStorage.getItem('emeraldAdmin') === '1';
}

function showDashboard() {
    loginView.classList.add('hidden');
    dashboard.classList.remove('hidden');
    initDashboard();
}

if (isLoggedIn()) {
    showDashboard();
} else {
    loginForm.addEventListener('submit', event => {
        event.preventDefault();
        const password = loginForm.querySelector('input[name="password"]').value;
        if (password === CONFIG.adminPassword) {
            sessionStorage.setItem('emeraldAdmin', '1');
            showDashboard();
        } else {
            loginError.textContent = 'Incorrect password. Please try again.';
        }
    });
}

document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('emeraldAdmin');
    window.location.reload();
});

// ---------------- Tabs ----------------

document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(`tab-${tab.dataset.tab}`);
        if (panel) panel.classList.add('active');
    });
});

function initDashboard() {
    if (!isSupabaseConfigured()) {
        document.getElementById('admin-config-warning').classList.remove('hidden');
    }
    renderItems();
    renderCategories();
    renderPromotions();
    renderSubscribers();
    renderCustomers();
    renderSettings();
}

// ---------------- Menu items ----------------

const itemsList = document.getElementById('items-list');
const itemForm = document.getElementById('item-form');
let editingItemId = null;

async function renderItems() {
    const items = await fetchRows('menu_items', { order: 'name' });
    itemsList.innerHTML = items && items.length
        ? items.map(row => `
            <div class="admin-row">
                <img src="${escapeHtml(row.image || '')}" alt="" class="admin-thumb">
                <div class="admin-row-main">
                    <strong>${escapeHtml(row.name)}</strong>
                    <span>${escapeHtml(row.category)} &middot; ${formatPrice(Number(row.price))}</span>
                </div>
                <span class="admin-badge ${row.available === false ? '' : 'ok'}">${row.available === false ? 'Hidden' : 'Available'}</span>
                <div class="admin-row-actions">
                    <button type="button" class="admin-btn" data-edit-item="${row.id}"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button type="button" class="admin-btn danger" data-delete-item="${row.id}" aria-label="Delete item"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `).join('')
        : '<p class="menu-empty">No menu items yet. Click "Add item" to create your first dish.</p>';

    itemsList.querySelectorAll('[data-edit-item]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const items = await fetchRows('menu_items', { eq: { column: 'id', value: btn.dataset.editItem } });
            if (items && items[0]) buildItemForm(items[0]);
        });
    });
    itemsList.querySelectorAll('[data-delete-item]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this menu item?')) return;
            await deleteRow('menu_items', btn.dataset.deleteItem);
            renderItems();
        });
    });
}

async function buildItemForm(row = {}) {
    editingItemId = row.id || null;
    itemForm.innerHTML = `
        <h3>${row.id ? 'Edit' : 'Add'} menu item</h3>
        <div class="admin-form-grid">
            <label>Name
                <input name="name" value="${escapeHtml(row.name || '')}" required>
            </label>
            <label>Category
                <input name="category" value="${escapeHtml(row.category || '')}" list="category-options" required>
                <datalist id="category-options">
                    ${CATEGORY_SLUGS.map(slug => `<option value="${escapeHtml(slug)}">`).join('')}
                </datalist>
            </label>
            <label>Price (&#8358;)
                <input type="number" name="price" min="0" step="50" value="${row.price ?? ''}" required>
            </label>
            <label>Rating
                <input type="number" name="rating" min="1" max="5" step="0.1" value="${row.rating ?? '4.5'}">
            </label>
            <label class="full-width">Image path or URL
                <input name="image" value="${escapeHtml(row.image || '')}" placeholder="images/categories/dish.jpg">
            </label>
            <label class="full-width">Description
                <textarea name="description" rows="2">${escapeHtml(row.description || '')}</textarea>
            </label>
        </div>
        <label class="admin-check">
            <input type="checkbox" name="available" ${row.available === false ? '' : 'checked'}> Available on the order page
        </label>
        <div class="admin-form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Save item</button>
            <button type="button" class="btn btn-secondary btn-sm" id="cancel-item-form">Cancel</button>
        </div>
    `;
    itemForm.classList.remove('hidden');
    document.getElementById('cancel-item-form').addEventListener('click', () => {
        itemForm.classList.add('hidden');
        editingItemId = null;
    });
}

document.getElementById('add-item').addEventListener('click', () => buildItemForm());

itemForm.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(itemForm);
    const payload = {
        name: formData.get('name').trim(),
        category: formData.get('category').trim(),
        price: Number(formData.get('price')),
        rating: Number(formData.get('rating')) || 4.5,
        image: formData.get('image').trim(),
        description: formData.get('description').trim(),
        available: formData.get('available') === 'on'
    };
    if (editingItemId) {
        await updateRow('menu_items', editingItemId, payload);
    } else {
        await insertRow('menu_items', payload);
    }
    itemForm.classList.add('hidden');
    editingItemId = null;
    renderItems();
});

// ---------------- Categories ----------------

const categoriesList = document.getElementById('categories-list');
const categoryForm = document.getElementById('category-form');
let editingCategoryId = null;

async function renderCategories() {
    const rows = await fetchRows('categories', { order: 'sort_order' });
    categoriesList.innerHTML = rows && rows.length
        ? rows.map(row => `
            <div class="admin-row">
                <img src="${escapeHtml(row.image || '')}" alt="" class="admin-thumb">
                <div class="admin-row-main">
                    <strong>${escapeHtml(row.name)}</strong>
                    <span>${escapeHtml(row.description || '')}</span>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="admin-btn" data-edit-category="${row.id}"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button type="button" class="admin-btn danger" data-delete-category="${row.id}" aria-label="Delete category"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `).join('')
        : '<p class="menu-empty">No categories yet.</p>';

    categoriesList.querySelectorAll('[data-edit-category]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const rows = await fetchRows('categories', { eq: { column: 'id', value: btn.dataset.editCategory } });
            if (rows && rows[0]) buildCategoryForm(rows[0]);
        });
    });
    categoriesList.querySelectorAll('[data-delete-category]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this category?')) return;
            await deleteRow('categories', btn.dataset.deleteCategory);
            renderCategories();
        });
    });
}

function buildCategoryForm(row = {}) {
    editingCategoryId = row.id || null;
    categoryForm.innerHTML = `
        <h3>${row.id ? 'Edit' : 'Add'} category</h3>
        <div class="admin-form-grid">
            <label>Name
                <input name="name" value="${escapeHtml(row.name || '')}" required>
            </label>
            <label>Image path or URL
                <input name="image" value="${escapeHtml(row.image || '')}" placeholder="images/categories/soups.jpg">
            </label>
            <label class="full-width">Description
                <textarea name="description" rows="2">${escapeHtml(row.description || '')}</textarea>
            </label>
        </div>
        <div class="admin-form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Save category</button>
            <button type="button" class="btn btn-secondary btn-sm" id="cancel-category-form">Cancel</button>
        </div>
    `;
    categoryForm.classList.remove('hidden');
    document.getElementById('cancel-category-form').addEventListener('click', () => {
        categoryForm.classList.add('hidden');
        editingCategoryId = null;
    });
}

document.getElementById('add-category').addEventListener('click', () => buildCategoryForm());

categoryForm.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(categoryForm);
    const payload = {
        name: formData.get('name').trim(),
        image: formData.get('image').trim(),
        description: formData.get('description').trim()
    };
    if (editingCategoryId) {
        await updateRow('categories', editingCategoryId, payload);
    } else {
        await insertRow('categories', payload);
    }
    categoryForm.classList.add('hidden');
    editingCategoryId = null;
    renderCategories();
});

// ---------------- Promotions ----------------

const promotionsList = document.getElementById('promotions-list');
const promotionForm = document.getElementById('promotion-form');
let editingPromotionId = null;

async function renderPromotions() {
    const rows = await fetchRows('promotions', { order: 'created_at', ascending: false });
    promotionsList.innerHTML = rows && rows.length
        ? rows.map(row => `
            <div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(row.title)}</strong>
                    <span>${escapeHtml(row.message || '')}${row.discount ? ` &middot; <em>${escapeHtml(row.discount)}</em>` : ''}</span>
                </div>
                <span class="admin-badge ${row.active ? 'ok' : ''}">${row.active ? 'Active' : 'Draft'}</span>
                <div class="admin-row-actions">
                    <button type="button" class="admin-btn" data-email-promo="${row.id}" title="Email subscribers"><i class="fa-solid fa-paper-plane"></i> Email</button>
                    <button type="button" class="admin-btn" data-edit-promotion="${row.id}"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button type="button" class="admin-btn danger" data-delete-promotion="${row.id}" aria-label="Delete promotion"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `).join('')
        : '<p class="menu-empty">No promotions yet.</p>';

    promotionsList.querySelectorAll('[data-edit-promotion]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const rows = await fetchRows('promotions', { eq: { column: 'id', value: btn.dataset.editPromotion } });
            if (rows && rows[0]) buildPromotionForm(rows[0]);
        });
    });
    promotionsList.querySelectorAll('[data-delete-promotion]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this promotion?')) return;
            await deleteRow('promotions', btn.dataset.deletePromotion);
            renderPromotions();
        });
    });
    promotionsList.querySelectorAll('[data-email-promo]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const rows = await fetchRows('promotions', { eq: { column: 'id', value: btn.dataset.emailPromo } });
            const promotion = rows && rows[0];
            if (!promotion) return;
            const subscribers = await getSubscribers();
            const sent = await sendPromoEmails(subscribers, promotion);
            alert(sent
                ? `Promotion emailed to ${sent} subscriber(s).`
                : 'EmailJS is not configured. Add your keys in js/config.js to send emails.');
        });
    });
}

function buildPromotionForm(row = {}) {
    editingPromotionId = row.id || null;
    promotionForm.innerHTML = `
        <h3>${row.id ? 'Edit' : 'Add'} promotion</h3>
        <div class="admin-form-grid">
            <label>Title
                <input name="title" value="${escapeHtml(row.title || '')}" required>
            </label>
            <label>Discount / code
                <input name="discount" value="${escapeHtml(row.discount || '')}" placeholder="e.g. 10% off with code EMERALD10">
            </label>
            <label class="full-width">Message
                <textarea name="message" rows="2">${escapeHtml(row.message || '')}</textarea>
            </label>
        </div>
        <label class="admin-check">
            <input type="checkbox" name="active" ${row.active === false ? '' : 'checked'}> Active
        </label>
        <div class="admin-form-actions">
            <button type="submit" class="btn btn-primary btn-sm">Save promotion</button>
            <button type="button" class="btn btn-secondary btn-sm" id="cancel-promotion-form">Cancel</button>
        </div>
    `;
    promotionForm.classList.remove('hidden');
    document.getElementById('cancel-promotion-form').addEventListener('click', () => {
        promotionForm.classList.add('hidden');
        editingPromotionId = null;
    });
}

document.getElementById('add-promotion').addEventListener('click', () => buildPromotionForm());

promotionForm.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(promotionForm);
    const payload = {
        title: formData.get('title').trim(),
        discount: formData.get('discount').trim(),
        message: formData.get('message').trim(),
        active: formData.get('active') === 'on'
    };
    if (editingPromotionId) {
        await updateRow('promotions', editingPromotionId, payload);
    } else {
        await insertRow('promotions', payload);
    }
    promotionForm.classList.add('hidden');
    editingPromotionId = null;
    renderPromotions();
});

// ---------------- Subscribers ----------------

const subscribersList = document.getElementById('subscribers-list');

async function renderSubscribers() {
    const rows = await getSubscribers();
    subscribersList.innerHTML = rows && rows.length
        ? rows.map(row => `
            <div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(row.email)}</strong>
                </div>
                <div class="admin-row-actions">
                    <button type="button" class="admin-btn danger" data-delete-subscriber="${row.id}" aria-label="Remove subscriber"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `).join('')
        : '<p class="menu-empty">No subscribers yet.</p>';

    subscribersList.querySelectorAll('[data-delete-subscriber]').forEach(btn => {
        btn.addEventListener('click', async () => {
            await removeSubscriber(btn.dataset.deleteSubscriber);
            renderSubscribers();
        });
    });
}

// ---------------- Customers ----------------

const customersList = document.getElementById('customers-list');

async function renderCustomers() {
    let rows = null;
    try {
        rows = await fetchRows('customers', { order: 'created_at', ascending: false });
    } catch {
        rows = null;
    }

    // Demo/fallback: show local users in case Supabase is not configured.
    if (!rows || !rows.length) {
        let localUsers = [];
        try {
            localUsers = JSON.parse(localStorage.getItem('emeraldUsers') || '[]');
        } catch {
            localUsers = [];
        }
        customersList.innerHTML = localUsers.length
            ? localUsers.map(user => `
                <div class="admin-row">
                    <div class="admin-row-main">
                        <strong>${escapeHtml(user.name || '')}</strong>
                        <span>${escapeHtml(user.email || '')}</span>
                    </div>
                    <span class="admin-badge ok">Local</span>
                </div>
            `).join('')
            : '<p class="menu-empty">No customers yet. Accounts created on the site will appear here.</p>';
        return;
    }

    customersList.innerHTML = rows.map(row => {
        const lastSeen = row.last_seen ? new Date(row.last_seen).toLocaleString() : 'Never';
        const remember = row.remember_me ? 'Remembered' : 'Session';
        return `
            <div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(row.name)}</strong>
                    <span>${escapeHtml(row.email)} &middot; Last seen: ${escapeHtml(lastSeen)}</span>
                </div>
                <span class="admin-badge ${row.remember_me ? 'ok' : ''}">${remember}</span>
                <div class="admin-row-actions">
                    <button type="button" class="admin-btn danger" data-delete-customer="${row.id}" aria-label="Delete customer"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');

    customersList.querySelectorAll('[data-delete-customer]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this customer account?')) return;
            await deleteRow('customers', btn.dataset.deleteCustomer);
            renderCustomers();
        });
    });
}

// ---------------- Settings ----------------

const settingsForm = document.getElementById('settings-form');

async function renderSettings() {
    const current = JSON.parse(localStorage.getItem('emeraldSettings') || '{}');
    const fields = ['hero_title', 'hero_subtitle', 'promo_banner', 'announcement'];
    for (const key of fields) {
        const rows = await fetchRows('settings', { eq: { column: 'id', value: key } });
        const value = (rows && rows.length) ? rows[0].value : current[key];
        const input = settingsForm.querySelector(`[name="${key}"]`);
        if (input) input.value = value || '';
    }
}

async function saveSetting(key, value) {
    const rows = await fetchRows('settings', { eq: { column: 'id', value: key } });
    if (rows && rows.length) {
        await updateRow('settings', rows[0].id, { value });
    } else if (rows && !rows.length) {
        await insertRow('settings', { id: key, value });
    }
    const settings = JSON.parse(localStorage.getItem('emeraldSettings') || '{}');
    settings[key] = value;
    localStorage.setItem('emeraldSettings', JSON.stringify(settings));
}

settingsForm.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(settingsForm);
    for (const [key, value] of formData.entries()) {
        await saveSetting(key, value.trim());
    }
    const message = settingsForm.querySelector('.form-message');
    message.textContent = 'Settings saved.';
    setTimeout(() => { message.textContent = ''; }, 3000);
});

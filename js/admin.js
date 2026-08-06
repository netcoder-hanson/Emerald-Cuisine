import CONFIG from './config.js';
import { isSupabaseConfigured } from './utils/supabase.js';
import {
    fetchRows, insertRow, updateRow, deleteRow, countRows, fetchRowsIn,
    uploadImage, invokeEdgeFunction, toCSV, downloadBlob,
    getSubscribers, removeSubscriber, getSetting
} from './utils/store.js';
import { CATEGORY_SLUGS } from './utils/menu.js';
import { escapeHtml, formatPrice } from './utils/cart.js';
import { getAdminCredentials, saveAdminCredentials, isAdminCredentials } from './utils/admin.js';

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
    initAdminCredentialsForm();
}

document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('emeraldAdmin');
    window.location.reload();
});

document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(`tab-${tab.dataset.tab}`);
        if (panel) panel.classList.add('active');
    });
});

const adminModal = document.getElementById('admin-modal');
const adminModalTitle = document.getElementById('admin-modal-title');
const adminModalBody = document.getElementById('admin-modal-body');
const adminToast = document.getElementById('admin-toast');
let lastModalFocus = null;
let modalCloseGuard = null;

function openModal(title, bodyHtml) {
    if (!adminModal) return;
    adminModalTitle.textContent = title;
    adminModalBody.innerHTML = bodyHtml;
    if (window.lucide) window.lucide.createIcons();
    adminModal.classList.add('open');
    adminModal.setAttribute('aria-hidden', 'false');
    lastModalFocus = document.activeElement;
    document.body.classList.add('modal-open');
    modalCloseGuard = null;
    const first = adminModal.querySelector('input, select, textarea, button');
    if (first) first.focus();
}

function closeModal() {
    if (!adminModal) return;
    adminModal.classList.remove('open');
    adminModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastModalFocus instanceof HTMLElement) lastModalFocus.focus();
    lastModalFocus = null;
    modalCloseGuard = null;
}

function requestCloseModal() {
    if (modalCloseGuard && !modalCloseGuard()) return;
    closeModal();
}

if (adminModal) {
    // Delegated listener: buttons injected later via openModal() bodyHtml
    // are matched here too (event delegation), so Cancel/dialog-close
    // buttons inside dynamically built forms always work.
    adminModal.addEventListener('click', event => {
        if (event.target.closest('[data-close-modal]')) {
            requestCloseModal();
            return;
        }
        if (event.target === adminModal) requestCloseModal();
    });
}

document.addEventListener('keydown', event => {
    if (!adminModal || !adminModal.classList.contains('open')) return;
    if (event.key === 'Escape') {
        requestCloseModal();
        return;
    }
    if (event.key === 'Tab') {
        const focusable = [...adminModal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.disabled && el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});

let toastTimer = null;
function showToast(message, type = 'success') {
    if (!adminToast) return;
    adminToast.textContent = message;
    adminToast.className = `admin-toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        adminToast.classList.remove('show');
    }, 4200);
}

function setFieldError(form, name, message) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    input.classList.add('field-error');
    const existing = form.querySelector(`[data-error-for="${name}"]`);
    if (existing) existing.remove();
    const err = document.createElement('p');
    err.className = 'admin-field-error';
    err.setAttribute('data-error-for', name);
    err.textContent = message;
    input.insertAdjacentElement('afterend', err);
}

function clearFieldErrors(form) {
    form.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    form.querySelectorAll('.admin-field-error').forEach(el => el.remove());
}

function initUploadZone(zone, { maxSizeMB = 5, onImage } = {}) {
    const input = zone.querySelector('[data-upload-input]');
    const preview = zone.querySelector('[data-upload-preview]');
    const state = { file: null, dataUrl: null };

    function validate(file) {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            showToast('Please choose a JPG, PNG or WebP image.', 'error');
            return false;
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
            showToast(`Image must be ${maxSizeMB}MB or smaller.`, 'error');
            return false;
        }
        return true;
    }

    function handleFile(file) {
        if (!file) return;
        if (!validate(file)) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (preview) {
                preview.src = reader.result;
                preview.classList.remove('hidden');
            }
            zone.classList.add('has-preview');
            state.file = file;
            state.dataUrl = reader.result;
            if (onImage) onImage(state);
        };
        reader.readAsDataURL(file);
    }

    if (input) {
        input.addEventListener('change', () => handleFile(input.files[0]));
    }
    zone.addEventListener('click', event => {
        if (event.target === preview) return;
        if (input) input.click();
    });
    zone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (input) input.click();
        }
    });
    zone.addEventListener('dragover', event => {
        event.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', event => {
        event.preventDefault();
        zone.classList.remove('dragover');
        if (event.dataTransfer && event.dataTransfer.files) handleFile(event.dataTransfer.files[0]);
    });

    return {
        state,
        setPreview(url) {
            if (preview && url) {
                preview.src = url;
                preview.classList.remove('hidden');
                zone.classList.add('has-preview');
            }
        }
    };
}

// Matches a menu item to a category row. Checks the foreign key first,
// then falls back to a case-insensitive name comparison so items created
// with a plain category slug ("breakfast") still match "Breakfast".
function categoryMatches(item, cat) {
    if (!item || !cat) return false;
    if (cat.id && String(item.category_id || '') === String(cat.id)) return true;
    const itemName = String(item.category || '').trim().toLowerCase();
    const catName = String(cat.name || '').trim().toLowerCase();
    return itemName === catName;
}

// Re-renders any <i data-lucide="..."> elements added to the DOM after the
// initial page load (list rows, modal forms, etc.). Safe no-op when Lucide
// is not loaded (e.g. offline).
function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

async function getCurrencySymbol() {
    try {
        const currency = await getSetting('currency');
        return currency || CONFIG.defaults.currency || '₦';
    } catch {
        return CONFIG.defaults.currency || '₦';
    }
}

function formatMoney(value, symbol) {
    const number = Number(value || 0);
    return `${symbol}${number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const itemsList = document.getElementById('items-list');
let editingItemId = null;

async function getAdminItems() {
    return (await fetchRows('menu_items', { order: 'name' })) || [];
}

async function renderItems() {
    if (!itemsList) return;
    if (!isSupabaseConfigured()) {
        itemsList.innerHTML = '<p class="admin-empty">Menu editing requires a Supabase connection.</p>';
        return;
    }
    const currency = await getCurrencySymbol();
    let items;
    try {
        items = await getAdminItems();
    } catch {
        items = [];
    }

    itemsList.innerHTML = items && items.length
        ? items.map(row => {
            const available = row.is_available !== false && row.available !== false;
            const image = row.image_url || row.image || '';
            return `
                <div class="admin-row">
                    <img src="${escapeHtml(image)}" alt="${escapeHtml(row.name)}" class="admin-thumb" loading="lazy">
                    <div class="admin-row-main">
                        <strong>${escapeHtml(row.name)}</strong>
                        <span>${escapeHtml(row.category || '')} &middot; ${formatMoney(row.price, currency)}</span>
                    </div>
                    <span class="admin-badge ${available ? 'ok' : ''}">${available ? 'In stock' : 'Hidden'}</span>
                    <div class="admin-row-actions">
                        <button type="button" class="admin-btn" data-edit-item="${escapeHtml(row.id)}"><i data-lucide="pen" aria-hidden="true"></i> Edit</button>
                        <button type="button" class="admin-btn danger" data-delete-item="${escapeHtml(row.id)}" aria-label="Delete ${escapeHtml(row.name)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="admin-empty">No menu items yet. Click "Add item" to create your first dish.</p>';

    refreshIcons();

    itemsList.querySelectorAll('[data-edit-item]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const items = await getAdminItems();
            const row = items.find(item => String(item.id) === btn.dataset.editItem);
            if (row) buildItemForm(row);
        });
    });
    itemsList.querySelectorAll('[data-delete-item]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.deleteItem;
            if (!confirm('Delete this menu item? This cannot be undone.')) return;
            try {
                await deleteRow('menu_items', id);
                showToast('Menu item deleted.');
                renderItems();
            } catch (error) {
                showToast(`Could not delete item: ${error.message}`, 'error');
            }
        });
    });
}

async function buildItemForm(row = {}) {
    editingItemId = row.id || null;
    const currency = await getCurrencySymbol();
    let categories = [];
    try {
        const rows = await fetchRows('categories', { order: 'display_order' });
        categories = (rows && rows.length) ? rows : [];
    } catch {
        categories = [];
    }
    if (!categories.length) {
        categories = CATEGORY_SLUGS.map(slug => ({ name: slug.charAt(0).toUpperCase() + slug.slice(1) }));
    }

    const options = categories.map(cat => {
        const value = cat.id || cat.name;
        const selected = String(row.category_id || row.category || '') === String(value) || String(row.category || '') === String(cat.name) ? 'selected' : '';
        return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(cat.name)}</option>`;
    }).join('');

    const available = row.is_available !== false && row.available !== false;
    const currentImage = row.image_url || row.image || '';

    openModal(`${row.id ? 'Edit' : 'Add'} menu item`, `
        <form id="item-form" novalidate>
            <div class="admin-form-grid">
                <label>Product name
                    <input name="name" value="${escapeHtml(row.name || '')}" maxlength="120" required>
                </label>
                <label>Price (${escapeHtml(currency)})
                    <input type="number" name="price" min="0" step="0.01" value="${row.price ?? ''}" required>
                </label>
                <label>Category
                    <select name="category" required>
                        <option value="">Select a category&hellip;</option>
                        ${options}
                    </select>
                </label>
                <label>Availability
                    <select name="available">
                        <option value="1" ${available ? 'selected' : ''}>In stock</option>
                        <option value="0" ${available ? '' : 'selected'}>Sold out</option>
                    </select>
                </label>
                <label class="full-width">Description
                    <textarea name="description" rows="3" placeholder="Describe this dish&hellip;" required>${escapeHtml(row.description || '')}</textarea>
                </label>
            </div>
            <div class="full-width admin-logo-field">
                <span class="admin-field-label">Image (JPG, PNG or WebP &mdash; max 5MB)</span>
                <div class="admin-upload-zone" data-upload-zone tabindex="0" role="button" aria-label="Upload item image">
                    <input type="file" accept="image/jpeg,image/png,image/webp" class="admin-upload-input" data-upload-input aria-hidden="true" tabindex="-1">
                    <i data-lucide="cloud-upload" aria-hidden="true"></i>
                    <span>Drag &amp; drop an image here, or <strong>browse</strong></span>
                    <img class="admin-upload-preview hidden" data-upload-preview alt="Item image preview">
                </div>
            </div>
            <div class="admin-form-actions">
                <button type="submit" class="btn btn-primary btn-sm" data-save>${row.id ? 'Save changes' : 'Add item'}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Cancel</button>
            </div>
            <p class="form-message" data-form-message aria-live="polite"></p>
        </form>
    `);

    const form = document.getElementById('item-form');
    const zone = form.querySelector('[data-upload-zone]');
    const upload = initUploadZone(zone);
    if (currentImage) upload.setPreview(currentImage);

    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });
    modalCloseGuard = () => {
        if (!dirty) return true;
        return confirm('You have unsaved changes. Discard them?');
    };

    const saveButton = form.querySelector('[data-save]');
    const requiredFields = ['name', 'price', 'category', 'description'];

    function validateForm() {
        clearFieldErrors(form);
        let valid = true;
        if (!form.querySelector('[name="name"]').value.trim()) {
            setFieldError(form, 'name', 'Please enter a product name.'); valid = false;
        }
        const price = Number(form.querySelector('[name="price"]').value);
        if (!form.querySelector('[name="price"]').value || Number.isNaN(price) || price < 0) {
            setFieldError(form, 'price', 'Please enter a valid price (0 or more).'); valid = false;
        }
        if (!form.querySelector('[name="category"]').value) {
            setFieldError(form, 'category', 'Please choose a category.'); valid = false;
        }
        if (!form.querySelector('[name="description"]').value.trim()) {
            setFieldError(form, 'description', 'Please enter a description.'); valid = false;
        }
        saveButton.disabled = !valid;
        return valid;
    }

    requiredFields.forEach(name => {
        form.querySelector(`[name="${name}"]`).addEventListener('input', validateForm);
    });
    saveButton.disabled = true;
    validateForm();

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!validateForm()) return;

        const message = form.querySelector('[data-form-message]');
        message.textContent = '';
        message.classList.remove('error');

        const name = form.querySelector('[name="name"]').value.trim();
        const description = form.querySelector('[name="description"]').value.trim();
        const price = Number(form.querySelector('[name="price"]').value);
        const categoryOption = form.querySelector('[name="category"]').selectedOptions[0];
        const category = categoryOption ? categoryOption.text : '';
        const categoryValue = form.querySelector('[name="category"]').value;
        const available = form.querySelector('[name="available"]').value === '1';

        try {
            let imageUrl = currentImage;
            let image = currentImage;

            if (upload.state.file) {
                if (isSupabaseConfigured()) {
                    imageUrl = await uploadImage(upload.state.file, 'menu');
                    image = imageUrl || image;
                    if (!imageUrl) {
                        // Storage unavailable — fall back to data URL so the edit is never lost.
                        image = upload.state.dataUrl || image;
                        imageUrl = image;
                    }
                } else {
                    image = upload.state.dataUrl || image;
                    imageUrl = image;
                }
            }

            const payload = {
                name,
                description,
                price,
                category,
                category_id: /^[0-9a-f-]{36}$/i.test(categoryValue) ? categoryValue : null,
                image,
                image_url: imageUrl,
                available,
                is_available: available,
                updated_at: new Date().toISOString()
            };

            if (editingItemId) {
                await updateRow('menu_items', editingItemId, payload);
                showToast('Menu item updated.');
            } else {
                await insertRow('menu_items', payload);
                showToast('Menu item added.');
            }

            modalCloseGuard = null;
            closeModal();
            renderItems();
        } catch (error) {
            message.textContent = `Could not save the item: ${error.message}`;
            message.classList.add('error');
            showToast(`Could not save the item: ${error.message}`, 'error');
        }
    });
}

document.getElementById('add-item')?.addEventListener('click', () => {
    if (!isSupabaseConfigured()) {
        showToast('Menu editing requires a Supabase connection.', 'error');
        return;
    }
    buildItemForm();
});

const categoriesList = document.getElementById('categories-list');
let editingCategoryId = null;

async function getAdminCategories() {
    try {
        const rows = await fetchRows('categories', { order: 'display_order' });
        if (rows && rows.length) return rows;
    } catch (error) {
        showToast(`Could not load categories: ${error.message}`, 'error');
    }
    return CATEGORY_SLUGS.map((slug, index) => ({
        id: null,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        display_order: index
    }));
}

async function renderCategories() {
    if (!categoriesList) return;
    let categories;
    let items;
    try {
        [categories, items] = await Promise.all([getAdminCategories(), getAdminItems()]);
    } catch {
        categories = [];
        items = [];
    }

    categoriesList.innerHTML = categories && categories.length
        ? categories.map(cat => {
            const count = items.filter(item => categoryMatches(item, cat)).length;
            return `
                <div class="admin-row">
                    <div class="admin-row-main">
                        <strong>${escapeHtml(cat.name)}</strong>
                        <span>${count} item${count === 1 ? '' : 's'}</span>
                    </div>
                    <div class="admin-row-actions">
                        <button type="button" class="admin-btn" data-edit-category="${escapeHtml(cat.id || cat.name)}"><i data-lucide="pen" aria-hidden="true"></i> Edit</button>
                        <button type="button" class="admin-btn danger" data-delete-category="${escapeHtml(cat.id || cat.name)}" aria-label="Delete ${escapeHtml(cat.name)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="admin-empty">No categories yet.</p>';

    refreshIcons();

    categoriesList.querySelectorAll('[data-edit-category]').forEach(btn => {
        btn.addEventListener('click', () => {
            const found = categories.find(cat => String(cat.id || cat.name) === btn.dataset.editCategory);
            if (found) buildCategoryForm(found);
        });
    });
    categoriesList.querySelectorAll('[data-delete-category]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.deleteCategory;
            const cat = categories.find(c => String(c.id || c.name) === key);
            if (!cat) return;
            const count = items.filter(item => categoryMatches(item, cat)).length;
            if (count > 0) {
                alert(`Cannot delete "${cat.name}" because ${count} menu item(s) are assigned to it. Reassign or remove those items first.`);
                return;
            }
            if (!confirm(`Delete category "${cat.name}"?`)) return;
            try {
                if (cat.id) {
                    await deleteRow('categories', cat.id);
                }
                showToast('Category deleted.');
                renderCategories();
            } catch (error) {
                showToast(`Could not delete category: ${error.message}`, 'error');
            }
        });
    });
}

function buildCategoryForm(row = {}) {
    editingCategoryId = row.id || null;
    openModal(`${row.id ? 'Edit' : 'Add'} category`, `
        <form id="category-form" novalidate>
            <div class="admin-form-grid">
                <label>Name
                    <input name="name" value="${escapeHtml(row.name || '')}" maxlength="80" required>
                </label>
                <label>Display order (lower = first)
                    <input type="number" name="display_order" min="0" step="1" value="${row.display_order ?? row.sort_order ?? 0}">
                </label>
            </div>
            <div class="admin-form-actions">
                <button type="submit" class="btn btn-primary btn-sm">${row.id ? 'Save changes' : 'Add category'}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Cancel</button>
            </div>
            <p class="form-message" data-form-message aria-live="polite"></p>
        </form>
    `);

    const form = document.getElementById('category-form');
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    modalCloseGuard = () => (!dirty || confirm('You have unsaved changes. Discard them?'));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const message = form.querySelector('[data-form-message]');
        message.textContent = '';
        message.classList.remove('error');
        clearFieldErrors(form);

        const name = form.querySelector('[name="name"]').value.trim();
        if (!name) {
            setFieldError(form, 'name', 'Please enter a category name.');
            return;
        }
        const displayOrder = Number(form.querySelector('[name="display_order"]').value) || 0;

        try {
            if (editingCategoryId) {
                await updateRow('categories', editingCategoryId, { name, display_order, sort_order: displayOrder });
                showToast('Category updated.');
            } else {
                await insertRow('categories', { name, display_order, sort_order: displayOrder });
                showToast('Category added.');
            }
            modalCloseGuard = null;
            closeModal();
            renderCategories();
        } catch (error) {
            message.textContent = `Could not save the category: ${error.message}`;
            message.classList.add('error');
            showToast(`Could not save the category: ${error.message}`, 'error');
        }
    });
}

document.getElementById('add-category')?.addEventListener('click', () => buildCategoryForm());

const promotionsList = document.getElementById('promotions-list');
let editingPromotionId = null;

async function getAdminPromotions() {
    try {
        const rows = await fetchRows('promotions', { order: 'created_at', ascending: false });
        if (rows && rows.length) return rows;
    } catch (error) {
        showToast(`Could not load promotions: ${error.message}`, 'error');
    }
    return [];
}

function formatPromoDates(row) {
    const start = row.start_date ? new Date(`${row.start_date}T00:00:00`) : null;
    const end = row.end_date ? new Date(`${row.end_date}T00:00:00`) : null;
    const format = date => date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    if (start && end) return `${format(start)} &rarr; ${format(end)}`;
    if (start) return `From ${format(start)}`;
    if (end) return `Until ${format(end)}`;
    return '';
}

function formatDiscount(row) {
    if (row.discount_value === null || row.discount_value === undefined) return '';
    const value = Number(row.discount_value);
    return row.discount_type === 'fixed' ? formatMoney(value, '₦') : `${value}%`;
}

function lastSentNote(row) {
    if (!row.last_sent_at) return '';
    const date = new Date(row.last_sent_at).toLocaleString();
    const sent = row.last_sent_count ?? '';
    const failed = row.last_failed_count ?? '';
    let text = `Last sent: ${date}`;
    if (sent !== '') text += ` &middot; ${sent} sent`;
    if (failed !== '' && Number(failed) > 0) text += ` &middot; ${failed} failed`;
    return `<p class="admin-live-note">${text}</p>`;
}

async function renderPromotions() {
    if (!promotionsList) return;
    let rows;
    try {
        rows = await getAdminPromotions();
    } catch {
        rows = [];
    }

    promotionsList.innerHTML = rows && rows.length
        ? rows.map(row => `
            <div class="admin-row">
                <div class="admin-row-main">
                    <strong>${escapeHtml(row.title)}</strong>
                    <span>${escapeHtml(row.description || row.message || '')}${row.discount_value !== null && row.discount_value !== undefined ? ` &middot; <em>${escapeHtml(formatDiscount(row))}</em>` : ''}</span>
                    ${formatPromoDates(row) ? `<span>${formatPromoDates(row)}</span>` : ''}
                    ${lastSentNote(row)}
                </div>
                <span class="admin-badge ${row.is_live || row.active ? 'ok' : ''}">${row.is_live || row.active ? 'Live' : 'Draft'}</span>
                <div class="admin-row-actions">
                    ${row.is_live ? '' : `<button type="button" class="admin-btn" data-golive="${escapeHtml(row.id)}" title="Set live and email subscribers"><i data-lucide="send" aria-hidden="true"></i> Go live</button>`}
                    <button type="button" class="admin-btn" data-edit-promotion="${escapeHtml(row.id)}"><i data-lucide="pen" aria-hidden="true"></i> Edit</button>
                    <button type="button" class="admin-btn danger" data-delete-promotion="${escapeHtml(row.id)}" aria-label="Delete promotion"><i data-lucide="trash-2" aria-hidden="true"></i></button>
                </div>
            </div>
        `).join('')
        : '<p class="admin-empty">No promotions yet. Click "Add promotion" to create one.</p>';

    refreshIcons();

    promotionsList.querySelectorAll('[data-edit-promotion]').forEach(btn => {
        btn.addEventListener('click', () => {
            const found = rows.find(p => String(p.id) === btn.dataset.editPromotion);
            if (found) buildPromotionForm(found);
        });
    });
    promotionsList.querySelectorAll('[data-delete-promotion]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this promotion?')) return;
            try {
                await deleteRow('promotions', btn.dataset.deletePromotion);
                showToast('Promotion deleted.');
                renderPromotions();
            } catch (error) {
                showToast(`Could not delete promotion: ${error.message}`, 'error');
            }
        });
    });
    promotionsList.querySelectorAll('[data-golive]').forEach(btn => {
        btn.addEventListener('click', () => goLive(btn.dataset.golive));
    });
}

async function goLive(promotionId) {
    let row;
    try {
        const rows = await fetchRows('promotions', { eq: { column: 'id', value: promotionId } });
        row = rows && rows[0];
    } catch {
        // Could not fetch promotion
    }
    if (!row) return;

    // Duplicate-send guard: if this promotion was already emailed and its
    // content has not changed since (updated_at <= last_sent_at), block the
    // send. The admin must edit the content (bumping updated_at) first.
    if (row.is_live && row.last_sent_at) {
        const lastSent = new Date(row.last_sent_at);
        const updated = row.updated_at ? new Date(row.updated_at) : null;
        if (!updated || updated <= lastSent) {
            showToast(`"${row.title}" was already emailed on ${lastSent.toLocaleString()}. Edit its content to email again.`, 'info');
            return;
        }
    }

    const explicit = confirm(`This will email ALL active subscribers and opted-in customers about "${row.title}". Emails cannot be undone. Continue?`);
    if (!explicit) return;

    const button = document.querySelector(`[data-golive="${promotionId}"]`);
    if (button) {
        button.disabled = true;
        button.textContent = 'Sending…';
    }

    try {
        // Promotion mail goes ONLY through the MailerSend-powered edge
        // function. EmailJS is no longer used for promo blasts.
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase is not configured. Promotion emails need the deployed send-promotion-email edge function.');
        }
        const result = await invokeEdgeFunction('send-promotion-email', { promotion_id: promotionId });
        if (!result) throw new Error('The email function returned no result. Is it deployed?');

        const sent = Number(result.sent ?? 0);
        const failed = Number(result.failed ?? 0);

        if (isSupabaseConfigured()) {
            const payload = {
                is_live: true,
                last_sent_at: new Date().toISOString(),
                last_sent_count: sent,
                last_failed_count: failed
            };
            try {
                await updateRow('promotions', promotionId, payload);
            } catch {
                // Legacy table without count columns — keep just the timestamp.
                await updateRow('promotions', promotionId, { is_live: true, last_sent_at: new Date().toISOString() });
            }
        } else {
            const local = readLocal('emeraldAdminPromotions', []);
            const index = local.findIndex(p => String(p.id) === String(promotionId));
            if (index > -1) {
                local[index] = { ...local[index], is_live: true, last_sent_at: new Date().toISOString(), last_sent_count: sent, last_failed_count: failed };
                writeLocal('emeraldAdminPromotions', local);
            }
        }

        showToast(`${sent} email(s) sent, ${failed} failed.`);
        renderPromotions();
    } catch (error) {
        if (button) {
            button.disabled = false;
            button.textContent = 'Go live';
        }
        showToast(`Could not send emails: ${error.message}`, 'error');
    }
}

function buildPromotionForm(row = {}) {
    editingPromotionId = row.id || null;
    openModal(`${row.id ? 'Edit' : 'Add'} promotion`, `
        <form id="promotion-form" novalidate>
            <div class="admin-form-grid">
                <label>Title
                    <input name="title" value="${escapeHtml(row.title || '')}" maxlength="120" required>
                </label>
                <label>Discount type
                    <select name="discount_type">
                        <option value="percentage" ${row.discount_type === 'fixed' ? '' : 'selected'}>Percentage (%)</option>
                        <option value="fixed" ${row.discount_type === 'fixed' ? 'selected' : ''}>Fixed amount</option>
                    </select>
                </label>
                <label>Discount value
                    <input type="number" name="discount_value" min="0" step="0.01" value="${row.discount_value ?? ''}">
                </label>
                <label>Start date
                    <input type="date" name="start_date" value="${escapeHtml(row.start_date || '')}">
                </label>
                <label>End date
                    <input type="date" name="end_date" value="${escapeHtml(row.end_date || '')}">
                </label>
                <label class="full-width">Description
                    <textarea name="description" rows="3" placeholder="Tell subscribers what this offer includes&hellip;" required>${escapeHtml(row.description || row.message || '')}</textarea>
                </label>
            </div>
            <div class="admin-form-actions">
                <button type="submit" class="btn btn-primary btn-sm">${row.id ? 'Save changes' : 'Add promotion'}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Cancel</button>
            </div>
            <p class="form-message" data-form-message aria-live="polite"></p>
        </form>
    `);

    const form = document.getElementById('promotion-form');
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('change', () => { dirty = true; });
    modalCloseGuard = () => (!dirty || confirm('You have unsaved changes. Discard them?'));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const message = form.querySelector('[data-form-message]');
        message.textContent = '';
        message.classList.remove('error');
        clearFieldErrors(form);

        const title = form.querySelector('[name="title"]').value.trim();
        const description = form.querySelector('[name="description"]').value.trim();
        if (!title) {
            setFieldError(form, 'title', 'Please enter a title.');
            return;
        }
        if (!description) {
            setFieldError(form, 'description', 'Please enter a description.');
            return;
        }

        const startDate = form.querySelector('[name="start_date"]').value;
        const endDate = form.querySelector('[name="end_date"]').value;
        if (startDate && endDate && endDate < startDate) {
            setFieldError(form, 'end_date', 'End date must be on or after the start date.');
            return;
        }

        const payload = {
            title,
            description,
            message: description,
            discount_type: form.querySelector('[name="discount_type"]').value,
            discount_value: form.querySelector('[name="discount_value"]').value === '' ? null : Number(form.querySelector('[name="discount_value"]').value),
            start_date: startDate || null,
            end_date: endDate || null,
            updated_at: new Date().toISOString()
        };
        // Editing content resets the live flag so the admin can email again
        // (the duplicate-send guard in goLive() re-checks on activation).
        if (editingPromotionId) payload.is_live = false;

        try {
            if (editingPromotionId) {
                await updateRow('promotions', editingPromotionId, payload);
                showToast('Promotion updated.');
            } else {
                await insertRow('promotions', { ...payload, active: true, is_live: false });
                showToast('Promotion added.');
            }
            modalCloseGuard = null;
            closeModal();
            renderPromotions();
        } catch (error) {
            message.textContent = `Could not save the promotion: ${error.message}`;
            message.classList.add('error');
            showToast(`Could not save the promotion: ${error.message}`, 'error');
        }
    });
}

document.getElementById('add-promotion')?.addEventListener('click', () => buildPromotionForm());

const subscribersList = document.getElementById('subscribers-list');
const subscriberSearch = document.getElementById('subscriber-search');

async function renderSubscribers(filter = '') {
    if (!subscribersList) return;
    let rows;
    try {
        rows = await getSubscribers();
    } catch (error) {
        showToast(`Could not load subscribers: ${error.message}`, 'error');
        rows = null;
    }
    if (!rows) rows = [];

    const query = (filter || '').toLowerCase();
    const filtered = rows.filter(row => !query || String(row.email || '').toLowerCase().includes(query));

    subscribersList.innerHTML = filtered && filtered.length
        ? filtered.map(row => {
            const status = row.status || 'active';
            const date = row.subscribed_at || row.created_at;
            return `
                <div class="admin-row">
                    <div class="admin-row-main">
                        <strong>${escapeHtml(row.email)}</strong>
                        ${date ? `<span>Subscribed ${escapeHtml(new Date(date).toLocaleDateString())}</span>` : ''}
                    </div>
                    <span class="admin-badge ${status === 'active' ? 'ok' : ''}">${status === 'active' ? 'Active' : 'Unsubscribed'}</span>
                    <div class="admin-row-actions">
                        <button type="button" class="admin-btn danger" data-delete-subscriber="${escapeHtml(row.id || row.email)}" aria-label="Remove subscriber ${escapeHtml(row.email)}"><i data-lucide="trash-2" aria-hidden="true"></i> Remove</button>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="admin-empty">No subscribers found.</p>';

    refreshIcons();

    subscribersList.querySelectorAll('[data-delete-subscriber]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remove this subscriber? They will no longer receive promo emails.')) return;
            try {
                await removeSubscriber(btn.dataset.deleteSubscriber);
                showToast('Subscriber removed.');
                renderSubscribers(subscriberSearch?.value || '');
            } catch (error) {
                showToast(`Could not remove subscriber: ${error.message}`, 'error');
            }
        });
    });
}

if (subscriberSearch) {
    subscriberSearch.addEventListener('input', () => renderSubscribers(subscriberSearch.value));
}

document.getElementById('export-subscribers')?.addEventListener('click', async () => {
    try {
        const rows = await getSubscribers() || [];
        const csvRows = rows.map(row => ({
            email: row.email,
            status: row.status || 'active',
            subscribed_at: row.subscribed_at || row.created_at || ''
        }));
        downloadBlob('emerald-cuisine-subscribers.csv', toCSV(csvRows), 'text/csv');
        showToast(`Exported ${csvRows.length} subscriber(s).`);
    } catch (error) {
        showToast(`Could not export subscribers: ${error.message}`, 'error');
    }
});

const customersList = document.getElementById('customers-list');
const customerSearch = document.getElementById('customer-search');

async function getAdminCustomers() {
    try {
        const rows = await fetchRows('customers', { order: 'created_at', ascending: false });
        if (rows && rows.length) return rows;
    } catch (error) {
        showToast(`Could not load customers: ${error.message}`, 'error');
    }
    return [];
}

async function getOrdersByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    try {
        const rows = await fetchRowsIn('orders', 'customer_email', [normalized, String(email || '')]);
        if (rows && rows.length) return rows;
    } catch {
        // Could not fetch orders
    }
    return [];
}

async function renderCustomers(filter = '') {
    if (!customersList) return;
    let customers;
    try {
        customers = await getAdminCustomers();
    } catch {
        customers = [];
    }

    let ordersByEmail = {};
    try {
        const orderRows = await fetchRows('orders', { order: 'created_at', ascending: false, limit: 2000 });
        (orderRows || []).forEach(order => {
            const email = String(order.customer_email || order.email || '').trim().toLowerCase();
            if (!email) return;
            if (!ordersByEmail[email]) ordersByEmail[email] = [];
            ordersByEmail[email].push(order);
        });
    } catch {
        ordersByEmail = {};
    }

    const query = (filter || '').toLowerCase();
    const filtered = customers.filter(c =>
        !query ||
        String(c.name || '').toLowerCase().includes(query) ||
        String(c.email || '').toLowerCase().includes(query)
    );

    customersList.innerHTML = filtered && filtered.length
        ? filtered.map(customer => {
            const email = String(customer.email || '').toLowerCase();
            const orders = ordersByEmail[email] || [];
            const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
            const lastOrder = orders.length ? orders[orders.length - 1] : null;
            const lastOrderDate = lastOrder ? new Date(lastOrder.created_at || lastOrder.createdAt || Date.now()).toLocaleDateString() : '—';
            return `
                <div class="admin-row">
                    <div class="admin-row-main">
                        <strong>${escapeHtml(customer.name || 'New user')}</strong>
                        <span>${escapeHtml(customer.email || '')}${customer.phone ? ` &middot; ${escapeHtml(customer.phone)}` : ''}</span>
                        <span>${orders.length} order(s) &middot; ${formatMoney(totalSpent, '₦')} &middot; Last order: ${escapeHtml(lastOrderDate)}</span>
                    </div>
                    <span class="admin-badge ${customer.marketing_opt_in ? 'ok' : ''}">${customer.marketing_opt_in ? 'Opted in' : 'No consent'}</span>
                    <div class="admin-row-actions">
                        <button type="button" class="admin-btn" data-view-customer="${escapeHtml(customer.id || customer.email)}"><i data-lucide="receipt" aria-hidden="true"></i> History</button>
                        <button type="button" class="admin-btn danger" data-delete-customer="${escapeHtml(customer.id || customer.email)}" aria-label="Delete customer"><i data-lucide="trash-2" aria-hidden="true"></i></button>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="admin-empty">No customers found.</p>';

    refreshIcons();

    customersList.querySelectorAll('[data-view-customer]').forEach(btn => {
        btn.addEventListener('click', () => {
            const found = customers.find(c => String(c.id || c.email) === btn.dataset.viewCustomer);
            if (found) openCustomerHistory(found);
        });
    });
    customersList.querySelectorAll('[data-delete-customer]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this customer account?')) return;
            const found = customers.find(c => String(c.id || c.email) === btn.dataset.deleteCustomer);
            try {
                if (found && found.id) await deleteRow('customers', found.id);
                showToast('Customer deleted.');
                renderCustomers(customerSearch?.value || '');
            } catch (error) {
                showToast(`Could not delete customer: ${error.message}`, 'error');
            }
        });
    });
}

async function openCustomerHistory(customer) {
    let orders = [];
    try {
        orders = await getOrdersByEmail(customer.email);
    } catch {
        orders = [];
    }

    const currency = await getCurrencySymbol();
    const itemsHtml = orders.length
        ? orders.map(order => {
            const created = order.created_at || order.createdAt || null;
            const lineItems = Array.isArray(order.items)
                ? order.items.map(item => `
                    <li><span>${escapeHtml(item.name)} x${item.quantity}</span><strong>${formatMoney(Number(item.price || 0) * Number(item.quantity || 1), currency)}</strong></li>
                `).join('')
                : '';
            return `
                <div class="admin-detail-row">
                    <span>${escapeHtml(order.order_number || 'Order')}${created ? `<br><small>${escapeHtml(new Date(created).toLocaleString())}</small>` : ''}</span>
                    <strong>${formatMoney(order.total, currency)}</strong>
                </div>
                ${lineItems ? `<ul class="admin-detail-items">${lineItems}</ul>` : ''}
            `;
        }).join('')
        : '<p class="admin-empty">No orders for this customer yet.</p>';

    openModal(`Order history &mdash; ${escapeHtml(customer.name || 'Customer')}`, `
        <div class="admin-detail-grid">
            <div class="admin-detail-row">
                <span>Email</span>
                <strong>${escapeHtml(customer.email || '—')}</strong>
            </div>
            ${customer.phone ? `<div class="admin-detail-row"><span>Phone</span><strong>${escapeHtml(customer.phone)}</strong></div>` : ''}
            ${customer.address ? `<div class="admin-detail-row"><span>Address</span><strong>${escapeHtml(customer.address)}</strong></div>` : ''}
            <h4 style="margin-top:8px;color:var(--text-muted)">Orders (${orders.length})</h4>
            ${itemsHtml}
        </div>
        <div class="admin-form-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-close-modal>Close</button>
        </div>
    `);
}

if (customerSearch) {
    customerSearch.addEventListener('input', () => renderCustomers(customerSearch.value));
}
// ---------------- Settings ----------------

const settingsForm = document.getElementById('settings-form');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DEFAULT_HOURS = {
    mon: { open: '09:00', close: '21:00', closed: false },
    tue: { open: '09:00', close: '21:00', closed: false },
    wed: { open: '09:00', close: '21:00', closed: false },
    thu: { open: '09:00', close: '21:00', closed: false },
    fri: { open: '09:00', close: '22:00', closed: false },
    sat: { open: '10:00', close: '22:00', closed: false },
    sun: { open: '10:00', close: '20:00', closed: false }
};

async function loadSetting(key, fallback = '') {
    try {
        const rows = await fetchRows('settings', { eq: { column: 'id', value: key } });
        if (rows && rows.length) return rows[0].value;
    } catch {
        // Could not fetch setting
    }
    return fallback;
}

async function saveSetting(key, value) {
    const rows = await fetchRows('settings', { eq: { column: 'id', value: key } });
    if (rows && rows.length) {
        await updateRow('settings', rows[0].id, { value });
    } else if (rows && !rows.length) {
        await insertRow('settings', { id: key, value });
    }
}

function buildHoursGrid(hoursData) {
    const grid = document.getElementById('hours-grid');
    if (!grid) return;
    const hours = { ...DEFAULT_HOURS, ...(hoursData || {}) };
    grid.innerHTML = DAYS.map(day => {
        const value = hours[day] || DEFAULT_HOURS[day];
        return `
            <div class="admin-hours-day" data-day="${day}">
                <label>${DAY_LABELS[day]} <input type="time" name="hours_${day}_open" value="${escapeHtml(value.open || '')}"></label>
                <label>To <input type="time" name="hours_${day}_close" value="${escapeHtml(value.close || '')}"></label>
                <label class="closed-toggle"><input type="checkbox" name="hours_${day}_closed" ${value.closed ? 'checked' : ''}> Closed</label>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.admin-hours-day').forEach(dayEl => {
        const closedInput = dayEl.querySelector('[name$="_closed"]');
        const sync = () => dayEl.classList.toggle('closed', closedInput.checked);
        closedInput.addEventListener('change', sync);
        sync();
    });
}

async function renderSettings() {
    if (!settingsForm) return;

    const stringFields = ['business_name', 'tagline', 'contact_email', 'contact_phone', 'address', 'logo_url',
        'currency', 'social_instagram', 'social_facebook', 'site_title', 'site_description'];
    for (const key of stringFields) {
        const input = settingsForm.querySelector(`[name="${key}"]`);
        if (!input) continue;
        const value = await loadSetting(key, '');
        if (input.type === 'checkbox') {
            input.checked = value === 'true' || value === true || value === '1' || value === 'on';
        } else {
            input.value = value || '';
        }
    }

    const numberFields = ['tax_rate', 'min_order', 'lead_time', 'delivery_fee'];
    for (const key of numberFields) {
        const input = settingsForm.querySelector(`[name="${key}"]`);
        if (!input) continue;
        const fallback = CONFIG.defaults[key.replace('_rate', 'Rate')] ?? '';
        const value = await loadSetting(key, '');
        input.value = value !== '' ? value : '';
    }

    const checkboxFields = ['delivery_enabled', 'pickup_enabled', 'maintenance_mode'];
    for (const key of checkboxFields) {
        const input = settingsForm.querySelector(`[name="${key}"]`);
        if (!input) continue;
        const fallback = key === 'maintenance_mode' ? false : true;
        const value = await loadSetting(key, String(fallback));
        input.checked = value === 'true' || value === true || value === '1' || value === 'on';
    }

    let hoursData = {};
    const hoursRaw = await loadSetting('hours', '');
    if (hoursRaw) {
        try {
            hoursData = JSON.parse(hoursRaw);
        } catch {
            // ignore malformed JSON
        }
    }
    buildHoursGrid(hoursData);

    // Logo preview
    const logoUrl = await loadSetting('logo_url', '');
    const logoZone = document.getElementById('settings-logo-zone');
    if (logoZone && logoUrl) {
        const preview = logoZone.querySelector('[data-upload-preview]');
        if (preview) {
            preview.src = logoUrl;
            preview.classList.remove('hidden');
            logoZone.classList.add('has-preview');
        }
    }
}

function initSettingsLogoUpload() {
    const zone = document.getElementById('settings-logo-zone');
    if (!zone) return;
    const input = zone.querySelector('#settings-logo-input');
    const preview = zone.querySelector('#settings-logo-preview');
    if (!input || !preview) return;
    let logoDataUrl = '';
    let logoFile = null;

    function handleFile(file) {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            showToast('Please choose a JPG, PNG or WebP logo.', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('Logo must be 5MB or smaller.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            preview.src = reader.result;
            preview.classList.remove('hidden');
            zone.classList.add('has-preview');
            logoDataUrl = reader.result;
            logoFile = file;
        };
        reader.readAsDataURL(file);
    }

    input.addEventListener('change', () => handleFile(input.files[0]));
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
        }
    });
    zone.addEventListener('dragover', event => {
        event.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', event => {
        event.preventDefault();
        zone.classList.remove('dragover');
        if (event.dataTransfer && event.dataTransfer.files) handleFile(event.dataTransfer.files[0]);
    });

    window.emeraldLogoUpload = {
        async getUrl() {
            if (logoFile) {
                if (isSupabaseConfigured()) {
                    const url = await uploadImage(logoFile, 'logos');
                    if (url) return url;
                }
                return logoDataUrl;
            }
            return await loadSetting('logo_url', '');
        }
    };
}

settingsForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const message = settingsForm.querySelector('.form-message');
    message.textContent = '';
    message.classList.remove('error');

    const formData = new FormData(settingsForm);
    const checkboxKeys = ['delivery_enabled', 'pickup_enabled', 'maintenance_mode'];
    const checkboxValues = {};
    checkboxKeys.forEach(key => {
        checkboxValues[key] = settingsForm.querySelector(`[name="${key}"]`).checked ? 'true' : 'false';
    });

    try {
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('hours_')) continue;
            if (checkboxKeys.includes(key)) continue;
            await saveSetting(key, String(value).trim());
        }
        for (const key of checkboxKeys) {
            await saveSetting(key, checkboxValues[key]);
        }

        // Hours are stored as one JSON blob.
        const hours = {};
        DAYS.forEach(day => {
            hours[day] = {
                open: settingsForm.querySelector(`[name="hours_${day}_open"]`).value,
                close: settingsForm.querySelector(`[name="hours_${day}_close"]`).value,
                closed: settingsForm.querySelector(`[name="hours_${day}_closed"]`).checked
            };
        });
        await saveSetting('hours', JSON.stringify(hours));

        // Upload logo (if a new one was chosen).
        if (window.emeraldLogoUpload) {
            const logoUrl = await window.emeraldLogoUpload.getUrl();
            if (logoUrl) await saveSetting('logo_url', logoUrl);
        }

        message.textContent = 'Settings saved.';
        showToast('Settings saved.');
        setTimeout(() => { message.textContent = ''; }, 3000);
    } catch (error) {
        message.textContent = `Could not save settings: ${error.message}`;
        message.classList.add('error');
        showToast(`Could not save settings: ${error.message}`, 'error');
    }
});

document.getElementById('export-all-data')?.addEventListener('click', async () => {
    const message = document.getElementById('data-export-message');
    if (message) message.textContent = 'Preparing export&hellip;';
    try {
        const [menu, categories, subscribers, customers, settingsRows] = await Promise.all([
            getAdminItems(),
            getAdminCategories(),
            (async () => (await getSubscribers()) || [])(),
            getAdminCustomers(),
            fetchRows('settings')
        ]);
        const settings = {};
        (settingsRows || []).forEach(row => { settings[row.id] = row.value; });
        const payload = {
            exported_at: new Date().toISOString(),
            menu,
            categories,
            subscribers,
            customers,
            settings
        };
        downloadBlob(`emerald-cuisine-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
        showToast('Backup downloaded.');
        if (message) message.textContent = 'Backup downloaded. Keep it somewhere safe!';
    } catch (error) {
        showToast(`Could not export data: ${error.message}`, 'error');
        if (message) {
            message.textContent = `Could not export data: ${error.message}`;
            message.classList.add('error');
        }
    }
});

document.getElementById('export-subscribers-data')?.addEventListener('click', async () => {
    const message = document.getElementById('data-export-message');
    if (message) {
        message.textContent = '';
        message.classList.remove('error');
    }
    try {
        let rows = await getSubscribers();
        // removed localStorage fallback
        const csvRows = (rows || []).map(row => ({
            email: row.email,
            status: row.status || 'active',
            subscribed_at: row.subscribed_at || row.created_at || ''
        }));
        downloadBlob('emerald-cuisine-subscribers.csv', toCSV(csvRows), 'text/csv');
        showToast(`Exported ${csvRows.length} subscriber(s).`);
        if (message) message.textContent = `Exported ${csvRows.length} subscriber(s) as CSV.`;
    } catch (error) {
        showToast(`Could not export subscribers: ${error.message}`, 'error');
        if (message) {
            message.textContent = `Could not export subscribers: ${error.message}`;
            message.classList.add('error');
        }
    }
});

const adminCredentialsForm = document.getElementById('admin-credentials-form');

function initAdminCredentialsForm() {
    if (!adminCredentialsForm) return;
    const creds = getAdminCredentials() || {};
    const usernameInput = adminCredentialsForm.querySelector('[name="adminUsername"]');
    const emailInput = adminCredentialsForm.querySelector('[name="adminEmail"]');
    if (usernameInput) usernameInput.value = creds.username || '';
    if (emailInput) emailInput.value = creds.email || '';

    adminCredentialsForm.addEventListener('submit', async event => {
        event.preventDefault();
        const message = adminCredentialsForm.querySelector('.form-message');
        const data = new FormData(adminCredentialsForm);
        const currentPassword = String(data.get('currentPassword') || '');
        const newPassword = String(data.get('newPassword') || '').trim();
        const newUsername = String(data.get('adminUsername') || '').trim();
        const newEmail = String(data.get('adminEmail') || '').trim();

        message.textContent = '';
        message.classList.remove('error');

        if (!(await isAdminCredentials(creds.username, currentPassword))) {
            message.textContent = 'Current password is incorrect.';
            message.classList.add('error');
            return;
        }
        if (newPassword.length < 6) {
            message.textContent = 'New password must be at least 6 characters.';
            message.classList.add('error');
            return;
        }
        if (!(await saveAdminCredentials({ username: newUsername, password: newPassword, email: newEmail }))) {
            message.textContent = 'Please enter a valid username and password.';
            message.classList.add('error');
            return;
        }
        adminCredentialsForm.reset();
        usernameInput.value = newUsername;
        emailInput.value = newEmail;
        message.textContent = 'Admin credentials updated. Use them on your next sign-in.';
        message.classList.remove('error');
        showToast('Admin credentials updated.');
    });
}

function initDashboard() {
    if (!isSupabaseConfigured()) {
        document.getElementById('admin-config-warning').classList.remove('hidden');
    }
    refreshIcons();
    renderItems();
    renderCategories();
    renderPromotions();
    renderSubscribers();
    renderCustomers();
    renderSettings();
    initSettingsLogoUpload();
}

// Boot once, at the very end of the module: every const element reference
// above is initialised by now, so both the logged-in and login paths work.
refreshIcons();

if (isLoggedIn()) {
    showDashboard();
} else {
    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        const username = loginForm.querySelector('input[name="username"]').value;
        const password = loginForm.querySelector('input[name="password"]').value;
        if (await isAdminCredentials(username, password)) {
            sessionStorage.setItem('emeraldAdmin', '1');
            showDashboard();
        } else {
            loginError.textContent = 'Incorrect username or password. Please try again.';
        }
    });
}


import { getCurrentUser, restoreSession, loginOrRegister, logoutUser } from './auth.js';
import CONFIG from '../config.js';
import { isAdminCredentials, getAdminCredentials } from './admin.js';

let modalRoot = null;
let lastFocusedElement = null;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#39;');
}

// Re-renders any <i data-lucide="..."> elements added to the DOM after the
// initial page load. Safe no-op when Lucide is not loaded.
function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

// Inject a placeholder <div class="auth-slot"> inside each page's
// .header-actions container (pages include the auth module script).
function getAuthSlot() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return null;
    let slot = actions.querySelector('.auth-slot');
    if (!slot) {
        slot = document.createElement('div');
        slot.className = 'auth-slot';
        actions.appendChild(slot);
    }
    return slot;
}

// Create (once) the modal overlay + card used for sign in / create account.
function buildModal() {
    if (modalRoot) return modalRoot;

    modalRoot = document.createElement('div');
    modalRoot.className = 'auth-modal-root';
    modalRoot.setAttribute('aria-hidden', 'true');
    modalRoot.innerHTML = `
        <div class="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
            <button type="button" class="modal-close auth-modal-close" aria-label="Close sign in">
                <i data-lucide="x" aria-hidden="true"></i>
            </button>
            <div class="section-header">
                <span class="eyebrow">Welcome</span>
                <h3 id="auth-modal-title">Sign in or create an account</h3>
                <p>Sign in to speed up checkout and keep track of your orders.</p>
            </div>
            <form class="auth-modal-form" novalidate>
                <label class="auth-field auth-field-name">
                    Full name
                    <input type="text" name="name" placeholder="Your full name" autocomplete="name">
                </label>
                <label class="auth-field">
                    Email address
                    <input type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
                </label>
                <label class="auth-field">
                    Password
                    <input type="password" name="password" placeholder="Your password" autocomplete="current-password" required>
                </label>
                <label class="checkbox-row auth-remember">
                    <input type="checkbox" name="rememberMe" value="true" checked>
                    <span>Keep me signed in on this device</span>
                </label>
                <p class="form-message auth-modal-message" aria-live="polite"></p>
                <div class="auth-modal-actions">
                    <button type="submit" class="btn btn-primary btn-full">Sign in</button>
                    <button type="button" class="btn btn-secondary btn-full auth-modal-close">Cancel</button>
                </div>
                <p class="auth-admin-hint">Owner? Sign in with <strong>admin</strong> + your admin password to open the dashboard.</p>
            </form>
        </div>
    `;

    document.body.appendChild(modalRoot);
    refreshIcons();

    const overlay = modalRoot;
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeModal();
    });
    modalRoot.querySelector('.auth-modal-close').addEventListener('click', closeModal);
    modalRoot.querySelector('.auth-modal-form').addEventListener('submit', onSubmit);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modalRoot?.classList.contains('active')) closeModal();
    });

    return modalRoot;
}

function openModal() {
    const modal = buildModal();
    lastFocusedElement = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const nameInput = modal.querySelector('input[name="name"]');
    const emailInput = modal.querySelector('input[name="email"]');
    const currentUser = getCurrentUser();
    if (currentUser) {
        if (nameInput) nameInput.value = currentUser.name || '';
        if (emailInput) emailInput.value = currentUser.email || '';
    }
    (nameInput || emailInput)?.focus();
}

function closeModal() {
    if (!modalRoot) return;
    modalRoot.classList.remove('active');
    modalRoot.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocusedElement instanceof HTMLElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
}

async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.auth-modal-message');
    const data = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');

    message.textContent = '';
    message.classList.remove('error');

    // Admin sign-in: a matching admin username OR email + the admin
    // password opens the dashboard.
    const enteredIdentifier = String(data.get('email') || '').trim().toLowerCase();
    if (isAdminCredentials(enteredIdentifier, String(data.get('password') || ''))) {
        sessionStorage.setItem('emeraldAdmin', '1');
        window.location.href = 'admin.html';
        return;
    }
    const adminCreds = getAdminCredentials();
    const adminEmail = String(adminCreds.email || CONFIG.adminEmail || '').trim().toLowerCase();
    if (adminEmail && enteredIdentifier === adminEmail) {
        message.textContent = 'Incorrect admin password.';
        message.classList.add('error');
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Signing in...';
        }
        await loginOrRegister({
            name: data.get('name'),
            email: data.get('email'),
            password: data.get('password'),
            rememberMe: data.get('rememberMe') === 'true'
        });
        closeModal();
        renderAuthSlot();
    } catch (error) {
        message.textContent = error.message || 'Could not sign in. Please try again.';
        message.classList.add('error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Sign in';
        }
    }
}

// Render the header slot: "Sign in" button when logged out,
// account chip + dropdown when logged in.
function renderAuthSlot() {
    const slot = getAuthSlot();
    if (!slot) return;

    const user = getCurrentUser();
    slot.innerHTML = '';

    if (!user) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-sm auth-signin-btn';
        btn.innerHTML = '<i data-lucide="user" aria-hidden="true"></i> Sign in';
        btn.setAttribute('aria-haspopup', 'dialog');
        btn.addEventListener('click', openModal);
        slot.appendChild(btn);
        refreshIcons();
        return;
    }

    const chipWrap = document.createElement('div');
    chipWrap.className = 'auth-chip-wrap';

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'auth-chip';
    chip.setAttribute('aria-haspopup', 'true');
    chip.setAttribute('aria-expanded', 'false');
    chip.innerHTML = `<span class="auth-avatar" aria-hidden="true">${escapeHtml((user.name || 'U').charAt(0).toUpperCase())}</span><span class="auth-chip-name">${escapeHtml(user.name.split(' ')[0])}</span>`;

    const menu = document.createElement('div');
    menu.className = 'auth-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
        <div class="auth-menu-user">
            <strong>${escapeHtml(user.name)}</strong>
            <span>${escapeHtml(user.email)}</span>
        </div>
        ${isAdminCredentials(user.email) || isAdminCredentials(user.name) ? `
            <a href="admin.html" class="auth-menu-item">
                <i data-lucide="gauge" aria-hidden="true"></i> Admin dashboard
            </a>
        ` : ''}
        <button type="button" class="auth-menu-item" data-auth-logout>
            <i data-lucide="log-out" aria-hidden="true"></i> Sign out
        </button>
    `;

    menu.querySelector('[data-auth-logout]').addEventListener('click', async () => {
        await logoutUser();
        menu.classList.remove('open');
        chip.setAttribute('aria-expanded', 'false');
        renderAuthSlot();
    });

    chip.addEventListener('click', event => {
        event.stopPropagation();
        const isOpen = menu.classList.toggle('open');
        chip.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', event => {
        if (!chipWrap.contains(event.target)) {
            menu.classList.remove('open');
            chip.setAttribute('aria-expanded', 'false');
        }
    });

    chipWrap.appendChild(chip);
    chipWrap.appendChild(menu);
    slot.appendChild(chipWrap);
    refreshIcons();
}

// Public: restore any saved session, then render the header slot.
export async function initAuthUI() {
    await restoreSession();
    renderAuthSlot();
}

// Auto-initialise once the DOM is ready. Module scripts are deferred,
// so .header-actions is already parsed when this runs.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthUI);
} else {
    initAuthUI();
}


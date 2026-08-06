import { getCurrentUser, restoreSession, loginOrRegister, logoutUser, findExistingByEmail } from './auth.js';
import CONFIG from '../config.js';
import { isAdminCredentials, getAdminCredentials, isAdminIdentifier } from './admin.js';

let modalRoot = null;
let lastFocusedElement = null;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Re-renders any <i data-lucide="..."> elements added to the DOM after the
// initial page load. Safe no-op when Lucide is not loaded.
function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

// Inject a placeholder <div class="auth-slot"> inside each page's
// .header-actions container (and the sidebar when present). Pages include
// the auth module script.
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

// Render the auth UI into the sidebar's .site-sidebar-actions container
// (used on the main site pages that have a persistent left sidebar).
function getSidebarAuthSlot() {
    const actions = document.querySelector('.site-sidebar-actions');
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
                <h3 id="auth-modal-title">Sign in</h3>
                <p>Sign in to speed up checkout and keep track of your orders.</p>
            </div>
            <form class="auth-modal-form" novalidate>
                <label class="auth-field">
                    Username
                    <input type="text" name="username" required autocomplete="username">
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
                    <button type="button" class="btn btn-danger btn-full">Cancel</button>
                </div>
                <p class="auth-switch">Don't have an account? <button type="button" class="link-button" id="auth-open-signup">Sign up</button></p>
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
    modalRoot.querySelector('.btn-danger').addEventListener('click', closeModal);
    modalRoot.querySelector('.auth-modal-form').addEventListener('submit', onSubmit);
    modalRoot.querySelector('#auth-open-signup').addEventListener('click', () => {
        const cb = pendingAuthCallback;
        closeModal();
        openSignupModal(cb);
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modalRoot?.classList.contains('active')) closeModal();
    });

    return modalRoot;
}

let pendingAuthCallback = null;

export function openAuthModal(options = {}) {
    if (typeof options === 'function') {
        pendingAuthCallback = options;
    } else if (options && typeof options.onSuccess === 'function') {
        pendingAuthCallback = options.onSuccess;
    } else {
        pendingAuthCallback = null;
    }
    const modal = buildModal();
    lastFocusedElement = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const usernameInput = modal.querySelector('input[name="username"]');
    const currentUser = getCurrentUser();
    if (currentUser && usernameInput) {
        usernameInput.value = currentUser.username || '';
    }
    usernameInput?.focus();
}

function closeModal() {
    if (!modalRoot) return;
    pendingAuthCallback = null;
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

    // Admin sign-in: a matching admin username + the admin password
    // opens the dashboard.
    const enteredIdentifier = String(data.get('username') || '').trim().toLowerCase();
    if (await isAdminCredentials(enteredIdentifier, String(data.get('password') || ''))) {
        sessionStorage.setItem('emeraldAdmin', '1');
        window.location.href = 'admin.html';
        return;
    }
    const adminCreds = getAdminCredentials();
    const adminUsername = String(adminCreds.username || CONFIG.adminUsername || '').trim().toLowerCase();
    if (adminUsername && enteredIdentifier === adminUsername) {
        message.textContent = 'Incorrect admin password.';
        message.classList.add('error');
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Signing in...';
        }
        const user = await loginOrRegister({
            username: data.get('username'),
            password: data.get('password'),
            rememberMe: data.get('rememberMe') === 'true'
        });
        completeAuthSuccess(user);
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

// Shared post-auth handling: announce, close both modals, re-render the
// header slots, and run any callback that opened the modal.
function completeAuthSuccess(user) {
    document.dispatchEvent(new CustomEvent('auth:signed-in', { detail: user || getCurrentUser() }));
    const cb = pendingAuthCallback;
    closeModal();
    closeSignupModal();
    renderAuthSlot();
    renderSidebarAuthSlot();
    if (typeof cb === 'function') {
        cb(user || getCurrentUser());
    }
}

// ---------------------------------------------------------------------------
// Sign-up modal: mirrors the sign-in modal's structure, focus handling and
// close pattern. Kept separate from the sign-in form so each flow stays
// single-purpose.
// ---------------------------------------------------------------------------

let signupModalRoot = null;
let signupConflictMode = null;

function buildSignupModal() {
    if (signupModalRoot) return signupModalRoot;

    signupModalRoot = document.createElement('div');
    signupModalRoot.className = 'auth-modal-root';
    signupModalRoot.setAttribute('aria-hidden', 'true');
    signupModalRoot.innerHTML = `
        <div class="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-signup-title">
            <div class="section-header">
                <span class="eyebrow">Welcome</span>
                <h3 id="auth-signup-title">Create your account</h3>
                <p>Sign up to speed up checkout and keep track of your orders.</p>
            </div>
            <form class="auth-modal-form" novalidate>
                <label class="auth-field">
                    Username
                    <input type="text" name="username" required autocomplete="username">
                </label>
                <label class="auth-field">
                    Email address
                    <input type="email" name="email" required autocomplete="email">
                </label>
                <label class="auth-field">
                    Address
                    <input type="text" name="address" placeholder="Delivery address" autocomplete="street-address">
                </label>
                <label class="checkbox-row auth-remember">
                    <input type="checkbox" name="useAsDeliveryAddress" value="true" checked>
                    <span>Use this as my delivery address</span>
                </label>
                <label class="auth-field">
                    Password
                    <input type="password" name="password" required autocomplete="new-password">
                </label>
                <p class="form-message auth-modal-message" aria-live="polite"></p>
                <div class="auth-conflict hidden">
                    <p>An account with this email already exists. Update it with these details, or replace it entirely.</p>
                    <div class="auth-conflict-actions">
                        <button type="button" class="btn btn-secondary btn-sm" id="auth-conflict-update">Update existing account</button>
                        <button type="button" class="btn btn-danger btn-sm" id="auth-conflict-replace">Replace account</button>
                    </div>
                </div>
                <div class="auth-modal-actions">
                    <button type="submit" class="btn btn-primary btn-full">Sign up</button>
                    <button type="button" class="btn btn-danger btn-full" id="auth-signup-cancel">Cancel</button>
                </div>
                <p class="auth-switch">Already have an account? <button type="button" class="link-button" id="auth-open-signin">Sign in</button></p>
            </form>
        </div>
    `;

    document.body.appendChild(signupModalRoot);
    refreshIcons();

    const overlay = signupModalRoot;
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeSignupModal();
    });
    signupModalRoot.querySelector('#auth-signup-cancel').addEventListener('click', closeSignupModal);
    signupModalRoot.querySelector('#auth-open-signin').addEventListener('click', () => {
        const cb = pendingAuthCallback;
        closeSignupModal();
        openAuthModal(cb);
    });
    signupModalRoot.querySelector('.auth-modal-form').addEventListener('submit', onSubmitSignup);
    signupModalRoot.querySelector('#auth-conflict-update').addEventListener('click', () => {
        signupConflictMode = 'update';
        signupModalRoot.querySelector('.auth-conflict').classList.add('hidden');
        signupModalRoot.querySelector('.auth-modal-form').requestSubmit();
    });
    signupModalRoot.querySelector('#auth-conflict-replace').addEventListener('click', () => {
        signupConflictMode = 'replace';
        signupModalRoot.querySelector('.auth-conflict').classList.add('hidden');
        signupModalRoot.querySelector('.auth-modal-form').requestSubmit();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && signupModalRoot?.classList.contains('active')) closeSignupModal();
    });

    return signupModalRoot;
}

export function openSignupModal(options = {}) {
    if (typeof options === 'function') {
        pendingAuthCallback = options;
    } else if (options && typeof options.onSuccess === 'function') {
        pendingAuthCallback = options.onSuccess;
    } else {
        pendingAuthCallback = null;
    }
    const modal = buildSignupModal();
    lastFocusedElement = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    modal.querySelector('input[name="username"]')?.focus();
}

function closeSignupModal() {
    if (!signupModalRoot) return;
    pendingAuthCallback = null;
    signupConflictMode = null;
    signupModalRoot.classList.remove('active');
    signupModalRoot.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    const conflict = signupModalRoot.querySelector('.auth-conflict');
    if (conflict) conflict.classList.add('hidden');
    const message = signupModalRoot.querySelector('.auth-modal-message');
    if (message) {
        message.textContent = '';
        message.classList.remove('error');
    }
    if (lastFocusedElement instanceof HTMLElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
}

async function onSubmitSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.auth-modal-message');
    const data = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');

    const username = String(data.get('username') || '').trim();
    const email = String(data.get('email') || '').trim();
    const address = String(data.get('address') || '').trim();
    const useAsDeliveryAddress = data.get('useAsDeliveryAddress') === 'true';
    const password = String(data.get('password') || '');

    message.textContent = '';
    message.classList.remove('error');

    if (!username || !email || !password) {
        message.textContent = 'Please fill in your username, email and password.';
        message.classList.add('error');
        return;
    }

    if (!signupConflictMode) {
        const existing = await findExistingByEmail(email);
        if (existing) {
            form.querySelector('.auth-conflict')?.classList.remove('hidden');
            return;
        }
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Creating account...';
        }
        const user = await loginOrRegister({
            username,
            email,
            address,
            useAsDeliveryAddress,
            password,
            rememberMe: true,
            conflictMode: signupConflictMode
        });
        completeAuthSuccess(user);
    } catch (error) {
        message.textContent = error.message || 'Could not create your account. Please try again.';
        message.classList.add('error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Sign up';
        }
        signupConflictMode = null;
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
        btn.addEventListener('click', openAuthModal);
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
        ${isAdminIdentifier(user.email) || isAdminIdentifier(user.name) ? `
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

    chipWrap.appendChild(chip);
    chipWrap.appendChild(menu);
    slot.appendChild(chipWrap);
    refreshIcons();
}

// Public: restore any saved session, then render the header slot.
export async function initAuthUI() {
    await restoreSession();
    renderAuthSlot();
    renderSidebarAuthSlot();
}

function renderSidebarAuthSlot() {
    const slot = getSidebarAuthSlot();
    if (!slot) return;

    const user = getCurrentUser();
    slot.innerHTML = '';

    if (!user) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-sm auth-signin-btn';
        btn.innerHTML = '<i data-lucide="user" aria-hidden="true"></i> Sign in';
        btn.setAttribute('aria-haspopup', 'dialog');
        btn.addEventListener('click', openAuthModal);
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
        ${isAdminIdentifier(user.email) || isAdminIdentifier(user.name) ? `
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
        renderSidebarAuthSlot();
    });

    chip.addEventListener('click', event => {
        event.stopPropagation();
        const isOpen = menu.classList.toggle('open');
        chip.setAttribute('aria-expanded', String(isOpen));
    });

    chipWrap.appendChild(chip);
    chipWrap.appendChild(menu);
    slot.appendChild(chipWrap);
    refreshIcons();
}

// Single delegated handler: closes any open auth menu when clicking outside
// it. Registered once instead of on every slot render, so login/logout
// cycles never accumulate document listeners.
document.addEventListener('click', event => {
    document.querySelectorAll('.auth-menu.open').forEach(menu => {
        const wrap = menu.closest('.auth-chip-wrap');
        if (!wrap || wrap.contains(event.target)) return;
        menu.classList.remove('open');
        const chip = wrap.querySelector('.auth-chip');
        if (chip) chip.setAttribute('aria-expanded', 'false');
    });
});

// Auto-initialise once the DOM is ready. Module scripts are deferred,
// so .header-actions is already parsed when this runs.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthUI);
} else {
    initAuthUI();
}


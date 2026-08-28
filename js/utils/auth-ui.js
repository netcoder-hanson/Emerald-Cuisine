// ============================================================
// Auth UI — Sign-in / Sign-up modals + header slot rendering
// ============================================================
// Uses Supabase Auth via auth.js. No legacy custom auth.
// ============================================================

import { getCurrentUser, restoreSession, loginOrRegister, logoutUser, signInWithGoogle, onAuthStateChange, refreshProfile } from './auth.js';
import { updateRow } from './store.js';

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

function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

// Keep the auth dropdown fully inside its scrollable parent (the fixed
// sidebar). The menu normally opens downward; if there isn't enough room
// below the chip it is flipped to open upward so no item (e.g. "Sign out")
// is clipped by the sidebar's overflow.
function positionAuthMenu(menu) {
    const wrap = menu.closest('.auth-chip-wrap');
    const chip = wrap?.querySelector('.auth-chip');
    if (!wrap || !chip) return;

    const scrollParent = wrap.closest('.site-sidebar') || document.body;
    const parentRect = scrollParent.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();

    // Vertical flip: determine whether the menu fits below or above the chip.
    // menu.offsetHeight is reliable because height is unaffected by the
    // horizontal translate3d transform.
    const menuHeight = menu.offsetHeight || 0;
    const gap = 10;
    const fitsBelow = parentRect.bottom - chipRect.bottom >= menuHeight + gap;
    const fitsAbove = chipRect.top - parentRect.top >= menuHeight + gap;
    menu.classList.toggle('up', !fitsBelow && fitsAbove);

    // Horizontal clamp: compute the menu's natural position from the chip-wrap
    // (its position:relative containing block) and the menu's width. This
    // avoids getBoundingClientRect() on the menu, which is contaminated by a
    // stale --auth-menu-x transform from a prior open cycle.
    const inset = 4;
    const sidebarLeft = parentRect.left + inset;
    const sidebarRight = parentRect.right - inset;
    const wrapRect = wrap.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 0;

    // Menu is position:absolute; right:0 relative to chip-wrap, so its
    // natural right edge aligns with wrapRect.right and its natural left edge
    // is wrapRect.right − menuWidth.
    const naturalLeft = wrapRect.right - menuWidth;

    let dx = 0;
    if (naturalLeft < sidebarLeft) {
        dx = sidebarLeft - naturalLeft;
    } else if (wrapRect.right > sidebarRight) {
        dx = sidebarRight - wrapRect.right;
    }
    menu.style.setProperty('--auth-menu-x', `${Math.round(dx)}px`);
}

// ------------------------------------------------------------
// Auth slot helpers
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// Sign-in modal
// ------------------------------------------------------------

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
                <button type="button" class="btn btn-google btn-full" id="auth-google-btn">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                </button>
                <div class="auth-divider"><span>or</span></div>
                <label class="auth-field">
                    Email address
                    <input type="email" name="email" required autocomplete="email">
                </label>
                <label class="auth-field">
                    Password
                    <input type="password" name="password" placeholder="Your password" autocomplete="current-password" required>
                </label>
                <p class="form-message auth-modal-message" aria-live="polite"></p>
                <div class="auth-modal-actions">
                    <button type="submit" class="btn btn-primary btn-full">Sign in</button>
                    <button type="button" class="btn btn-danger btn-full">Cancel</button>
                </div>
                <p class="auth-switch">Don't have an account? <button type="button" class="link-button" id="auth-open-signup">Sign up</button></p>
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

    modalRoot.querySelector('#auth-google-btn').addEventListener('click', async () => {
        const message = modalRoot.querySelector('.auth-modal-message');
        message.textContent = '';
        message.classList.remove('error');
        const { error } = await signInWithGoogle();
        if (error) {
            message.textContent = error || 'Could not start Google sign-in. Please try again.';
            message.classList.add('error');
        }
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
    const emailInput = modal.querySelector('input[name="email"]');
    emailInput?.focus();
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

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Signing in...';
        }
        const user = await loginOrRegister({
            email: data.get('email'),
            password: data.get('password')
        });
        if (user?.isAdmin) {
            window.location.href = 'admin.html';
            return;
        }
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

// ------------------------------------------------------------
// Sign-up modal
// ------------------------------------------------------------

let signupModalRoot = null;

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
            <form class="auth-modal-form auth-signup-grid" novalidate>
                <button type="button" class="btn btn-google btn-full" id="auth-google-signup-btn">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                </button>
                <div class="auth-divider"><span>or</span></div>
                <label class="auth-field">
                    Name
                    <input type="text" name="username" required autocomplete="name">
                </label>
                <label class="auth-field">
                    Email address
                    <input type="email" name="email" required autocomplete="email">
                </label>
                <label class="auth-field">
                    Address
                    <input type="text" name="address" placeholder="Delivery address" autocomplete="street-address">
                </label>
                <label class="auth-field">
                    Phone number
                    <input type="tel" name="phone" placeholder="e.g. 0801 234 5678" autocomplete="tel">
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

    signupModalRoot.querySelector('#auth-google-signup-btn').addEventListener('click', async () => {
        const message = signupModalRoot.querySelector('.auth-modal-message');
        message.textContent = '';
        message.classList.remove('error');
        const { error } = await signInWithGoogle();
        if (error) {
            message.textContent = error || 'Could not start Google sign-in. Please try again.';
            message.classList.add('error');
        }
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
    signupModalRoot.classList.remove('active');
    signupModalRoot.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
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
    const phone = String(data.get('phone') || '').trim();
    const useAsDeliveryAddress = data.get('useAsDeliveryAddress') === 'true';
    const password = String(data.get('password') || '');

    message.textContent = '';
    message.classList.remove('error');

    if (!username || !email || !password) {
        message.textContent = 'Please fill in your name, email and password.';
        message.classList.add('error');
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Creating account...';
        }
        const user = await loginOrRegister({
            email,
            password,
            name: username,
            address,
            phone,
            useAsDeliveryAddress
        });
        if (user?.isAdmin) {
            window.location.href = 'admin.html';
            return;
        }
        completeAuthSuccess(user);
    } catch (error) {
        message.textContent = error.message || 'Could not create your account. Please try again.';
        message.classList.add('error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Sign up';
        }
    }
}

// ------------------------------------------------------------
// My Account modal
// ------------------------------------------------------------

let accountModalRoot = null;

function buildAccountModal() {
    if (accountModalRoot) return accountModalRoot;

    accountModalRoot = document.createElement('div');
    accountModalRoot.className = 'auth-modal-root';
    accountModalRoot.setAttribute('aria-hidden', 'true');
    accountModalRoot.innerHTML = `
        <div class="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-account-title">
            <button type="button" class="modal-close auth-modal-close" aria-label="Close My Account">
                <i data-lucide="x" aria-hidden="true"></i>
            </button>
            <div class="section-header">
                <span class="eyebrow">Account</span>
                <h3 id="auth-account-title">My Account</h3>
                <p>Update your details. Your email is tied to your sign-in and cannot be changed here.</p>
            </div>
            <form class="auth-modal-form" novalidate>
                <label class="auth-field">
                    Email
                    <input type="email" name="email" readonly aria-readonly="true">
                </label>
                <label class="auth-field">
                    Name
                    <input type="text" name="name" required autocomplete="name">
                </label>
                <label class="auth-field">
                    Username
                    <input type="text" name="username" required autocomplete="off">
                </label>
                <label class="auth-field">
                    Phone
                    <input type="tel" name="phone" autocomplete="tel">
                </label>
                <label class="auth-field">
                    Address
                    <input type="text" name="address" placeholder="Delivery address" autocomplete="street-address">
                </label>
                <label class="checkbox-row auth-remember">
                    <input type="checkbox" name="useAsDeliveryAddress">
                    <span>Use this as my delivery address</span>
                </label>
                <p class="form-message auth-modal-message" aria-live="polite"></p>
                <div class="auth-modal-actions">
                    <button type="submit" class="btn btn-primary btn-full">Save changes</button>
                    <button type="button" class="btn btn-danger btn-full" id="auth-account-cancel">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(accountModalRoot);
    refreshIcons();

    accountModalRoot.addEventListener('click', event => {
        if (event.target === accountModalRoot) closeAccountModal();
    });
    accountModalRoot.querySelector('.modal-close').addEventListener('click', closeAccountModal);
    accountModalRoot.querySelector('#auth-account-cancel').addEventListener('click', closeAccountModal);
    accountModalRoot.querySelector('.auth-modal-form').addEventListener('submit', onSubmitAccount);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && accountModalRoot?.classList.contains('active')) closeAccountModal();
    });

    return accountModalRoot;
}

export function openAccountModal() {
    const user = getCurrentUser();
    if (!user) return;
    const modal = buildAccountModal();
    lastFocusedElement = document.activeElement;

    const form = modal.querySelector('.auth-modal-form');
    form.querySelector('input[name="email"]').value = user.email || '';
    form.querySelector('input[name="name"]').value = user.name || '';
    form.querySelector('input[name="username"]').value = user.username || '';
    form.querySelector('input[name="phone"]').value = user.phone || '';
    form.querySelector('input[name="address"]').value = user.address || '';
    form.querySelector('input[name="useAsDeliveryAddress"]').checked = user.useAsDeliveryAddress;

    const message = modal.querySelector('.form-message');
    message.textContent = '';
    message.classList.remove('error', 'success');

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    form.querySelector('input[name="name"]')?.focus();
}

function closeAccountModal() {
    if (!accountModalRoot) return;
    accountModalRoot.classList.remove('active');
    accountModalRoot.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocusedElement instanceof HTMLElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
}

async function onSubmitAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.auth-modal-message');
    const submitButton = form.querySelector('button[type="submit"]');

    const name = String(form.querySelector('input[name="name"]').value || '').trim();
    const username = String(form.querySelector('input[name="username"]').value || '').trim();
    const phone = String(form.querySelector('input[name="phone"]').value || '').trim();
    const address = String(form.querySelector('input[name="address"]').value || '').trim();
    const useAsDeliveryAddress = form.querySelector('input[name="useAsDeliveryAddress"]').checked;

    message.textContent = '';
    message.classList.remove('error', 'success');

    if (!name || !username) {
        message.textContent = 'Please fill in your name and username.';
        message.classList.add('error');
        return;
    }

    const user = getCurrentUser();
    if (!user?.id) {
        message.textContent = 'Could not load your account. Please sign in again.';
        message.classList.add('error');
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Saving...';
        }
        await updateRow('customers', user.id, {
            name,
            username,
            phone,
            address,
            use_as_delivery_address: useAsDeliveryAddress
        });
        await refreshProfile();
        renderAuthSlot();
        renderSidebarAuthSlot();
        message.textContent = 'Your changes have been saved.';
    } catch (error) {
        message.textContent = error?.message || 'Could not save your changes. Please try again.';
        message.classList.add('error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Save changes';
        }
    }
}

// ------------------------------------------------------------
// Header slot rendering
// ------------------------------------------------------------

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
        ${user.isAdmin ? `
            <a href="admin.html" class="auth-menu-item">
                <i data-lucide="gauge" aria-hidden="true"></i> Admin dashboard
            </a>
        ` : ''}
        <button type="button" class="auth-menu-item" data-auth-account>
            <i data-lucide="user-cog" aria-hidden="true"></i> My Account
        </button>
        <button type="button" class="auth-menu-item" data-auth-logout>
            <i data-lucide="log-out" aria-hidden="true"></i> Sign out
        </button>
    `;

    menu.querySelector('[data-auth-account]').addEventListener('click', () => {
        menu.classList.remove('open');
        chip.setAttribute('aria-expanded', 'false');
        openAccountModal();
    });

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
        if (isOpen) positionAuthMenu(menu);
    });

    chipWrap.appendChild(chip);
    chipWrap.appendChild(menu);
    slot.appendChild(chipWrap);
    refreshIcons();
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
        ${user.isAdmin ? `
            <a href="admin.html" class="auth-menu-item">
                <i data-lucide="gauge" aria-hidden="true"></i> Admin dashboard
            </a>
        ` : ''}
        <button type="button" class="auth-menu-item" data-auth-account>
            <i data-lucide="user-cog" aria-hidden="true"></i> My Account
        </button>
        <button type="button" class="auth-menu-item" data-auth-logout>
            <i data-lucide="log-out" aria-hidden="true"></i> Sign out
        </button>
    `;

    menu.querySelector('[data-auth-account]').addEventListener('click', () => {
        menu.classList.remove('open');
        chip.setAttribute('aria-expanded', 'false');
        openAccountModal();
    });

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
        if (isOpen) positionAuthMenu(menu);
    });

    chipWrap.appendChild(chip);
    chipWrap.appendChild(menu);
    slot.appendChild(chipWrap);
    refreshIcons();
}

// ------------------------------------------------------------
// Public init + auth state listener
// ------------------------------------------------------------

export async function initAuthUI() {
    await restoreSession();
    renderAuthSlot();
    renderSidebarAuthSlot();
}

// Close menus on outside click (delegated, registered once)
document.addEventListener('click', event => {
    document.querySelectorAll('.auth-menu.open').forEach(menu => {
        const wrap = menu.closest('.auth-chip-wrap');
        if (!wrap || wrap.contains(event.target)) return;
        menu.classList.remove('open');
        const chip = wrap.querySelector('.auth-chip');
        if (chip) chip.setAttribute('aria-expanded', 'false');
    });
});

// Listen for Supabase Auth state changes to re-render UI
onAuthStateChange(() => {
    renderAuthSlot();
    renderSidebarAuthSlot();
});

// Auto-initialise on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthUI);
} else {
    initAuthUI();
}

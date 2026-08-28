history.scrollRestoration = 'manual';

const TABLE_FEES = {
    standard: 5000,
    vip: 15000,
    private: 30000,
    outdoor: 10000
};

function formatPrice(value) {
    return `₦${(Number(value) || 0).toLocaleString()}`;
}

function resetScrollPosition() {
    if (!window.location.hash) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }
}

window.addEventListener('pageshow', resetScrollPosition);

const header = document.getElementById('header');
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.site-sidebar');
const navOverlay = document.querySelector('.nav-overlay');
const reserveTriggers = document.querySelectorAll('.reserve-trigger');
const modalOverlay = document.querySelector('.modal-overlay');
const reservationModal = document.querySelector('.reservation-modal');
const reservationForm = document.querySelector('.reservation-form');
const lightbox = document.querySelector('.lightbox');
const lightboxClose = document.querySelector('.lightbox-close');
const galleryItems = document.querySelectorAll('.gallery-item');
const backToTop = document.getElementById('backToTop');
const links = document.querySelectorAll('nav a[href^="#"]');
const scrollPanels = document.querySelectorAll('.scroll-panel');
const revealElements = document.querySelectorAll('.reveal');
let lastFocusedElement = null;

function scrollPageToTop() {
    const scrollRoot = document.scrollingElement || document.documentElement || document.body;
    if (scrollRoot) {
        scrollRoot.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
    scrollPanels.forEach(panel => {
        panel.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function handleScrollVisibility() {
    const isScrolled = window.scrollY > 520 || Array.from(scrollPanels).some(panel => panel.scrollTop > 520);
    if (!backToTop) return;
    backToTop.classList.toggle('show', isScrolled);
}

function toggleMobileMenu(open) {
    const isOpen = open === undefined ? !navLinks.classList.contains('active') : open;
    navLinks.classList.toggle('active', isOpen);
    navOverlay.classList.toggle('active', isOpen);
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    document.body.classList.toggle('menu-open', isOpen);
}

if (hamburger) {
    hamburger.addEventListener('click', () => toggleMobileMenu());
}

if (navOverlay) {
    navOverlay.addEventListener('click', () => toggleMobileMenu(false));
}

document.querySelectorAll('.site-sidebar a').forEach(link => {
    link.addEventListener('click', () => toggleMobileMenu(false));
});

window.addEventListener('scroll', () => {
    if (header) {
        if (window.scrollY > 24) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }

    handleScrollVisibility();
});

scrollPanels.forEach(panel => {
    panel.addEventListener('scroll', handleScrollVisibility);
});

if (backToTop) {
    backToTop.addEventListener('click', scrollPageToTop);
}

handleScrollVisibility();

links.forEach(link => {
    link.addEventListener('click', event => {
        event.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

window.addEventListener('scroll', () => {
    let current = '';
    document.querySelectorAll('section[id]').forEach(section => {
        const sectionTop = section.offsetTop - 120;
        if (window.scrollY >= sectionTop) {
            current = section.getAttribute('id');
        }
    });
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
    });
});

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

revealElements.forEach(el => observer.observe(el));

function openModal() {
    if (!reservationModal || !modalOverlay) return;
    lastFocusedElement = document.activeElement;
    reservationModal.classList.add('active');
    modalOverlay.classList.add('active');
    reservationModal.setAttribute('aria-hidden', 'false');
    modalOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    reservationModal.querySelector('input, select, textarea, button')?.focus();
}

function resetReservationModalState() {
    if (!reservationModal) return;
    const modalHeader = reservationModal.querySelector('.modal-header');
    const successView = reservationModal.querySelector('.reservation-success');
    const message = reservationModal.querySelector('.form-message');

    if (message) {
        message.textContent = '';
        message.classList.remove('error');
    }
    if (reservationForm) {
        reservationForm.reset();
        reservationForm.classList.remove('hidden');
    }
    if (modalHeader) {
        modalHeader.classList.remove('hidden');
    }
    if (successView) {
        successView.classList.add('hidden');
    }
    updateReservationFee();
}

function closeModal() {
    if (!reservationModal || !modalOverlay) return;
    reservationModal.classList.remove('active');
    modalOverlay.classList.remove('active');
    reservationModal.setAttribute('aria-hidden', 'true');
    modalOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
    resetReservationModalState();
}

reserveTriggers.forEach(button => {
    button.addEventListener('click', openModal);
});

const reservationCancel = reservationModal?.querySelector('.modal-actions .btn-danger');
if (reservationCancel) {
    reservationCancel.addEventListener('click', closeModal);
}

const reservationClose = reservationModal?.querySelector('.modal-close');
if (reservationClose) {
    reservationClose.addEventListener('click', closeModal);
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', closeModal);
}

if (reservationModal) {
    reservationModal.addEventListener('click', event => {
        if (event.target.closest('#reservation-continue')) {
            closeModal();
        }
    });
}

const tableTypeSelect = document.getElementById('reservation-table-type');
const feeAmountEl = document.getElementById('reservation-fee-amount');

function updateReservationFee() {
    if (!tableTypeSelect || !feeAmountEl) return;
    const selectedType = tableTypeSelect.value;
    const fee = TABLE_FEES[selectedType] || 0;
    feeAmountEl.textContent = formatPrice(fee);
}

if (tableTypeSelect) {
    tableTypeSelect.addEventListener('change', updateReservationFee);
}

if (reservationForm) {
    reservationForm.addEventListener('submit', event => {
        event.preventDefault();
        const formData = new FormData(reservationForm);
        const name = formData.get('name').trim();
        const phone = formData.get('phone').trim();
        const email = formData.get('email').trim();
        const date = formData.get('date');
        const time = formData.get('time');
        const guests = formData.get('guests');
        const tableType = formData.get('tableType');
        const fee = TABLE_FEES[tableType] || 0;

        if (!name || !phone || !email || !date || !time || !guests || !tableType) {
            const message = reservationForm.querySelector('.form-message');
            message.textContent = 'Please complete all required fields.';
            message.classList.add('error');
            return;
        }

        const reservationPayload = {
            name,
            phone,
            email,
            date,
            time,
            guests,
            tableType,
            fee,
            feeFormatted: formatPrice(fee),
            requests: formData.get('requests') ? formData.get('requests').trim() : ''
        };

        const modalHeader = reservationModal.querySelector('.modal-header');
        const successView = reservationModal.querySelector('.reservation-success');

        if (modalHeader) modalHeader.classList.add('hidden');
        reservationForm.classList.add('hidden');

        if (successView) {
            successView.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
            const continueBtn = successView.querySelector('#reservation-continue');
            if (continueBtn) continueBtn.focus();
        }
    });
}

galleryItems.forEach(item => {
    item.addEventListener('click', () => {
        if (!lightbox) return;
        const src = item.dataset.src;
        const image = lightbox.querySelector('img');
        if (!src || !image) return;
        lastFocusedElement = document.activeElement;
        image.src = src;
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        lightboxClose?.focus();
    });
});

function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocusedElement) {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
}

if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
}

if (lightbox) {
    lightbox.addEventListener('click', event => {
        if (event.target === lightbox) {
            closeLightbox();
        }
    });
}

function getFocusableElements(container) {
    return [...container.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.offsetParent !== null);
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        if (reservationModal?.classList.contains('active')) {
            closeModal();
        } else if (lightbox?.classList.contains('active')) {
            closeLightbox();
        }
        return;
    }

    if (event.key !== 'Tab') return;
    const activeDialog = reservationModal?.classList.contains('active') ? reservationModal : lightbox?.classList.contains('active') ? lightbox : null;
    if (!activeDialog) return;
    const focusable = getFocusableElements(activeDialog);
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
});

if (window.lucide) {
    lucide.createIcons();
}

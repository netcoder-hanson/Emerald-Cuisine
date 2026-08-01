history.scrollRestoration = 'manual';

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
const navLinks = document.querySelector('.nav-links');
const navOverlay = document.querySelector('.nav-overlay');
const reserveTriggers = document.querySelectorAll('.reserve-trigger');
const modalOverlay = document.querySelector('.modal-overlay');
const reservationModal = document.querySelector('.reservation-modal');
const modalCloses = document.querySelectorAll('.modal-close');
const reservationForm = document.querySelector('.reservation-form');
const lightbox = document.querySelector('.lightbox');
const lightboxClose = document.querySelector('.lightbox-close');
const galleryItems = document.querySelectorAll('.gallery-item');
const backToTop = document.getElementById('backToTop');
const links = document.querySelectorAll('nav a[href^="#"]');
const revealElements = document.querySelectorAll('.reveal');
let lastFocusedElement = null;

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

document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => toggleMobileMenu(false));
});

window.addEventListener('scroll', () => {
    if (window.scrollY > 24) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }

    if (window.scrollY > 520) {
        backToTop.classList.add('show');
    } else {
        backToTop.classList.remove('show');
    }
});

if (backToTop) {
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

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
}

reserveTriggers.forEach(button => {
    button.addEventListener('click', openModal);
});

modalCloses.forEach(button => {
    button.addEventListener('click', closeModal);
});

if (modalOverlay) {
    modalOverlay.addEventListener('click', closeModal);
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

        if (!name || !phone || !email || !date || !time || !guests) {
            const message = reservationForm.querySelector('.form-message');
            message.textContent = 'Please complete all required fields.';
            message.classList.add('error');
            return;
        }

        const successMessage = reservationForm.querySelector('.form-message');
        successMessage.classList.remove('error');
        reservationForm.reset();
        successMessage.textContent = 'Your reservation request has been received. We will contact you to confirm the details.';
        setTimeout(() => {
            reservationForm.querySelector('.form-message').textContent = '';
            closeModal();
        }, 2000);
    });
}

galleryItems.forEach(item => {
    item.addEventListener('click', () => {
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

// Newsletter subscription is handled in js/home.js so it can save
// subscribers via the store (Supabase + localStorage fallback).

// Render Lucide icons if the library is loaded
if (window.lucide) {
    lucide.createIcons();
}

import { getReviews, addReview, addSubscriber, getSetting, getLocalSetting } from './utils/store.js';
import { escapeHtml } from './utils/cart.js';

async function renderReviews() {
    const grid = document.getElementById('reviews-grid');
    if (!grid) return;

    const reviews = await getReviews();
    if (!reviews || !reviews.length) {
        grid.innerHTML = '<p class="menu-empty">No reviews yet. Be the first to share your experience!</p>';
        return;
    }

    grid.innerHTML = reviews.slice(0, 6).map(review => `
        <article class="review-card">
            <div class="review-stars">${'★'.repeat(Math.min(5, Math.max(1, review.rating)))}</div>
            <h4>${escapeHtml(review.customer_name || 'Guest')}</h4>
            <p>${escapeHtml(review.comment)}</p>
            ${review.order_number ? `<span class="review-meta">Order ${escapeHtml(review.order_number)}</span>` : ''}
        </article>
    `).join('');
}

function initReviewForm() {
    const form = document.getElementById('review-form');
    if (!form) return;

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const message = form.querySelector('.form-message');
        const name = form.querySelector('[name="name"]').value.trim();
        const rating = Number(form.querySelector('[name="rating"]').value);
        const comment = form.querySelector('[name="comment"]').value.trim();

        if (!name || !rating || !comment) {
            message.textContent = 'Please complete all fields before submitting.';
            message.classList.add('error');
            return;
        }

        try {
            await addReview({ customer_name: name, rating, comment });
            message.textContent = 'Thank you for your review!';
            message.classList.remove('error');
            form.reset();
            renderReviews();
        } catch {
            message.textContent = 'Sorry, we could not save your review. Please try again.';
            message.classList.add('error');
        }
    });
}

function initNewsletter() {
    const form = document.querySelector('.newsletter-form');
    if (!form) return;

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const emailInput = form.querySelector('input[type="email"]');
        form.querySelectorAll('.form-message').forEach(msg => msg.remove());
        const message = document.createElement('p');
        message.className = 'form-message';

        if (!emailInput.value.trim()) {
            message.textContent = 'Please enter your email address.';
            message.classList.add('error');
            form.append(message);
            return;
        }

        try {
            await addSubscriber(emailInput.value.trim());
            message.textContent = `Thanks for subscribing, ${emailInput.value.trim()}!`;
            message.classList.remove('error');
        } catch {
            message.textContent = 'Sorry, we could not save your email. Please try again.';
            message.classList.add('error');
        }
        form.append(message);
        setTimeout(() => message.remove(), 4000);
        form.reset();
    });
}

async function applySettings() {
    const announcement = (await getSetting('announcement')) || getLocalSetting('announcement');
    const announcementEl = document.querySelector('.announcement p');
    if (announcement && announcementEl) {
        announcementEl.textContent = announcement;
    }

    const heroTitle = (await getSetting('hero_title')) || getLocalSetting('hero_title');
    const heroSubtitle = (await getSetting('hero_subtitle')) || getLocalSetting('hero_subtitle');
    if (heroTitle) {
        document.querySelectorAll('.hero h1').forEach(h1 => {
            h1.textContent = '';
            const span = document.createElement('span');
            span.textContent = heroTitle;
            h1.appendChild(span);
        });
    }
    if (heroSubtitle) {
        document.querySelectorAll('.hero-copy > p').forEach(p => {
            p.textContent = heroSubtitle;
        });
    }
}

renderReviews();
initReviewForm();
initNewsletter();
applySettings();

import CONFIG from './config.js';
import { getOrder, addReview } from './utils/store.js';
import { escapeHtml } from './utils/cart.js';

const params = new URLSearchParams(window.location.search);
const orderNumber = params.get('order');

const TOTAL_ETA = 45 * 60; // seconds for delivery
const STAGES = [
    { until: 3 * 60, label: 'Order received' },
    { until: 12 * 60, label: 'Preparing your meal' },
    { until: 40 * 60, label: 'Out for delivery' },
    { until: Infinity, label: 'Delivered' }
];
const PICKUP_LABELS = ['Order received', 'Preparing your meal', 'Ready for pickup', 'Picked up'];

const RIDERS = ['Adebayo', 'Chiamaka', 'Emeka', 'Fatima', 'Tunde'];

function riderName(seed) {
    const hash = String(seed).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return RIDERS[hash % RIDERS.length];
}

function getStage(elapsedSeconds) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 0;
    if (elapsedSeconds < STAGES[0].until) return 0;
    if (elapsedSeconds < STAGES[1].until) return 1;
    if (elapsedSeconds < STAGES[2].until) return 2;
    return 3;
}

async function geocode(address) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (data && data.length) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch {
    }
    return null;
}

let map = null;
let riderMarker = null;
let clientLatLng = null;
let refreshTimer = null;
let lastStage = -1;

function createIcon(iconName, size = 34) {
    return L.divIcon({
        className: 'track-marker',
        html: `<span class="track-marker-pin pin-${iconName}"><i data-lucide="${iconName}" aria-hidden="true"></i></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size]
    });
}

function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

function initMap(restaurant, client) {
    map = L.map('track-map').setView([restaurant.lat, restaurant.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.marker([restaurant.lat, restaurant.lng], { icon: createIcon('store', 36) })
        .addTo(map).bindPopup('Emerald\'s Cuisine');

    L.marker([client.lat, client.lng], { icon: createIcon('map-pin', 38) })
        .addTo(map).bindPopup('Your delivery location');

    L.polyline([[restaurant.lat, restaurant.lng], [client.lat, client.lng]], {
        color: '#0F7A5A',
        weight: 3,
        dashArray: '8 8',
        opacity: 0.7
    }).addTo(map);

    riderMarker = L.marker([restaurant.lat, restaurant.lng], { icon: createIcon('bike', 38) })
        .addTo(map).bindPopup('Dispatch rider');

    refreshIcons();

    clientLatLng = L.latLng(client.lat, client.lng);
    map.fitBounds([[restaurant.lat, restaurant.lng], [client.lat, client.lng]], { padding: [40, 40] });
}

function interpolate(restaurant, progress) {
    const lat = restaurant.lat + (clientLatLng.lat - restaurant.lat) * progress;
    const lng = restaurant.lng + (clientLatLng.lng - restaurant.lng) * progress;
    return [lat, lng];
}

function formatMinutes(totalSeconds) {
    const minutes = Math.max(1, Math.round(totalSeconds / 60));
    return `${minutes} min`;
}

function render(order, createdAtMs, restaurant) {
    const elapsed = Math.max(0, (Date.now() - createdAtMs) / 1000);
    const stage = getStage(elapsed);
    const isPickup = order.deliveryType === 'pickup';
    const labels = isPickup ? PICKUP_LABELS : STAGES.map(s => s.label);
    const currentLabel = labels[stage];
    const etaRemaining = isPickup ? Math.max(0, 25 * 60 - elapsed) : Math.max(0, TOTAL_ETA - elapsed);

    if (stage >= labels.length - 1 && refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }

    // Rider position along the route
    let progress = 0;
    if (!isPickup && stage === 2) {
        progress = Math.min(1, Math.max(0, (elapsed - STAGES[1].until) / (STAGES[2].until - STAGES[1].until)));
    } else if (!isPickup && stage === 3) {
        progress = 1;
    }
    if (riderMarker && !isPickup) {
        const [lat, lng] = interpolate(restaurant, progress);
        riderMarker.setLatLng([lat, lng]);
    }

    document.getElementById('t-status-title').textContent = currentLabel;
    const etaEl = document.getElementById('t-eta');
    if (stage >= labels.length - 1) {
        etaEl.innerHTML = `<strong>${isPickup ? 'Picked up' : 'Delivered'}</strong>`;
    } else {
        etaEl.innerHTML = `<strong>${formatMinutes(etaRemaining)}</strong> estimated`;
    }

    const stepsEl = document.getElementById('track-steps');
    stepsEl.innerHTML = labels.map((label, index) => `
        <li class="${index < stage ? 'completed' : ''} ${index === stage ? 'current' : ''}">
            <span class="step-dot"></span>
            <strong>${label}</strong>
        </li>
    `).join('');

    const riderEl = document.getElementById('track-rider');
    if (isPickup) {
        riderEl.innerHTML = `<p>Pickup order — ready for collection at <strong>Emerald's Cuisine</strong>.</p>`;
    } else if (stage >= 3) {
        riderEl.innerHTML = `<p><strong>${riderName(order.orderNumber)}</strong> has delivered your order. Enjoy your meal!</p>`;
    } else if (stage >= 2) {
        riderEl.innerHTML = `<p><strong>${riderName(order.orderNumber)}</strong> is on the way with your order.</p>`;
    } else {
        riderEl.innerHTML = `<p>A dispatch rider will be assigned to your order shortly.</p>`;
    }

    document.getElementById('review-panel').classList.toggle('hidden', stage < 3);
}

async function load() {
    const card = document.getElementById('track-card');
    const heroOrder = document.getElementById('track-hero-order');

    if (!orderNumber) {
        heroOrder.textContent = 'Please provide an order number to track.';
        const lookupForm = document.getElementById('track-lookup-form');
        if (lookupForm) {
            lookupForm.hidden = false;
            lookupForm.addEventListener('submit', event => {
                event.preventDefault();
                const input = document.getElementById('track-lookup-input');
                const value = input?.value.trim();
                if (value) {
                    window.location.href = `track.html?order=${encodeURIComponent(value)}`;
                }
            });
        }
        return;
    }

    let localOrder = null;
    try {
        localOrder = JSON.parse(localStorage.getItem('emeraldLastOrder') || 'null');
    } catch {
        localOrder = null;
    }
    let order = null;
    if (orderNumber) {
        if (localOrder && localOrder.orderNumber === orderNumber) {
            order = localOrder;
        } else {
            try {
                order = await getOrder(orderNumber);
            } catch (error) {
                console.error('Failed to load order:', error);
                heroOrder.textContent = 'We could not load that order right now. Please try again.';
                return;
            }
        }
    }

    if (!order) {
        heroOrder.textContent = `No order found for ${orderNumber}.`;
        return;
    }

    heroOrder.textContent = `Order ${order.orderNumber} · ${order.fullName}`;

    const restaurant = CONFIG.restaurantLocation;
    let client = restaurant;
    if (order.deliveryType !== 'pickup') {
        const geocoded = await geocode(order.address);
        client = geocoded || { lat: restaurant.lat + 0.015, lng: restaurant.lng + 0.015 };
    }

    card.innerHTML = `
        <div class="track-head">
            <div>
                <span class="eyebrow">Order #${escapeHtml(order.orderNumber)}</span>
                <h2 id="t-status-title">Loading...</h2>
                <p id="track-delivery-to">Delivering to ${escapeHtml(order.address)}</p>
            </div>
            <div class="track-eta" id="t-eta">...</div>
        </div>
        <div id="track-map" class="track-map" aria-label="Map showing your delivery and rider location"></div>
        <ol class="track-steps" id="track-steps"></ol>
        <div class="track-rider" id="track-rider"></div>
        <div class="review-panel" id="review-panel">
            <h3>Enjoyed your meal?</h3>
            <p>Leave a review for your order.</p>
            <form id="review-form" novalidate>
                <input type="hidden" name="order_number" value="${escapeHtml(order.orderNumber)}">
                <label>Name
                    <input type="text" name="name" value="${escapeHtml(order.fullName)}" required>
                </label>
                <label>Rating
                    <select name="rating" required>
                        <option value="" disabled selected>Choose rating</option>
                        <option value="5">5 - Excellent</option>
                        <option value="4">4 - Great</option>
                        <option value="3">3 - Good</option>
                        <option value="2">2 - Fair</option>
                        <option value="1">1 - Poor</option>
                    </select>
                </label>
                <label>Review
                    <textarea name="comment" rows="3" placeholder="How was your meal and delivery?" required></textarea>
                </label>
                <button type="submit" class="btn btn-primary">Submit review</button>
                <p class="form-message" aria-live="polite"></p>
            </form>
        </div>
    `;

    if (typeof L === 'undefined') {
        card.insertAdjacentHTML('beforeend', '<p class="menu-empty">The live map could not be loaded. Tracking status is still available below.</p>');
    } else {
        try {
            initMap(restaurant, client);
        } catch (error) {
            console.error('Failed to initialise map:', error);
            card.insertAdjacentHTML('beforeend', '<p class="menu-empty">The live map could not be loaded. Tracking status is still available below.</p>');
        }
    }

    const createdAt = order.createdAt || order.created_at;
    let createdAtMs = createdAt ? new Date(createdAt).getTime() : NaN;
    if (!Number.isFinite(createdAtMs)) createdAtMs = Date.now();

    const reviewForm = document.getElementById('review-form');
    if (reviewForm) {
        reviewForm.addEventListener('submit', async event => {
            event.preventDefault();
            const formData = new FormData(reviewForm);
            const message = reviewForm.querySelector('.form-message');
            const rating = Number(formData.get('rating'));
            const name = String(formData.get('name') || '').trim();
            const comment = String(formData.get('comment') || '').trim();
            if (!name || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
                message.textContent = 'Please fill in your name, rating and review.';
                message.style.color = 'var(--danger, #c0392b)';
                return;
            }
            const submitButton = reviewForm.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;
            try {
                await addReview({
                    customer_name: name,
                    rating,
                    comment,
                    order_number: order.orderNumber
                });
                message.textContent = 'Thank you for your review!';
                message.style.color = 'var(--jade)';
                reviewForm.reset();
            } catch (error) {
                console.error('Failed to submit review:', error);
                message.textContent = 'We could not submit your review right now. Please try again.';
                message.style.color = 'var(--danger, #c0392b)';
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }

    render(order, createdAtMs, restaurant);
    refreshTimer = setInterval(() => render(order, createdAtMs, restaurant), 5000);
}

load();

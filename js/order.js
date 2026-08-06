import { getCart, saveCart, formatPrice, calculateTotals, getCartItemCount, escapeHtml, getCartItemDetails, saveCartItemDetails, removeCartItemDetails } from './utils/cart.js';
import { getMenuItems } from './utils/menu.js';
import { getCurrentUser } from './utils/auth.js';
import { openAuthModal } from './utils/auth-ui.js';

let menuItems = [];

const imageDictionary = [
    {
        keywords: ['jollof', 'rice'],
        src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&w=900&q=80',
        alt: 'Jollof rice with grilled chicken'
    },
    {
        keywords: ['full english'],
        src: 'images/categories/Eggs, sausage, beans, grilled tomato and toast.jpg',
        alt: 'Full English breakfast with eggs and sausage'
    },
    {
        keywords: ['custard', 'akamu', 'akara', 'breakfast', 'eggs'],
        src: 'images/categories/akara & pap.jpg',
        alt: 'Akara and pap, a classic Nigerian breakfast'
    },
    {
        keywords: ['coconut rice', 'egusi', 'ofada', 'nigerian', 'plantain'],
        src: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&w=900&q=80',
        alt: 'Nigerian coconut rice with chicken and plantain'
    },
    {
        keywords: ['alfredo', 'pasta', 'spaghetti', 'noodles', 'yakisoba', 'chow mein'],
        src: 'https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&w=900&q=80',
        alt: 'Creamy pasta dish with chicken'
    },
    {
        keywords: ['pepper soup', 'catfish', 'soup', 'broth'],
        src: 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?auto=format&w=900&q=80',
        alt: 'Spicy pepper soup bowl'
    },
    {
        keywords: ['suya', 'chicken', 'grilled', 'peppered', 'steak'],
        src: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&w=900&q=80',
        alt: 'Grilled chicken or steak with sides'
    },
    {
        keywords: ['salad', 'avocado', 'turkey'],
        src: 'https://images.unsplash.com/photo-1478145046317-39f10e56b5e9?auto=format&w=900&q=80',
        alt: 'Fresh salad bowl with avocado'
    },
    {
        keywords: ['brownie', 'dessert', 'cake', 'ice cream', 'parfait'],
        src: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&w=900&q=80',
        alt: 'Chocolate brownie dessert'
    },
    {
        keywords: ['juice', 'cocktail', 'drink', 'ginger', 'zobo', 'mocktail', 'tea'],
        src: 'https://images.unsplash.com/photo-1510627498534-cf7e9002facc?auto=format&w=900&q=80',
        alt: 'Refreshing beverage with ginger and mint'
    },
    {
        keywords: ['titus fish', 'side', 'coleslaw', 'fries'],
        src: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&w=900&q=80',
        alt: 'Side dish with fish and garnish'
    }
];

function getImageForItem(item) {
    const text = `${item.name} ${item.description}`.toLowerCase();
    const match = imageDictionary.find(entry => entry.keywords.some(keyword => text.includes(keyword)));
    return match || { src: item.image, alt: item.name };
}

const orderGrid = document.querySelector('.order-menu-grid');
const cartItemsContainer = document.querySelector('.cart-items');
const subtotalElement = document.getElementById('cart-subtotal');
const deliveryElement = document.getElementById('cart-delivery');
const vatElement = document.getElementById('cart-vat');
const totalElement = document.getElementById('cart-total');
const searchInput = document.getElementById('menu-search');
const categorySelect = document.getElementById('category-select');
const cartOverlay = document.getElementById('cartOverlay');
const cartPanel = document.getElementById('cart');
const cartCloseButton = document.querySelector('.cart-close');
const cartTriggerButton = document.querySelector('.cart-trigger');
let lastCartFocused = null;

function isMobileCartModal() {
    return window.matchMedia('(max-width: 1024px)').matches;
}

function openCartModal() {
    if (!cartPanel) return;
    lastCartFocused = document.activeElement;
    cartPanel.classList.add('cart-modal-open');
    cartPanel.setAttribute('aria-hidden', 'false');
    cartPanel.setAttribute('tabindex', '-1');
    document.body.classList.add('modal-open');
    if (cartOverlay) {
        cartOverlay.classList.add('active');
        cartOverlay.setAttribute('aria-hidden', 'false');
    }
    if (cartTriggerButton) {
        cartTriggerButton.setAttribute('aria-expanded', 'true');
    }
    cartPanel.focus({ preventScroll: true });
}

function closeCartModal() {
    if (!cartPanel) return;
    cartPanel.classList.remove('cart-modal-open');
    cartPanel.setAttribute('aria-hidden', 'true');
    if (cartOverlay) {
        cartOverlay.classList.remove('active');
        cartOverlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-open');
    if (cartTriggerButton) {
        cartTriggerButton.setAttribute('aria-expanded', 'false');
    }
    if (lastCartFocused instanceof HTMLElement) {
        lastCartFocused.focus();
        lastCartFocused = null;
    }
}

function renderCart() {
    const cart = getCart();
    const items = Object.keys(cart).map(id => {
        const item = menuItems.find(menu => menu.id === id) || getCartItemDetails(id);
        return item ? { ...item, quantity: cart[id] } : null;
    }).filter(Boolean);

    const { subtotal, vat, deliveryFee, total } = calculateTotals(items);
    cartItemsContainer.innerHTML = '';

    if (!items.length) {
        cartItemsContainer.innerHTML = '<p class="cart-empty">Your cart is empty. Add a meal to start your order.</p>';
        subtotalElement.textContent = formatPrice(0);
        vatElement.textContent = formatPrice(0);
        totalElement.textContent = formatPrice(0);
        deliveryElement.textContent = formatPrice(0);
        return;
    }

    items.forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div class="cart-item-details">
                <h4>${escapeHtml(item.name)}</h4>
                <p>${item.quantity} x ${formatPrice(item.price)}</p>
                <div class="quantity-selector">
                    <button type="button" class="qty-decrease" data-id="${item.id}">-</button>
                    <input type="text" value="${item.quantity}" aria-label="Quantity for ${escapeHtml(item.name)}" readonly>
                    <button type="button" class="qty-increase" data-id="${item.id}">+</button>
                </div>
            </div>
            <div class="cart-item-actions">
                <button type="button" class="remove-cart" data-id="${item.id}">Remove</button>
                <strong>${formatPrice(item.price * item.quantity)}</strong>
            </div>
        `;
        cartItemsContainer.appendChild(cartItem);
    });

    subtotalElement.textContent = formatPrice(subtotal);
    vatElement.textContent = formatPrice(vat);
    totalElement.textContent = formatPrice(total);
    deliveryElement.textContent = deliveryFee ? formatPrice(deliveryFee) : 'Free';
}

function updateCartCount() {
    const count = getCartItemCount();
    const cartIndicator = document.querySelector('.cart-count');
    if (cartIndicator) {
        cartIndicator.textContent = count;
        cartIndicator.style.display = count ? 'inline-flex' : 'none';
    }
    const floatingCart = document.getElementById('floatingCart');
    if (floatingCart) {
        const countBadge = floatingCart.querySelector('.floating-cart-count');
        if (countBadge) countBadge.textContent = count;
        floatingCart.classList.toggle('show', count > 0);
    }
}

function scrollCartIntoView() {
    const cartSection = document.getElementById('cart');
    if (!cartSection) return;

    cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    cartSection.setAttribute('tabindex', '-1');
    cartSection.focus({ preventScroll: true });
}

function renderMenu(items) {
    if (!orderGrid) return;

    if (!items.length) {
        orderGrid.innerHTML = '<p class="menu-empty">No dishes match your search. Try a different keyword or category.</p>';
        return;
    }

    orderGrid.innerHTML = items.map(item => {
        const image = getImageForItem(item);
        return `
        <article class="order-card">
            <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy">
            <div class="order-card-body">
                <div>
                    <h3>${escapeHtml(item.name)}</h3>
                    <p>${escapeHtml(item.description)}</p>
                </div>
            </div>
            <div class="order-card-footer">
                <span class="price-tag">${formatPrice(item.price)}</span>
                <button type="button" class="btn btn-primary add-to-cart" data-id="${item.id}">Add to Cart</button>
            </div>
        </article>
    `;
    }).join('');
}

function filterMenu() {
    const query = searchInput?.value.trim().toLowerCase() || '';
    const category = categorySelect?.value || 'all';
    const filtered = menuItems.filter(item => {
        const matchesCategory = category === 'all' || item.category === category;
        const name = String(item.name || '').toLowerCase();
        const description = String(item.description || '').toLowerCase();
        const matchesQuery = name.includes(query) || description.includes(query);
        return matchesCategory && matchesQuery;
    });
    renderMenu(filtered);
}

function addToCart(itemId) {
    const cart = getCart();
    cart[itemId] = Math.min((cart[itemId] || 0) + 1, 99);
    saveCart(cart);
    const item = menuItems.find(menu => menu.id === itemId);
    if (item) saveCartItemDetails(itemId, item);
    renderCart();
    updateCartCount();
}

function removeFromCart(itemId) {
    const cart = getCart();
    delete cart[itemId];
    saveCart(cart);
    removeCartItemDetails(itemId);
    renderCart();
    updateCartCount();
}

function changeQuantity(itemId, delta) {
    const cart = getCart();
    if (!cart[itemId]) return;
    cart[itemId] = Math.min(99, Math.max(1, cart[itemId] + delta));
    saveCart(cart);
    renderCart();
    updateCartCount();
}

if (searchInput) {
    searchInput.addEventListener('input', filterMenu);
}

if (categorySelect) {
    categorySelect.addEventListener('change', filterMenu);
}

document.querySelectorAll('.cart-trigger, #floatingCart, a[href="#cart"]').forEach(trigger => {
    trigger.addEventListener('click', event => {
        event.preventDefault();
        if (isMobileCartModal()) {
            openCartModal();
        } else {
            scrollCartIntoView();
        }
    });
});

const checkoutButton = document.querySelector('.cart-summary a[href="checkout.html"]');
if (checkoutButton) {
    checkoutButton.addEventListener('click', event => {
        if (!getCurrentUser()) {
            event.preventDefault();
            openAuthModal({
                onSuccess: () => {
                    window.location.href = 'checkout.html';
                }
            });
        }
    });
}

if (cartCloseButton) {
    cartCloseButton.addEventListener('click', closeCartModal);
}

if (cartOverlay) {
    cartOverlay.addEventListener('click', closeCartModal);
}

window.addEventListener('resize', () => {
    if (!isMobileCartModal()) {
        closeCartModal();
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && cartPanel?.classList.contains('cart-modal-open')) {
        closeCartModal();
    }
});


if (orderGrid) {
    orderGrid.addEventListener('click', event => {
        const button = event.target.closest('.add-to-cart');
        if (!button || !button.dataset.id) return;
        addToCart(button.dataset.id);
    });
}

if (cartItemsContainer) {
    cartItemsContainer.addEventListener('click', event => {
        if (event.target.matches('.remove-cart')) {
            removeFromCart(event.target.dataset.id);
        }
        if (event.target.matches('.qty-decrease')) {
            changeQuantity(event.target.dataset.id, -1);
        }
        if (event.target.matches('.qty-increase')) {
            changeQuantity(event.target.dataset.id, 1);
        }
    });
}

async function init() {
    if (!orderGrid) return;
    menuItems = await getMenuItems();

    if (!menuItems.length) {
        orderGrid.innerHTML = '<p class="menu-empty">The menu could not be loaded. Please open this page over a local server and try again.</p>';
        return;
    }

    renderMenu(menuItems);
    renderCart();
    updateCartCount();
}

init();

import { fetchRows } from './store.js';

let cachedMenu = null;
let cachedCategories = null;

// Wraps a promise with a timeout so a slow/unreachable backend never
// leaves the menu blank — we fall back to the local menu.json instead.
async function withTimeout(promise, ms = 6000) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Request timed out')), ms);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

// Menu items come from the Supabase "menu_items" table when configured,
// otherwise they fall back to the local data/menu.json (demo mode).
// If Supabase is configured but unreachable/empty, we also fall back
// so the order page never breaks.
export async function getMenuItems() {
    if (cachedMenu) return cachedMenu;

    try {
        const rows = await withTimeout(fetchRows('menu_items', { order: 'name', ascending: true }));
        if (rows && rows.length) {
            cachedMenu = rows.map(row => ({
                id: row.id,
                name: row.name,
                category: row.category,
                description: row.description || '',
                price: Number(row.price),
                rating: Number(row.rating) || 4.5,
                image: row.image || '',
                available: row.available !== false
            }));
            return cachedMenu;
        }
    } catch {
        // fall through to the local menu
    }

    try {
        const response = await fetch('./data/menu.json');
        cachedMenu = response.ok ? await response.json() : [];
    } catch {
        cachedMenu = [];
    }
    return cachedMenu;
}

// Category slugs shown in the order page filter (must match order.html).
export const CATEGORY_SLUGS = [
    'breakfast',
    'nigerian',
    'pasta',
    'grills',
    'soups',
    'salads',
    'desserts',
    'drinks',
    'sides'
];

// Categories drive the homepage grid and the order page filter.
const DEFAULT_CATEGORIES = [
    { name: 'Grills', description: 'Signature steaks, suya and barbecue favourites.', image: 'images/categories/Signature steaks, suya and barbecue favourites..jpg' },
    { name: 'Rice', description: 'Rich jollof, fragrant fried rice and gourmet sides.', image: 'images/categories/Rich jollof, fragrant fried rice and gourmet sides..jpg' },
    { name: 'Nigerian Cuisine', description: 'Classic local favourites like egusi, coconut rice and hearty soups.', image: 'images/categories/akara & pap.jpg' },
    { name: 'Soups', description: 'Warm, comforting bowls steeped in local spices.', image: 'images/categories/soups.jpg' },
    { name: 'Seafood', description: 'Fresh prawns, grilled fish and coastal specials.', image: 'images/categories/seafood.png' },
    { name: 'Drinks', description: 'Craft cocktails, cooling juices and premium wines.', image: 'images/categories/drinks.png' },
    { name: 'Desserts', description: 'Decadent sweets created to finish every meal.', image: 'images/categories/deserts.png' }
];

export async function getCategories() {
    if (cachedCategories) return cachedCategories;

    try {
        const rows = await withTimeout(fetchRows('categories', { order: 'sort_order', ascending: true }));
        if (rows && rows.length) {
            cachedCategories = rows.map(row => ({
                id: row.id,
                name: row.name,
                description: row.description || '',
                image: row.image || ''
            }));
            return cachedCategories;
        }
    } catch {
        // fall through to defaults
    }

    cachedCategories = DEFAULT_CATEGORIES;
    return DEFAULT_CATEGORIES;
}

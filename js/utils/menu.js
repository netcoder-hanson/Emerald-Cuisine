let cachedMenu = null;

export async function getMenuItems() {
    if (cachedMenu) return cachedMenu;
    try {
        const response = await fetch('./data/menu.json');
        cachedMenu = response.ok ? await response.json() : [];
    } catch {
        cachedMenu = [];
    }
    return cachedMenu;
}

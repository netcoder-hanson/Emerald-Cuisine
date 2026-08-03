import CONFIG from '../config.js';

const CREDENTIALS_KEY = 'emeraldAdminCredentials';

export function getAdminCredentials() {
    try {
        const stored = JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || 'null');
        if (stored && stored.username && stored.password) {
            return {
                username: stored.username,
                password: stored.password,
                email: stored.email || CONFIG.adminEmail || ''
            };
        }
    } catch {
        // Corrupt or unavailable storage — fall back to config.
    }
    return {
        username: CONFIG.adminUsername || 'admin',
        password: CONFIG.adminPassword || 'admin123',
        email: CONFIG.adminEmail || ''
    };
}

export function saveAdminCredentials({ username, password, email = '' }) {
    const usernameTrimmed = String(username || '').trim();
    const passwordTrimmed = String(password || '');
    if (!usernameTrimmed || !passwordTrimmed) return false;
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({
        username: usernameTrimmed,
        password: passwordTrimmed,
        email: String(email || '').trim()
    }));
    return true;
}

// True when the identifier (username or email) + password match the
// current admin credentials.
export function isAdminCredentials(identifier, password) {
    const creds = getAdminCredentials();
    const id = String(identifier || '').trim().toLowerCase();
    const usernameMatches = id === String(creds.username || '').trim().toLowerCase();
    const emailMatches = Boolean(creds.email) && id === String(creds.email).trim().toLowerCase();
    return (usernameMatches || emailMatches) && String(password || '') === creds.password;
}


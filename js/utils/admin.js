import CONFIG from '../config.js';
import { hashPassword } from './auth.js';

// Admin credentials can be overridden at runtime (saved from the admin
// dashboard -> Settings -> Admin credentials). When no override exists
// we fall back to the defaults in js/config.js (username: admin,
// password: admin123).
const CREDENTIALS_KEY = 'emeraldAdminCredentials';

function isHashValue(value) {
    return typeof value === 'string' && (/^[a-f0-9]{64}$/i.test(value) || value.startsWith('legacy-'));
}

// Returns the saved admin credentials (password never stored in plaintext),
// or null when no credentials have been saved yet.
export function getAdminCredentials() {
    try {
        const stored = JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || 'null');
        if (stored && stored.username) {
            return {
                username: stored.username,
                passwordHash: isHashValue(stored.passwordHash)
                    ? stored.passwordHash
                    : (isHashValue(stored.password) ? stored.password : null),
                legacyPlaintext: (!isHashValue(stored.passwordHash) && typeof stored.password === 'string' && stored.password)
                    ? stored.password
                    : null,
                email: stored.email || CONFIG.adminEmail || ''
            };
        }
    } catch {
        // Corrupt or unavailable storage — fall back to config defaults.
    }
    return null;
}

export async function saveAdminCredentials({ username, password, email = '' }) {
    const usernameTrimmed = String(username || '').trim();
    const passwordTrimmed = String(password || '');
    if (!usernameTrimmed || !passwordTrimmed) return false;
    const passwordHash = await hashPassword(passwordTrimmed);
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({
        username: usernameTrimmed,
        passwordHash,
        email: String(email || '').trim()
    }));
    return true;
}

// True when the identifier (username or email) + password match the
// current admin credentials. Uses the saved hashed credentials when they
// exist, otherwise the config defaults (demo mode).
export async function isAdminCredentials(identifier, password) {
    const id = String(identifier || '').trim().toLowerCase();
    const stored = getAdminCredentials();
    const supplied = String(password || '');

    if (stored) {
        const usernameMatches = id === String(stored.username || '').trim().toLowerCase();
        const emailMatches = Boolean(stored.email) && id === String(stored.email).trim().toLowerCase();
        if (!(usernameMatches || emailMatches)) return false;

        if (stored.passwordHash) {
            return stored.passwordHash === await hashPassword(supplied);
        }
        // Legacy plaintext entry saved before hashing — accept a match and
        // migrate it to a hash on the spot.
        if (stored.legacyPlaintext && supplied === stored.legacyPlaintext) {
            await saveAdminCredentials({
                username: stored.username,
                password: supplied,
                email: stored.email
            });
            return true;
        }
        return false;
    }

    // No saved credentials yet — the site uses the config defaults (demo).
    const usernameMatches = id === String(CONFIG.adminUsername || 'admin').trim().toLowerCase();
    const emailMatches = Boolean(CONFIG.adminEmail) && id === String(CONFIG.adminEmail).trim().toLowerCase();
    return (usernameMatches || emailMatches) && supplied === String(CONFIG.adminPassword || 'admin123');
}

// Sync check used only for UI hints (e.g. showing an "Admin dashboard"
// link to the account that owns the admin identifier).
export function isAdminIdentifier(identifier) {
    const id = String(identifier || '').trim().toLowerCase();
    const stored = getAdminCredentials();
    const username = stored ? stored.username : CONFIG.adminUsername;
    const email = stored ? stored.email : CONFIG.adminEmail;
    const usernameMatches = id === String(username || '').trim().toLowerCase();
    const emailMatches = Boolean(email) && id === String(email).trim().toLowerCase();
    return usernameMatches || emailMatches;
}

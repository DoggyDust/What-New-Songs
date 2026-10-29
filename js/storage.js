// ==========================================================================
// STORAGE MODULE - Handles local database persistence via localStorage
// ==========================================================================
// This file is responsible for reading, writing, and updating user data:
// 1. Followed artists list (ID, name, and profile picture).
// 2. Favorite tracks/albums IDs.
// 3. User configuration settings (view mode, theme colors, default player).
// 4. Seen releases list to detect and notify when BRAND NEW releases drop.
// ==========================================================================

const STORAGE_KEY = 'spotifyTrackerDb';

// Default schema used when the app is opened for the first time
const DEFAULT_DATABASE = {
    // Array of followed artists: [{ id: '...', name: '...', image: '...' }]
    artists: [],
    
    // Array of favorited release IDs: ['album_id_1', 'album_id_2']
    favorites: [],
    
    // User interface and playback settings
    settings: {
        mode: 'timeline',      // 'timeline' (New vs Past) or 'list' (Last 30 Days)
        theme: 'dark',         // 'dark', 'light', or 'custom'
        color: '#007BFF',      // Primary accent color (default #007BFF)
        bgColor: '#121212',    // Custom background color
        platform: 'spotify'    // 'spotify', 'apple', or 'youtube'
    },
    
    // Previous settings backup to support "Undo" on color changes
    previousSettings: null,
    
    // Timestamp of the last time releases were checked
    lastCheckedTimestamp: 0,
    
    // Release IDs that have already been acknowledged by the user
    // This allows us to highlight truly new drops with a "NEW" badge!
    seenReleaseIds: [],

    // Spotify Web API Developer credentials (stored locally per user)
    credentials: {
        clientId: '',
        clientSecret: ''
    }
};

// --------------------------------------------------------------------------
// Load the entire database from localStorage with fallback error handling
// --------------------------------------------------------------------------
function getDatabase() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return { ...DEFAULT_DATABASE };
        
        const parsed = JSON.parse(stored);
        
        // Ensure all required fields exist even if reading an older version
        if (!Array.isArray(parsed.artists)) parsed.artists = [];
        if (!Array.isArray(parsed.favorites)) parsed.favorites = [];
        if (!Array.isArray(parsed.seenReleaseIds)) parsed.seenReleaseIds = [];
        if (!parsed.settings) parsed.settings = { ...DEFAULT_DATABASE.settings };
        if (!parsed.settings.color || parsed.settings.color.toLowerCase() === '#1db954') {
            parsed.settings.color = '#007BFF';
        }
        if (!parsed.credentials || typeof parsed.credentials !== 'object') {
            parsed.credentials = {
                clientId: localStorage.getItem('spotify_client_id') || '',
                clientSecret: localStorage.getItem('spotify_client_secret') || ''
            };
        }
        
        return parsed;
    } catch (error) {
        console.error("// Storage Error: Failed to parse local database", error);
        return { ...DEFAULT_DATABASE };
    }
}

// --------------------------------------------------------------------------
// Save the database object back to localStorage
// --------------------------------------------------------------------------
function saveDatabase(db) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (error) {
        console.error("// Storage Error: Failed to write to localStorage", error);
    }
}

// --------------------------------------------------------------------------
// Helper: Check if an artist is already in the followed list
// --------------------------------------------------------------------------
function isArtistFollowed(artistId) {
    const db = getDatabase();
    return db.artists.some(a => a.id === artistId);
}

// --------------------------------------------------------------------------
// Helper: Add an artist to the followed list
// --------------------------------------------------------------------------
function followArtist(artist) {
    const db = getDatabase();
    // Prevent duplicate entries
    if (!db.artists.some(a => a.id === artist.id)) {
        db.artists.push({
            id: artist.id,
            name: artist.name,
            image: artist.image || ''
        });
        saveDatabase(db);
        return true;
    }
    return false;
}

// --------------------------------------------------------------------------
// Helper: Remove an artist from the followed list
// --------------------------------------------------------------------------
function unfollowArtist(artistId) {
    const db = getDatabase();
    const initialLength = db.artists.length;
    db.artists = db.artists.filter(a => a.id !== artistId);
    saveDatabase(db);
    return db.artists.length !== initialLength;
}

// --------------------------------------------------------------------------
// Helper: Toggle whether a release is starred/favorited
// --------------------------------------------------------------------------
function toggleFavoriteRelease(releaseId) {
    const db = getDatabase();
    const index = db.favorites.indexOf(releaseId);
    let isNowFavorited = false;
    
    if (index > -1) {
        // Remove from favorites
        db.favorites.splice(index, 1);
        isNowFavorited = false;
    } else {
        // Add to favorites
        db.favorites.push(releaseId);
        isNowFavorited = true;
    }
    
    saveDatabase(db);
    return isNowFavorited;
}

// --------------------------------------------------------------------------
// Helper: Check if a release is marked as favorite
// --------------------------------------------------------------------------
function isReleaseFavorited(releaseId) {
    const db = getDatabase();
    return db.favorites.includes(releaseId);
}

// --------------------------------------------------------------------------
// Helper: Mark releases as seen so they don't repeatedly show "NEW" badges
// --------------------------------------------------------------------------
function markReleasesAsSeen(releaseIds) {
    const db = getDatabase();
    let updated = false;
    
    releaseIds.forEach(id => {
        if (!db.seenReleaseIds.includes(id)) {
            db.seenReleaseIds.push(id);
            updated = true;
        }
    });
    
    // Keep list bounded so localStorage doesn't grow indefinitely
    if (db.seenReleaseIds.length > 500) {
        db.seenReleaseIds = db.seenReleaseIds.slice(-500);
    }
    
    if (updated) {
        saveDatabase(db);
    }
}

// --------------------------------------------------------------------------
// Helper: Update app settings (theme, mode, colors, playback platform)
// --------------------------------------------------------------------------
function updateAppSettings(partialSettings) {
    const db = getDatabase();
    db.settings = { ...db.settings, ...partialSettings };
    saveDatabase(db);
}

// --------------------------------------------------------------------------
// Helper: Get saved Spotify Web API credentials from database / localStorage
// --------------------------------------------------------------------------
function getSavedCredentials() {
    const db = getDatabase();
    const clientId = (db.credentials && db.credentials.clientId) || localStorage.getItem('spotify_client_id') || '';
    const clientSecret = (db.credentials && db.credentials.clientSecret) || localStorage.getItem('spotify_client_secret') || '';
    return {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim()
    };
}

// --------------------------------------------------------------------------
// Helper: Save Spotify API credentials to database and localStorage
// --------------------------------------------------------------------------
function saveSpotifyCredentials(clientId, clientSecret) {
    const db = getDatabase();
    const cleanId = (clientId || '').trim();
    const cleanSecret = (clientSecret || '').trim();

    db.credentials = {
        clientId: cleanId,
        clientSecret: cleanSecret
    };
    saveDatabase(db);

    if (cleanId) localStorage.setItem('spotify_client_id', cleanId);
    else localStorage.removeItem('spotify_client_id');

    if (cleanSecret) localStorage.setItem('spotify_client_secret', cleanSecret);
    else localStorage.removeItem('spotify_client_secret');

    // Invalidate cached token in spotify-api.js if present
    if (typeof resetSpotifyTokenCache === 'function') {
        resetSpotifyTokenCache();
    }
}

// --------------------------------------------------------------------------
// Helper: Clear Spotify API credentials from database and localStorage
// --------------------------------------------------------------------------
function clearSpotifyCredentials() {
    saveSpotifyCredentials('', '');
    localStorage.removeItem('spotify_auth_method');
}

// --------------------------------------------------------------------------
// PIN Lockout Tracking: 5 attempts max -> 7-day device lockout
// --------------------------------------------------------------------------
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

function getPinLockoutStatus() {
    const lockoutUntilStr = localStorage.getItem('spotify_pin_lockout_until');
    const now = Date.now();

    if (lockoutUntilStr) {
        const lockoutUntil = parseInt(lockoutUntilStr, 10);
        if (now < lockoutUntil) {
            const remainingMs = lockoutUntil - now;
            const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
            return {
                isLocked: true,
                remainingMs,
                remainingDays,
                lockoutUntil
            };
        } else {
            // Lockout period has elapsed, reset attempts
            resetPinAttempts();
        }
    }

    const attempts = parseInt(localStorage.getItem('spotify_pin_attempts') || '0', 10);
    const attemptsRemaining = Math.max(0, PIN_MAX_ATTEMPTS - attempts);

    return {
        isLocked: false,
        attempts,
        attemptsRemaining,
        maxAttempts: PIN_MAX_ATTEMPTS
    };
}

function recordFailedPinAttempt() {
    let attempts = parseInt(localStorage.getItem('spotify_pin_attempts') || '0', 10) + 1;
    localStorage.setItem('spotify_pin_attempts', attempts.toString());

    if (attempts >= PIN_MAX_ATTEMPTS) {
        const lockoutUntil = Date.now() + PIN_LOCKOUT_DURATION_MS;
        localStorage.setItem('spotify_pin_lockout_until', lockoutUntil.toString());
        return {
            isLocked: true,
            attempts,
            remainingDays: 7,
            lockoutUntil
        };
    }

    return {
        isLocked: false,
        attempts,
        attemptsRemaining: PIN_MAX_ATTEMPTS - attempts
    };
}

function resetPinAttempts() {
    localStorage.removeItem('spotify_pin_attempts');
    localStorage.removeItem('spotify_pin_lockout_until');
}


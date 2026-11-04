const STORAGE_KEY = 'spotifyTrackerDb';

const DEFAULT_DATABASE = {
    artists: [],
    favorites: [],
    pinnedArtists: [],
    favoriteArtists: [],
    accentColorHistory: [],
    bgColorHistory: [],
    settings: {
        mode: 'timeline',
        theme: 'dark',
        color: '#4169E1',
        bgColor: '#121212',
        platform: 'spotify'
    },
    previousSettings: null,
    lastCheckedTimestamp: 0,
    lastOpenedTimestamp: Date.now(),
    previousSessionOpenedTimestamp: 0,
    seenReleaseIds: [],
    credentials: {
        clientId: '',
        clientSecret: ''
    }
};

function getDatabase() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return { ...DEFAULT_DATABASE };

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed.artists)) parsed.artists = [];
        if (!Array.isArray(parsed.favorites)) parsed.favorites = [];
        if (!Array.isArray(parsed.pinnedArtists)) parsed.pinnedArtists = [];
        if (!Array.isArray(parsed.favoriteArtists)) parsed.favoriteArtists = [];
        if (!Array.isArray(parsed.accentColorHistory)) parsed.accentColorHistory = [];
        if (!Array.isArray(parsed.bgColorHistory)) parsed.bgColorHistory = [];
        if (!Array.isArray(parsed.seenReleaseIds)) parsed.seenReleaseIds = [];
        if (!parsed.settings) parsed.settings = { ...DEFAULT_DATABASE.settings };

        if (!parsed.settings.color ||
            parsed.settings.color.toLowerCase() === '#1db954' ||
            parsed.settings.color.toLowerCase() === '#007bff') {
            parsed.settings.color = '#4169E1';
        }

        if (!parsed.credentials || typeof parsed.credentials !== 'object') {
            parsed.credentials = {
                clientId: localStorage.getItem('spotify_client_id') || '',
                clientSecret: localStorage.getItem('spotify_client_secret') || ''
            };
        }

        return parsed;
    } catch (error) {
        return { ...DEFAULT_DATABASE };
    }
}

function saveDatabase(db) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (error) { }
}

function initSessionTimestamps() {
    const db = getDatabase();
    const now = Date.now();
    if (!db.previousSessionOpenedTimestamp && db.lastOpenedTimestamp) {
        db.previousSessionOpenedTimestamp = db.lastOpenedTimestamp;
    } else if (db.lastOpenedTimestamp && (now - db.lastOpenedTimestamp > 60000)) {
        db.previousSessionOpenedTimestamp = db.lastOpenedTimestamp;
    }
    db.lastOpenedTimestamp = now;
    saveDatabase(db);
}

function getPreviousSessionOpenedTimestamp() {
    const db = getDatabase();
    return db.previousSessionOpenedTimestamp || (Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function isArtistFollowed(artistId) {
    const db = getDatabase();
    return db.artists.some(a => a.id === artistId);
}

function followArtist(artist) {
    const db = getDatabase();
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

function unfollowArtist(artistId) {
    const db = getDatabase();
    const initialLength = db.artists.length;
    db.artists = db.artists.filter(a => a.id !== artistId);
    if (db.pinnedArtists) db.pinnedArtists = db.pinnedArtists.filter(id => id !== artistId);
    if (db.favoriteArtists) db.favoriteArtists = db.favoriteArtists.filter(id => id !== artistId);
    saveDatabase(db);
    return db.artists.length !== initialLength;
}

function isArtistPinned(artistId) {
    const db = getDatabase();
    return Array.isArray(db.pinnedArtists) && db.pinnedArtists.includes(artistId);
}

function togglePinArtist(artistId) {
    const db = getDatabase();
    if (!Array.isArray(db.pinnedArtists)) db.pinnedArtists = [];
    const index = db.pinnedArtists.indexOf(artistId);
    let isPinned = false;
    if (index > -1) {
        db.pinnedArtists.splice(index, 1);
        isPinned = false;
    } else {
        db.pinnedArtists.push(artistId);
        isPinned = true;
    }
    saveDatabase(db);
    return isPinned;
}

function isArtistFavorited(artistId) {
    const db = getDatabase();
    return Array.isArray(db.favoriteArtists) && db.favoriteArtists.includes(artistId);
}

function toggleFavoriteArtist(artistId) {
    const db = getDatabase();
    if (!Array.isArray(db.favoriteArtists)) db.favoriteArtists = [];
    const index = db.favoriteArtists.indexOf(artistId);
    let isFavorited = false;
    if (index > -1) {
        db.favoriteArtists.splice(index, 1);
        isFavorited = false;
    } else {
        db.favoriteArtists.push(artistId);
        isFavorited = true;
    }
    saveDatabase(db);
    return isFavorited;
}

function toggleFavoriteRelease(releaseId) {
    const db = getDatabase();
    const index = db.favorites.indexOf(releaseId);
    let isNowFavorited = false;

    if (index > -1) {
        db.favorites.splice(index, 1);
        isNowFavorited = false;
    } else {
        db.favorites.push(releaseId);
        isNowFavorited = true;
    }

    saveDatabase(db);
    return isNowFavorited;
}

function isReleaseFavorited(release) {
    const db = getDatabase();
    const releaseId = typeof release === 'object' && release !== null ? release.id : release;
    if (db.favorites && db.favorites.includes(releaseId)) {
        return true;
    }
    if (typeof release === 'object' && release !== null && Array.isArray(release.artists)) {
        return release.artists.some(artist => isArtistFavorited(artist.id));
    }
    return false;
}

function isReleaseSeen(releaseId) {
    const db = getDatabase();
    return Array.isArray(db.seenReleaseIds) && db.seenReleaseIds.includes(releaseId);
}

function markReleaseAsSeen(releaseId) {
    const db = getDatabase();
    if (!Array.isArray(db.seenReleaseIds)) db.seenReleaseIds = [];
    if (!db.seenReleaseIds.includes(releaseId)) {
        db.seenReleaseIds.push(releaseId);
        if (db.seenReleaseIds.length > 1000) {
            db.seenReleaseIds = db.seenReleaseIds.slice(-1000);
        }
        saveDatabase(db);
    }
}

function markReleasesAsSeen(releaseIds) {
    const db = getDatabase();
    let updated = false;
    if (!Array.isArray(db.seenReleaseIds)) db.seenReleaseIds = [];

    releaseIds.forEach(id => {
        if (!db.seenReleaseIds.includes(id)) {
            db.seenReleaseIds.push(id);
            updated = true;
        }
    });

    if (db.seenReleaseIds.length > 1000) {
        db.seenReleaseIds = db.seenReleaseIds.slice(-1000);
    }

    if (updated) {
        saveDatabase(db);
    }
}

function pushAccentColorHistory(color) {
    const db = getDatabase();
    if (!Array.isArray(db.accentColorHistory)) db.accentColorHistory = [];
    if (!color) return;
    const last = db.accentColorHistory[db.accentColorHistory.length - 1];
    if (last !== color) {
        db.accentColorHistory.push(color);
        if (db.accentColorHistory.length > 50) db.accentColorHistory.shift();
        saveDatabase(db);
    }
}

function popAccentColorHistory() {
    const db = getDatabase();
    if (!Array.isArray(db.accentColorHistory) || db.accentColorHistory.length === 0) return null;
    const prev = db.accentColorHistory.pop();
    saveDatabase(db);
    return prev;
}

function getAccentColorHistoryCount() {
    const db = getDatabase();
    return Array.isArray(db.accentColorHistory) ? db.accentColorHistory.length : 0;
}

function pushBgColorHistory(color) {
    const db = getDatabase();
    if (!Array.isArray(db.bgColorHistory)) db.bgColorHistory = [];
    if (!color) return;
    const last = db.bgColorHistory[db.bgColorHistory.length - 1];
    if (last !== color) {
        db.bgColorHistory.push(color);
        if (db.bgColorHistory.length > 50) db.bgColorHistory.shift();
        saveDatabase(db);
    }
}

function popBgColorHistory() {
    const db = getDatabase();
    if (!Array.isArray(db.bgColorHistory) || db.bgColorHistory.length === 0) return null;
    const prev = db.bgColorHistory.pop();
    saveDatabase(db);
    return prev;
}

function getBgColorHistoryCount() {
    const db = getDatabase();
    return Array.isArray(db.bgColorHistory) ? db.bgColorHistory.length : 0;
}

function updateAppSettings(partialSettings) {
    const db = getDatabase();
    db.settings = { ...db.settings, ...partialSettings };
    saveDatabase(db);
}

function getSavedCredentials() {
    const db = getDatabase();
    const clientId = (db.credentials && db.credentials.clientId) || localStorage.getItem('spotify_client_id') || '';
    const clientSecret = (db.credentials && db.credentials.clientSecret) || localStorage.getItem('spotify_client_secret') || '';
    return {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim()
    };
}

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

    if (typeof resetSpotifyTokenCache === 'function') {
        resetSpotifyTokenCache();
    }
}

function clearSpotifyCredentials() {
    saveSpotifyCredentials('', '');
    localStorage.removeItem('spotify_auth_method');
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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

function formatReleaseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const parts = dateStr.trim().split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
    if (parts.length === 2) {
        const [year, month] = parts;
        return `${month.padStart(2, '0')}/${year}`;
    }
    return dateStr;
}

function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    if (parts.length === 2) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
    }
    return new Date(parseInt(parts[0], 10), 0, 1);
}

function getReleaseAgeInDays(releaseDateStr, precision) {
    if (!releaseDateStr) return 999;
    let cleanDateStr = releaseDateStr;
    if (precision === 'year' && !cleanDateStr.includes('-')) cleanDateStr += '-01-01';
    else if (precision === 'month' && cleanDateStr.split('-').length === 2) cleanDateStr += '-01';

    const now = new Date();
    const relDate = parseLocalDate(cleanDateStr);
    if (!relDate || isNaN(relDate.getTime())) return 999;

    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const relMidnight = new Date(relDate.getFullYear(), relDate.getMonth(), relDate.getDate()).getTime();

    return Math.round((todayMidnight - relMidnight) / (1000 * 60 * 60 * 24));
}

function exportDatabaseToFile() {
    const db = getDatabase();
    const exportData = {
        app: 'what-new-songs',
        version: 1,
        exportedAt: new Date().toISOString(),
        artists: Array.isArray(db.artists) ? db.artists : [],
        favorites: Array.isArray(db.favorites) ? db.favorites : [],
        pinnedArtists: Array.isArray(db.pinnedArtists) ? db.pinnedArtists : [],
        favoriteArtists: Array.isArray(db.favoriteArtists) ? db.favoriteArtists : [],
        seenReleaseIds: Array.isArray(db.seenReleaseIds) ? db.seenReleaseIds : [],
        settings: db.settings || {
            mode: 'timeline',
            theme: 'dark',
            color: '#4169E1',
            bgColor: '#121212',
            platform: 'spotify'
        },
        credentials: db.credentials || {
            clientId: '',
            clientSecret: ''
        },
        accentColorHistory: Array.isArray(db.accentColorHistory) ? db.accentColorHistory : [],
        bgColorHistory: Array.isArray(db.bgColorHistory) ? db.bgColorHistory : []
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `what-new-songs-backup-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, fileName };
}

function validateAndImportDatabase(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') {
        return { success: false, error: 'Error importing data: The file is empty or invalid.' };
    }

    let parsed;
    try {
        parsed = JSON.parse(rawContent);
    } catch (e) {
        return { success: false, error: 'Error importing data: The file does not contain valid JSON.' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { success: false, error: 'Error importing data: File structure does not make sense.' };
    }

    if (parsed.artists !== undefined) {
        if (!Array.isArray(parsed.artists)) {
            return { success: false, error: 'Error importing data: Artists data is corrupted.' };
        }
        for (let i = 0; i < parsed.artists.length; i++) {
            const a = parsed.artists[i];
            if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id.trim() || typeof a.name !== 'string' || !a.name.trim()) {
                return { success: false, error: 'Error importing data: Artist entries are missing required fields or corrupted.' };
            }
        }
    }

    if (parsed.favorites !== undefined) {
        if (!Array.isArray(parsed.favorites) || !parsed.favorites.every(id => typeof id === 'string')) {
            return { success: false, error: 'Error importing data: Favorites list is corrupted.' };
        }
    }

    if (parsed.pinnedArtists !== undefined) {
        if (!Array.isArray(parsed.pinnedArtists) || !parsed.pinnedArtists.every(id => typeof id === 'string')) {
            return { success: false, error: 'Error importing data: Pinned artists list is corrupted.' };
        }
    }

    if (parsed.favoriteArtists !== undefined) {
        if (!Array.isArray(parsed.favoriteArtists) || !parsed.favoriteArtists.every(id => typeof id === 'string')) {
            return { success: false, error: 'Error importing data: Favorite artists list is corrupted.' };
        }
    }

    if (parsed.seenReleaseIds !== undefined) {
        if (!Array.isArray(parsed.seenReleaseIds) || !parsed.seenReleaseIds.every(id => typeof id === 'string')) {
            return { success: false, error: 'Error importing data: Seen releases list is corrupted.' };
        }
    }

    if (parsed.settings !== undefined) {
        if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
            return { success: false, error: 'Error importing data: Settings format does not make sense.' };
        }
        if (parsed.settings.mode && !['timeline', 'list'].includes(parsed.settings.mode)) {
            return { success: false, error: 'Error importing data: View mode setting is invalid.' };
        }
        if (parsed.settings.theme && !['dark', 'light', 'custom'].includes(parsed.settings.theme)) {
            return { success: false, error: 'Error importing data: Theme setting is invalid.' };
        }
        if (parsed.settings.platform && !['spotify', 'apple', 'youtube'].includes(parsed.settings.platform)) {
            return { success: false, error: 'Error importing data: Music platform setting is invalid.' };
        }
    }

    if (parsed.credentials !== undefined) {
        if (!parsed.credentials || typeof parsed.credentials !== 'object' || Array.isArray(parsed.credentials)) {
            return { success: false, error: 'Error importing data: Credentials format does not make sense.' };
        }
        if (parsed.credentials.clientId !== undefined && typeof parsed.credentials.clientId !== 'string') {
            return { success: false, error: 'Error importing data: Client ID must be a string.' };
        }
        if (parsed.credentials.clientSecret !== undefined && typeof parsed.credentials.clientSecret !== 'string') {
            return { success: false, error: 'Error importing data: Client Secret must be a string.' };
        }
    }

    const currentDb = getDatabase();
    const newDb = {
        artists: Array.isArray(parsed.artists) ? parsed.artists.map(a => ({
            id: a.id.trim(),
            name: a.name.trim(),
            image: typeof a.image === 'string' ? a.image : ''
        })) : currentDb.artists,
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : currentDb.favorites,
        pinnedArtists: Array.isArray(parsed.pinnedArtists) ? parsed.pinnedArtists : currentDb.pinnedArtists,
        favoriteArtists: Array.isArray(parsed.favoriteArtists) ? parsed.favoriteArtists : currentDb.favoriteArtists,
        seenReleaseIds: Array.isArray(parsed.seenReleaseIds) ? parsed.seenReleaseIds : currentDb.seenReleaseIds,
        accentColorHistory: Array.isArray(parsed.accentColorHistory) ? parsed.accentColorHistory : (currentDb.accentColorHistory || []),
        bgColorHistory: Array.isArray(parsed.bgColorHistory) ? parsed.bgColorHistory : (currentDb.bgColorHistory || []),
        settings: {
            mode: (parsed.settings && ['timeline', 'list'].includes(parsed.settings.mode)) ? parsed.settings.mode : (currentDb.settings.mode || 'timeline'),
            theme: (parsed.settings && ['dark', 'light', 'custom'].includes(parsed.settings.theme)) ? parsed.settings.theme : (currentDb.settings.theme || 'dark'),
            color: (parsed.settings && typeof parsed.settings.color === 'string') ? parsed.settings.color : (currentDb.settings.color || '#4169E1'),
            bgColor: (parsed.settings && typeof parsed.settings.bgColor === 'string') ? parsed.settings.bgColor : (currentDb.settings.bgColor || '#121212'),
            platform: (parsed.settings && ['spotify', 'apple', 'youtube'].includes(parsed.settings.platform)) ? parsed.settings.platform : (currentDb.settings.platform || 'spotify')
        },
        credentials: {
            clientId: (parsed.credentials && typeof parsed.credentials.clientId === 'string') ? parsed.credentials.clientId.trim() : (currentDb.credentials ? currentDb.credentials.clientId : ''),
            clientSecret: (parsed.credentials && typeof parsed.credentials.clientSecret === 'string') ? parsed.credentials.clientSecret.trim() : (currentDb.credentials ? currentDb.credentials.clientSecret : '')
        },
        lastOpenedTimestamp: Date.now(),
        previousSessionOpenedTimestamp: currentDb.previousSessionOpenedTimestamp || (Date.now() - 7 * 24 * 60 * 60 * 1000)
    };

    saveDatabase(newDb);

    if (newDb.credentials.clientId) {
        localStorage.setItem('spotify_client_id', newDb.credentials.clientId);
    } else {
        localStorage.removeItem('spotify_client_id');
    }

    if (newDb.credentials.clientSecret) {
        localStorage.setItem('spotify_client_secret', newDb.credentials.clientSecret);
    } else {
        localStorage.removeItem('spotify_client_secret');
    }

    if (typeof resetSpotifyTokenCache === 'function') {
        resetSpotifyTokenCache();
    }

    return { success: true, message: 'Success importing data' };
}

// ==========================================================================
// SPOTIFY API SERVICE - Handles all communication with the Spotify Web API
// ==========================================================================
// This file is responsible for:
// 1. Authenticating securely via Spotify Client Credentials Flow.
// 2. Caching tokens so we don't request a new token on every single call.
// 3. Searching for artists by name or direct URL / Spotify URI / ID.
// 4. Fetching the newest albums and singles from followed artists.
// 5. Resolving external music links (Spotify, Apple Music, YouTube Music).
// ==========================================================================

// AES-GCM Encrypted credentials container (PBKDF2-SHA256, 100,000 iterations)
// Credentials can only be decrypted in memory by supplying the correct access PIN.
const ENCRYPTED_CREDENTIALS_STORE = {
    salt: '5c42c2fb1c39557c91de8b0b23e7a7cd',
    iv: 'cbde025e04d82ad20dc75e0a',
    ciphertext: '1d358b236e1c3bc740e206c51479b97379fa7c082cf21599be0f628bfe3d7b50524b14f8e7cfbc8eddbe757c9b95f81e232a95a9780c4b84f4a9a456aaea654653714aba344cdce3d8cd29bf19c0b71784adfbb65ba23b9a893da3c7581b4a192a',
    tag: 'cbcb0291acfbf185139c06baeaa7cd22'
};

// Helper: Convert hex string to Uint8Array
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

// --------------------------------------------------------------------------
// Function: Decrypt the bundled Spotify credentials using the user's PIN
// --------------------------------------------------------------------------
async function decryptCredentialsWithPin(pin) {
    if (!pin || typeof pin !== 'string') {
        throw new Error('Please enter a valid PIN.');
    }

    const cryptoObj = (typeof window !== 'undefined' && window.crypto) ? window.crypto : null;
    if (!cryptoObj || !cryptoObj.subtle) {
        throw new Error('Web Cryptography API is not available on this browser.');
    }

    const cleanPin = pin.trim();
    const encoder = new TextEncoder();
    const pinBuffer = encoder.encode(cleanPin);

    // 1. Import raw PIN for PBKDF2
    const keyMaterial = await cryptoObj.subtle.importKey(
        'raw',
        pinBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    // 2. Derive 256-bit AES-GCM key
    const key = await cryptoObj.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: hexToBytes(ENCRYPTED_CREDENTIALS_STORE.salt),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );

    // 3. Assemble combined ciphertext and auth tag for WebCrypto AES-GCM
    const cipherBytes = hexToBytes(ENCRYPTED_CREDENTIALS_STORE.ciphertext);
    const tagBytes = hexToBytes(ENCRYPTED_CREDENTIALS_STORE.tag);
    const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
    combined.set(cipherBytes);
    combined.set(tagBytes, cipherBytes.length);

    // 4. Decrypt (will throw OperationError if PIN or tag mismatch)
    const decryptedBuffer = await cryptoObj.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: hexToBytes(ENCRYPTED_CREDENTIALS_STORE.iv)
        },
        key,
        combined
    );

    const decryptedJson = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decryptedJson); // Returns { clientId, clientSecret }
}


// API Endpoints (Direct string URLs)
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// In-memory token cache to prevent redundant auth requests
let cachedAccessToken = null;
let tokenExpiresAt = 0;

// --------------------------------------------------------------------------
// Function: Check if the app is running in an Electron Desktop environment
// --------------------------------------------------------------------------
function isElectronApp() {
    return Boolean(
        (typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron) ||
        (typeof window !== 'undefined' && window.require) ||
        (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.toLowerCase().includes(' electron/'))
    );
}

// --------------------------------------------------------------------------
// Function: Determine which Spotify credentials to use (custom credentials only)
// Both the web version and the desktop app require the user to enter their PIN
// or custom Spotify Developer credentials. There is no automatic built-in bypass.
// --------------------------------------------------------------------------
function getActiveSpotifyCredentials() {
    // Check if user has unlocked credentials (via PIN or manual entry) stored locally
    const custom = (typeof getSavedCredentials === 'function') 
        ? getSavedCredentials() 
        : {
            clientId: localStorage.getItem('spotify_client_id') || '',
            clientSecret: localStorage.getItem('spotify_client_secret') || ''
        };

    if (custom.clientId && custom.clientSecret) {
        return {
            clientId: custom.clientId.trim(),
            clientSecret: custom.clientSecret.trim(),
            isBuiltin: false,
            source: 'custom'
        };
    }

    // No credentials configured — user must enter PIN or custom keys
    return {
        clientId: '',
        clientSecret: '',
        isBuiltin: false,
        source: 'none'
    };
}

// --------------------------------------------------------------------------
// Function: Check if active Spotify credentials are valid and ready
// --------------------------------------------------------------------------
function hasSpotifyCredentials() {
    const creds = getActiveSpotifyCredentials();
    return Boolean(creds.clientId && creds.clientSecret);
}

// --------------------------------------------------------------------------
// Function: Reset in-memory token cache (used when keys are changed or cleared)
// --------------------------------------------------------------------------
function resetSpotifyTokenCache() {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
}

// --------------------------------------------------------------------------
// Function: Test specific or current Spotify credentials directly
// --------------------------------------------------------------------------
async function testSpotifyCredentials(clientId, clientSecret) {
    const active = getActiveSpotifyCredentials();
    const targetId = (clientId !== undefined ? clientId : active.clientId).trim();
    const targetSecret = (clientSecret !== undefined ? clientSecret : active.clientSecret).trim();

    if (!targetId || !targetSecret) {
        return {
            success: false,
            error: 'Missing credentials. Both Client ID and Client Secret are required.'
        };
    }

    try {
        const basicAuth = btoa(`${targetId}:${targetSecret}`);
        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            let errorDetail = '';
            try {
                const errData = await response.json();
                errorDetail = errData.error_description || errData.error || '';
            } catch (_) {}

            return {
                success: false,
                status: response.status,
                error: (response.status === 400 || response.status === 401)
                    ? 'Spotify rejected credentials (Invalid Client ID or Secret). Please check your Spotify Developer Dashboard.'
                    : `Spotify Auth failed (HTTP ${response.status})${errorDetail ? ': ' + errorDetail : ''}`
            };
        }

        const data = await response.json();
        if (data.access_token) {
            return {
                success: true,
                token: data.access_token,
                expiresIn: data.expires_in
            };
        }
        return { success: false, error: 'Spotify returned an empty access token.' };
    } catch (networkErr) {
        return {
            success: false,
            error: `Network error connecting to Spotify: ${networkErr.message || 'Check your internet connection.'}`
        };
    }
}

// --------------------------------------------------------------------------
// Function: Obtain a valid Spotify Access Token (client credentials flow)
// --------------------------------------------------------------------------
async function getSpotifyToken() {
    const creds = getActiveSpotifyCredentials();
    if (!creds.clientId || !creds.clientSecret) {
        console.warn('// Spotify API: No credentials configured.');
        if (typeof window !== 'undefined' && typeof window.openCredentialsModal === 'function') {
            window.openCredentialsModal();
        }
        return null;
    }

    // If we have an unexpired token in memory, reuse it immediately
    const now = Date.now();
    if (cachedAccessToken && now < tokenExpiresAt - 60000) {
        return cachedAccessToken;
    }

    try {
        // Encode "client_id:client_secret" to Base64 for the Authorization header
        const basicAuth = btoa(`${creds.clientId}:${creds.clientSecret}`);
        
        // POST to the Spotify token endpoint
        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            if (response.status === 400 || response.status === 401) {
                // If on web and invalid credentials, pop up modal to fix
                if (!creds.isBuiltin && typeof window !== 'undefined' && typeof window.openCredentialsModal === 'function') {
                    window.openCredentialsModal({ errorMessage: 'Spotify rejected your stored credentials. Please update them.' });
                }
            }
            throw new Error(`Spotify Auth HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.access_token) {
            cachedAccessToken = data.access_token;
            // expires_in is in seconds; convert to millisecond epoch
            tokenExpiresAt = now + (data.expires_in * 1000);
            return cachedAccessToken;
        } else {
            throw new Error('No access_token returned by Spotify.');
        }
    } catch (error) {
        console.error('// Spotify API Error: Failed to acquire access token:', error);
        return null;
    }
}

// --------------------------------------------------------------------------
// Function: Search for artists on Spotify by name
// --------------------------------------------------------------------------
async function searchSpotifyArtists(query) {
    if (!query || !query.trim()) return [];
    
    const token = await getSpotifyToken();
    if (!token) throw new Error('Could not connect to Spotify service.');

    try {
        const url = `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=artist&limit=10`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Search failed with status: ${response.status}`);
        }

        const data = await response.json();
        return (data.artists && data.artists.items) ? data.artists.items : [];
    } catch (error) {
        console.error('// Spotify API Error: Artist search failed:', error);
        throw error;
    }
}

// --------------------------------------------------------------------------
// Function: Extract Spotify Artist ID from text (supports URL, URI, or ID)
// --------------------------------------------------------------------------
function extractArtistId(text) {
    if (!text) return null;
    const cleanText = text.trim();

    // Match 1: Web URL (e.g., https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb)
    const urlMatch = cleanText.match(/artist\/([a-zA-Z0-9]{22})/);
    if (urlMatch) return urlMatch[1];

    // Match 2: Spotify URI (e.g., spotify:artist:4Z8W4fKeB5YxbusRsdQVPb)
    const uriMatch = cleanText.match(/spotify:artist:([a-zA-Z0-9]{22})/);
    if (uriMatch) return uriMatch[1];

    // Match 3: Raw 22-character alphanumeric Spotify ID
    const rawIdMatch = cleanText.match(/^[a-zA-Z0-9]{22}$/);
    if (rawIdMatch) return rawIdMatch[0];

    return null;
}

// --------------------------------------------------------------------------
// Function: Fetch artist details by their Spotify ID
// --------------------------------------------------------------------------
async function getArtistById(artistId) {
    const token = await getSpotifyToken();
    if (!token) return null;

    try {
        const response = await fetch(`${SPOTIFY_API_BASE}/artists/${artistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`// Spotify API Error: Failed fetching artist ${artistId}:`, error);
        return null;
    }
}

// --------------------------------------------------------------------------
// Function: Fetch albums and singles for a specific artist
// --------------------------------------------------------------------------
async function fetchArtistReleases(artistId, limit = 50) {
    const token = await getSpotifyToken();
    if (!token) return [];

    try {
        // Request both albums and singles
        const url = `${SPOTIFY_API_BASE}/artists/${artistId}/albums?include_groups=album,single&limit=${limit}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.items || [];
    } catch (error) {
        console.error(`// Spotify API Error: Failed fetching releases for artist ${artistId}:`, error);
        return [];
    }
}

// --------------------------------------------------------------------------
// Function: Fetch releases for ALL followed artists and combine/deduplicate
// --------------------------------------------------------------------------
async function fetchAllFollowedReleases(followedArtists) {
    if (!followedArtists || followedArtists.length === 0) {
        return [];
    }

    const token = await getSpotifyToken();
    if (!token) return [];

    let combinedReleases = [];

    // Fetch concurrently in batches of 5 to avoid Spotify rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < followedArtists.length; i += BATCH_SIZE) {
        const batch = followedArtists.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(artist => fetchArtistReleases(artist.id, 20));
        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(releases => {
            combinedReleases.push(...releases);
        });
    }

    // Deduplicate releases by album/single Spotify ID
    const uniqueMap = new Map();
    combinedReleases.forEach(item => {
        if (!uniqueMap.has(item.id)) {
            uniqueMap.set(item.id, item);
        }
    });

    const uniqueReleases = Array.from(uniqueMap.values());

    // Sort descending by release date (newest first)
    uniqueReleases.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));

    return uniqueReleases;
}

// --------------------------------------------------------------------------
// Function: Open a song/album in the user's preferred music service
// --------------------------------------------------------------------------
async function openInMusicService(spotifyUrl, artistName, albumTitle, targetPlatform = 'spotify') {
    const searchQuery = encodeURIComponent(`${artistName} ${albumTitle}`);

    // Option 1: Open in Spotify (Default)
    if (targetPlatform === 'spotify') {
        openExternalUrl(spotifyUrl);
        return;
    }

    // Option 2: Open in Apple Music (Query iTunes API for direct link, fallback to search)
    if (targetPlatform === 'apple') {
        try {
            const res = await fetch(`https://itunes.apple.com/search?term=${searchQuery}&media=music&limit=1`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                const appleUrl = data.results[0].collectionViewUrl || data.results[0].trackViewUrl;
                openExternalUrl(appleUrl);
                return;
            }
        } catch (e) {
            // If search fails, fallback to Apple Music web search
        }
        openExternalUrl(`https://music.apple.com/search?term=${searchQuery}`);
        return;
    }

    // Option 3: Open in YouTube Music
    if (targetPlatform === 'youtube') {
        openExternalUrl(`https://music.youtube.com/search?q=${searchQuery}`);
        return;
    }

    // Default fallback to Spotify
    openExternalUrl(spotifyUrl);
}

// --------------------------------------------------------------------------
// Helper: Safely open external link via Electron shell or browser window
// --------------------------------------------------------------------------
function openExternalUrl(url) {
    if (!url) return;
    try {
        // If Electron's shell is available, use it to open in default OS browser/app
        if (window.require) {
            const { shell } = window.require('electron');
            if (shell && shell.openExternal) {
                shell.openExternal(url);
                return;
            }
        }
    } catch (e) {
        // Fallback for standard web environment
    }
    window.open(url, '_blank');
}

const ENCRYPTED_CREDENTIALS_STORE = {
    salt: '8fa9af5aa9f652ae3dfd015cd56efc59',
    iv: '95f9f3db5542f80d91561f44',
    ciphertext: '7242d4d82bce0be56be67e678d7ed5b40a62ded19802d9009f7007fda64785b56c99e818d03901fa4ec7fd066770310f119ff5baea7ec854dd4097be59591ca3549717e9bcc46abccff8a11e420d5d4a7f22d488322c236726a4f9bdd1216eb5bf',
    tag: 'c36a036931fd985cf8ff295977845131'
};

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

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

    const keyMaterial = await cryptoObj.subtle.importKey(
        'raw',
        pinBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

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

    const cipherBytes = hexToBytes(ENCRYPTED_CREDENTIALS_STORE.ciphertext);
    const tagBytes = hexToBytes(ENCRYPTED_CREDENTIALS_STORE.tag);
    const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
    combined.set(cipherBytes);
    combined.set(tagBytes, cipherBytes.length);

    const decryptedBuffer = await cryptoObj.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: hexToBytes(ENCRYPTED_CREDENTIALS_STORE.iv)
        },
        key,
        combined
    );

    const decryptedJson = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decryptedJson);
}


const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

let cachedAccessToken = null;
let tokenExpiresAt = 0;

function isElectronApp() {
    return Boolean(
        (typeof window !== 'undefined' && window.process && window.process.versions && window.process.versions.electron) ||
        (typeof window !== 'undefined' && window.require) ||
        (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.toLowerCase().includes(' electron/'))
    );
}

function getActiveSpotifyCredentials() {
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

    return {
        clientId: '',
        clientSecret: '',
        isBuiltin: false,
        source: 'none'
    };
}

function hasSpotifyCredentials() {
    const creds = getActiveSpotifyCredentials();
    return Boolean(creds.clientId && creds.clientSecret);
}

function resetSpotifyTokenCache() {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
}

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
            } catch (_) { }

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

async function getSpotifyToken() {
    const creds = getActiveSpotifyCredentials();
    if (!creds.clientId || !creds.clientSecret) {
        console.warn('// Spotify API: No credentials configured.');
        if (typeof window !== 'undefined' && typeof window.openCredentialsModal === 'function') {
            window.openCredentialsModal();
        }
        return null;
    }

    const now = Date.now();
    if (cachedAccessToken && now < tokenExpiresAt - 60000) {
        return cachedAccessToken;
    }

    try {
        const basicAuth = btoa(`${creds.clientId}:${creds.clientSecret}`);

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
                if (!creds.isBuiltin && typeof window !== 'undefined' && typeof window.openCredentialsModal === 'function') {
                    window.openCredentialsModal({ errorMessage: 'Spotify rejected your stored credentials. Please update them.' });
                }
            }
            throw new Error(`Spotify Auth HTTP Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.access_token) {
            cachedAccessToken = data.access_token;
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

function extractArtistId(text) {
    if (!text) return null;
    const cleanText = text.trim();

    const urlMatch = cleanText.match(/artist\/([a-zA-Z0-9]{22})/);
    if (urlMatch) return urlMatch[1];

    const uriMatch = cleanText.match(/spotify:artist:([a-zA-Z0-9]{22})/);
    if (uriMatch) return uriMatch[1];

    const rawIdMatch = cleanText.match(/^[a-zA-Z0-9]{22}$/);
    if (rawIdMatch) return rawIdMatch[0];

    return null;
}

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

let directAlbumsBlockedUntil = 0;

async function fetchArtistReleases(artistId, limit = 50, artistName = '') {
    const token = await getSpotifyToken();
    if (!token) return [];

    if (!artistName && typeof getDatabase === 'function') {
        const db = getDatabase();
        const found = db.artists && db.artists.find(a => a.id === artistId);
        if (found) artistName = found.name;
    }

    const now = Date.now();

    if (now >= directAlbumsBlockedUntil) {
        try {
            const url = `${SPOTIFY_API_BASE}/artists/${artistId}/albums?include_groups=single,album,appears_on&limit=${Math.min(limit, 50)}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.items && data.items.length > 0) {
                    return data.items;
                }
            } else if (response.status === 429) {
                const retrySec = parseInt(response.headers.get('retry-after') || '300', 10);
                directAlbumsBlockedUntil = Date.now() + (Math.max(retrySec, 60) * 1000);
                console.warn(`// Spotify direct endpoint rate-limited (429). Using search fallback.`);
            } else if (response.status === 401) {
                resetSpotifyTokenCache();
            }
        } catch (error) {
            console.warn(`// Spotify API direct fetch error for ${artistId}:`, error);
        }
    }

    if (artistName) {
        try {
            const cleanName = artistName.replace(/["\\]/g, '').trim();
            const searchUrl = `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent('artist:"' + cleanName + '"')}&type=album&limit=10`;
            const searchRes = await fetch(searchUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (searchRes.ok) {
                const searchData = await searchRes.json();
                const items = (searchData.albums && searchData.albums.items) ? searchData.albums.items : [];
                const matching = items.filter(it => it.artists && it.artists.some(a =>
                    (artistId && a.id === artistId) ||
                    (a.name.toLowerCase() === cleanName.toLowerCase())
                ));

                if (items.length === 10 && limit > 10) {
                    try {
                        const page2Url = `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent('artist:"' + cleanName + '"')}&type=album&limit=10&offset=10`;
                        const page2Res = await fetch(page2Url, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (page2Res.ok) {
                            const page2Data = await page2Res.json();
                            const page2Items = (page2Data.albums && page2Data.albums.items) ? page2Data.albums.items : [];
                            page2Items.forEach(it => {
                                if (it.artists && it.artists.some(a => (artistId && a.id === artistId) || a.name.toLowerCase() === cleanName.toLowerCase())) {
                                    if (!matching.some(m => m.id === it.id)) {
                                        matching.push(it);
                                    }
                                }
                            });
                        }
                    } catch (_) { }
                }

                if (matching.length > 0) {
                    return matching;
                }
            } else if (searchRes.status === 401) {
                resetSpotifyTokenCache();
            }
        } catch (searchErr) {
            console.error(`// Spotify search fallback error for ${artistName}:`, searchErr);
        }
    }

    return [];
}

async function fetchAllFollowedReleases(followedArtists) {
    if (!followedArtists || followedArtists.length === 0) {
        return [];
    }

    const token = await getSpotifyToken();
    if (!token) return [];

    let combinedReleases = [];

    const BATCH_SIZE = 3;
    for (let i = 0; i < followedArtists.length; i += BATCH_SIZE) {
        const batch = followedArtists.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(artist => fetchArtistReleases(artist.id, 20, artist.name));
        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(releases => {
            combinedReleases.push(...releases);
        });

        if (i + BATCH_SIZE < followedArtists.length) {
            await new Promise(r => setTimeout(r, 60));
        }
    }

    const uniqueMap = new Map();
    combinedReleases.forEach(item => {
        if (!uniqueMap.has(item.id)) {
            uniqueMap.set(item.id, item);
        }
    });

    const uniqueReleases = Array.from(uniqueMap.values());

    uniqueReleases.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));

    return uniqueReleases;
}

async function openInMusicService(spotifyUrl, artistName, albumTitle, targetPlatform = 'spotify') {
    const searchQuery = encodeURIComponent(`${artistName} ${albumTitle}`);

    if (targetPlatform === 'spotify') {
        openExternalUrl(spotifyUrl);
        return;
    }

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
        }
        openExternalUrl(`https://music.apple.com/search?term=${searchQuery}`);
        return;
    }

    if (targetPlatform === 'youtube') {
        openExternalUrl(`https://music.youtube.com/search?q=${searchQuery}`);
        return;
    }

    openExternalUrl(spotifyUrl);
}

function openExternalUrl(url) {
    if (!url) return;
    try {
        if (window.require) {
            const { shell } = window.require('electron');
            if (shell && shell.openExternal) {
                shell.openExternal(url);
                return;
            }
        }
    } catch (e) {
    }
    window.open(url, '_blank');
}

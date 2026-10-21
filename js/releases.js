// ==========================================================================
// RELEASES PAGE CONTROLLER (index.html)
// ==========================================================================
// This script runs when opening the main Releases screen:
// 1. Checks Spotify automatically on launch for new drops from followed artists.
// 2. Detects any unacknowledged drops and shows a celebratory alert banner.
// 3. Categorizes releases into tabs (New Releases, Past Releases, Favorites).
// 4. Handles audio playback redirection, favorites starring, and live search.
// ==========================================================================

let allLoadedReleases = [];
let activeTab = 'new'; // 'new', 'past', 'list', or 'favorites'

document.addEventListener('DOMContentLoaded', async () => {
    // Bind search/filter events
    bindReleasesEvents();
    
    // Check if we need to adjust tab buttons based on view mode (Timeline vs 30-Day List)
    configureModeTabs();

    // Check for releases on app open
    await checkAndLoadReleases();
});

// --------------------------------------------------------------------------
// Function: Attach click handlers to tabs, search filter, and dismiss buttons
// --------------------------------------------------------------------------
function bindReleasesEvents() {
    // Tab switching buttons
    document.querySelectorAll('.filter-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeTab = e.currentTarget.getAttribute('data-tab');
            filterAndRenderCurrentTab();
        });
    });

    // In-page search filter for quick browsing
    const filterInput = document.getElementById('releaseFilterInput');
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            filterAndRenderCurrentTab();
        });
    }

    // Modal close button
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeArtistModal);
    }
}

// --------------------------------------------------------------------------
// Function: Adjust tab visibility according to the user's view mode setting
// --------------------------------------------------------------------------
function configureModeTabs() {
    const db = getDatabase();
    const mode = (db.settings && db.settings.mode) ? db.settings.mode : 'timeline';
    
    const tabNew = document.getElementById('tabNew');
    const tabPast = document.getElementById('tabPast');
    const tabList = document.getElementById('tabList');

    if (mode === 'timeline') {
        if (tabNew) tabNew.style.display = 'inline-block';
        if (tabPast) tabPast.style.display = 'inline-block';
        if (tabList) tabList.style.display = 'none';
        activeTab = 'new';
        if (tabNew) tabNew.classList.add('active');
    } else {
        // List mode (Last 30 Days)
        if (tabNew) tabNew.style.display = 'none';
        if (tabPast) tabPast.style.display = 'none';
        if (tabList) tabList.style.display = 'inline-block';
        activeTab = 'list';
        if (tabList) tabList.classList.add('active');
    }
}

// --------------------------------------------------------------------------
// Function: Fetch and compare releases on app launch
// --------------------------------------------------------------------------
async function checkAndLoadReleases() {
    const listContainer = document.getElementById('releasesList');
    listContainer.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--text-secondary);">Checking Spotify for new drops...</p>';

    const db = getDatabase();

    // Check if credentials are configured
    if (!hasSpotifyCredentials()) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔑</div>
                <h3>Spotify Credentials Required</h3>
                <p>To view new music drops and search artists on the web, please enter your Spotify Client ID and Client Secret.</p>
                <button class="btn btn-primary" onclick="window.openCredentialsModal && window.openCredentialsModal()">Set Up Spotify Credentials</button>
            </div>
        `;
        return;
    }

    // Check if user has added any artists yet
    if (!db.artists || db.artists.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎵</div>
                <h3>No Artists Followed Yet</h3>
                <p>Start by searching and following your favorite artists to automatically track their new releases!</p>
                <a href="search.html" class="btn btn-primary">Find Artists to Follow</a>
            </div>
        `;
        return;
    }

    try {
        // Fetch releases from Spotify for all followed artists
        allLoadedReleases = await fetchAllFollowedReleases(db.artists);

        // Save in session cache
        sessionStorage.setItem('cachedReleases', JSON.stringify(allLoadedReleases));

        // Detect brand-new drops since user last checked
        detectBrandNewReleases(allLoadedReleases);

        // Render cards
        filterAndRenderCurrentTab();
    } catch (error) {
        console.error('// Error loading releases:', error);
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <h3>Failed to Load Releases</h3>
                <p>Could not connect to Spotify. Check your internet connection or diagnostic settings.</p>
                <button class="btn btn-primary" onclick="checkAndLoadReleases()">Retry</button>
            </div>
        `;
    }
}

// --------------------------------------------------------------------------
// Function: Check for newly dropped tracks that user hasn't seen yet
// --------------------------------------------------------------------------
function detectBrandNewReleases(releases) {
    const db = getDatabase();
    const seenIds = new Set(db.seenReleaseIds || []);
    const now = new Date();
    
    // Find releases that dropped in the last 7 days AND have not been acknowledged
    const freshReleases = releases.filter(r => {
        if (seenIds.has(r.id)) return false;
        
        let releaseDateStr = r.release_date;
        if (r.release_date_precision === 'year') releaseDateStr += '-01-01';
        else if (r.release_date_precision === 'month') releaseDateStr += '-01';
        
        const relDate = new Date(releaseDateStr);
        const diffDays = (now - relDate) / (1000 * 60 * 60 * 24);
        
        // Dropped within last 7 days or upcoming in next 5 days
        return diffDays >= -5 && diffDays <= 7;
    });

    const alertBanner = document.getElementById('newReleaseAlertBanner');
    if (!alertBanner) return;

    if (freshReleases.length > 0) {
        const titleEl = document.getElementById('newReleaseAlertTitle');
        const textEl = document.getElementById('newReleaseAlertText');
        const dismissBtn = document.getElementById('dismissAlertBtn');

        if (titleEl) titleEl.textContent = `🎉 ${freshReleases.length} Brand New Release${freshReleases.length > 1 ? 's' : ''} Detected!`;
        if (textEl) {
            const previewNames = freshReleases.slice(0, 3).map(r => `"${r.name}" by ${r.artists[0].name}`).join(', ');
            textEl.textContent = `New music just dropped: ${previewNames}${freshReleases.length > 3 ? ' and more!' : '.'}`;
        }

        alertBanner.style.display = 'flex';

        if (dismissBtn) {
            dismissBtn.onclick = () => {
                // Mark these releases as seen in database
                markReleasesAsSeen(freshReleases.map(r => r.id));
                alertBanner.style.display = 'none';
                filterAndRenderCurrentTab(); // Re-render to refresh "NEW" badges
            };
        }
    } else {
        alertBanner.style.display = 'none';
    }
}

// --------------------------------------------------------------------------
// Function: Filter and render releases according to active tab and search query
// --------------------------------------------------------------------------
function filterAndRenderCurrentTab() {
    const listContainer = document.getElementById('releasesList');
    if (!listContainer) return;

    const db = getDatabase();
    const filterInput = document.getElementById('releaseFilterInput');
    const query = filterInput ? filterInput.value.toLowerCase().trim() : '';

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let filtered = allLoadedReleases.filter(rel => {
        let releaseDateStr = rel.release_date;
        if (rel.release_date_precision === 'year') releaseDateStr += '-01-01';
        else if (rel.release_date_precision === 'month') releaseDateStr += '-01';

        const releaseDate = new Date(releaseDateStr);
        const ageInDays = (today - releaseDate) / (1000 * 60 * 60 * 24);

        // Tab: New Releases (dropped in last 7 days or upcoming)
        if (activeTab === 'new') {
            return ageInDays >= -5 && ageInDays <= 7;
        }

        // Tab: Past Releases (older than 7 days, up to 45 days)
        if (activeTab === 'past') {
            return ageInDays > 7 && ageInDays <= 45;
        }

        // Tab: List (all releases in the last 30 days)
        if (activeTab === 'list') {
            return ageInDays >= -5 && ageInDays <= 30;
        }

        // Tab: Favorites (only starred tracks)
        if (activeTab === 'favorites') {
            return db.favorites.includes(rel.id);
        }

        return true;
    });

    // Apply live search text filter
    if (query) {
        filtered = filtered.filter(rel => {
            const matchesName = rel.name.toLowerCase().includes(query);
            const matchesArtist = rel.artists.some(a => a.name.toLowerCase().includes(query));
            return matchesName || matchesArtist;
        });
    }

    // Render cards
    renderReleaseCards(filtered, listContainer);
}

// --------------------------------------------------------------------------
// Function: Render list of release cards to the DOM
// --------------------------------------------------------------------------
function renderReleaseCards(releases, container) {
    container.innerHTML = '';

    if (releases.length === 0) {
        let msg = 'No releases found for this category.';
        if (activeTab === 'favorites') msg = 'You haven\'t favorited any releases yet. Star any release to save it here!';
        if (activeTab === 'new') msg = 'No new releases from your followed artists in the last 7 days.';
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎧</div>
                <h3>Nothing to show here</h3>
                <p>${msg}</p>
            </div>
        `;
        return;
    }

    const db = getDatabase();
    const seenIds = new Set(db.seenReleaseIds || []);
    const preferredPlatform = (db.settings && db.settings.platform) ? db.settings.platform : 'spotify';

    releases.forEach(rel => {
        const coverImg = (rel.images && rel.images.length > 0) ? rel.images[0].url : 'icon.png';
        const artistNames = rel.artists.map(a => a.name).join(', ');
        const primaryArtist = rel.artists[0].name;
        const isFav = db.favorites.includes(rel.id);
        const isBrandNew = !seenIds.has(rel.id);

        const card = document.createElement('div');
        card.className = 'release-card';

        card.innerHTML = `
            <div class="release-main">
                <img src="${coverImg}" alt="${rel.name}" class="album-cover" loading="lazy">
                <div class="release-details">
                    <div class="release-title-row">
                        <span class="release-title">${escapeHtml(rel.name)}</span>
                        ${isBrandNew ? '<span class="badge-new">NEW</span>' : ''}
                        <span class="release-type-badge">${rel.album_type || 'single'}</span>
                    </div>
                    <div class="release-artists">${escapeHtml(artistNames)}</div>
                    <div class="release-date">Released: ${rel.release_date}</div>
                </div>
            </div>
            <div class="release-actions">
                <button class="fav-btn ${isFav ? 'is-favorite' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                    ${isFav ? '★' : '☆'}
                </button>
                <button class="listen-btn" title="Open in ${preferredPlatform}">
                    ▶ Play
                </button>
            </div>
        `;

        // Click card to open in preferred music service
        card.querySelector('.release-main').addEventListener('click', () => {
            openInMusicService(rel.external_urls.spotify, primaryArtist, rel.name, preferredPlatform);
        });

        // Click play button
        card.querySelector('.listen-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openInMusicService(rel.external_urls.spotify, primaryArtist, rel.name, preferredPlatform);
        });

        // Click favorite star button
        card.querySelector('.fav-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const nowFav = toggleFavoriteRelease(rel.id);
            showToast(nowFav ? `Added "${rel.name}" to Favorites!` : `Removed "${rel.name}" from Favorites.`);
            filterAndRenderCurrentTab();
        });

        container.appendChild(card);
    });
}

// --------------------------------------------------------------------------
// Helper: Sanitize HTML text to prevent XSS injection
// --------------------------------------------------------------------------
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

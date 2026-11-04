let allLoadedReleases = [];
let activeTab = 'new';

document.addEventListener('DOMContentLoaded', async () => {
    bindReleasesEvents();
    configureModeTabs();
    await checkAndLoadReleases();
});

function bindReleasesEvents() {
    document.querySelectorAll('.filter-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeTab = e.currentTarget.getAttribute('data-tab');
            filterAndRenderCurrentTab();
        });
    });

    const filterInput = document.getElementById('releaseFilterInput');
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            filterAndRenderCurrentTab();
        });
    }

    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeArtistModal);
    }
}

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
        if (tabNew) tabNew.style.display = 'none';
        if (tabPast) tabPast.style.display = 'none';
        if (tabList) tabList.style.display = 'inline-block';
        activeTab = 'list';
        if (tabList) tabList.classList.add('active');
    }
}

async function checkAndLoadReleases(forceRefresh = false) {
    const listContainer = document.getElementById('releasesList');
    const db = getDatabase();

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

    // Try rendering immediately from cached releases first for fast UI responsiveness
    const cachedStr = sessionStorage.getItem('cachedReleases');
    if (cachedStr && !forceRefresh) {
        try {
            const cached = JSON.parse(cachedStr);
            if (Array.isArray(cached) && cached.length > 0) {
                allLoadedReleases = cached;
                autoFavoriteFromFavoritedArtists(allLoadedReleases);
                detectBrandNewReleases(allLoadedReleases);
                filterAndRenderCurrentTab();
            }
        } catch (_) { }
    }

    if (!allLoadedReleases || allLoadedReleases.length === 0) {
        listContainer.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--text-secondary);">Checking Spotify for new drops...</p>';
    }

    try {
        allLoadedReleases = await fetchAllFollowedReleases(db.artists);

        sessionStorage.setItem('cachedReleases', JSON.stringify(allLoadedReleases));

        autoFavoriteFromFavoritedArtists(allLoadedReleases);

        detectBrandNewReleases(allLoadedReleases);

        filterAndRenderCurrentTab();
    } catch (error) {
        if (!allLoadedReleases || allLoadedReleases.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h3>Failed to Load Releases</h3>
                    <p>Could not connect to Spotify. Check your internet connection or diagnostic settings.</p>
                    <button class="btn btn-primary" onclick="checkAndLoadReleases(true)">Retry</button>
                </div>
            `;
        }
    }
}

function autoFavoriteFromFavoritedArtists(releases) {
    const db = getDatabase();
    const favArtistIds = db.favoriteArtists || [];
    if (favArtistIds.length === 0) return;

    let updated = false;
    releases.forEach(rel => {
        if (rel.artists && rel.artists.some(a => favArtistIds.includes(a.id))) {
            if (!db.favorites.includes(rel.id)) {
                db.favorites.push(rel.id);
                updated = true;
            }
        }
    });

    if (updated) {
        saveDatabase(db);
    }
}

function detectBrandNewReleases(releases) {
    const db = getDatabase();
    const seenIds = new Set(db.seenReleaseIds || []);

    const freshReleases = releases.filter(r => {
        if (seenIds.has(r.id)) return false;
        const diffDays = (typeof getReleaseAgeInDays === 'function')
            ? getReleaseAgeInDays(r.release_date, r.release_date_precision)
            : 0;

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

        const dismissAlert = (e) => {
            if (e) e.stopPropagation();
            markReleasesAsSeen(freshReleases.map(r => r.id));
            alertBanner.style.display = 'none';
            filterAndRenderCurrentTab();
        };

        alertBanner.onclick = dismissAlert;

        if (dismissBtn) {
            dismissBtn.onclick = dismissAlert;
        }
    } else {
        alertBanner.style.display = 'none';
    }
}

function filterAndRenderCurrentTab() {
    const listContainer = document.getElementById('releasesList');
    if (!listContainer) return;

    const db = getDatabase();
    const filterInput = document.getElementById('releaseFilterInput');
    const query = filterInput ? filterInput.value.toLowerCase().trim() : '';

    let filtered = allLoadedReleases.filter(rel => {
        const ageInDays = (typeof getReleaseAgeInDays === 'function')
            ? getReleaseAgeInDays(rel.release_date, rel.release_date_precision)
            : 0;

        if (activeTab === 'new') {
            return ageInDays >= -5 && ageInDays <= 7;
        }

        if (activeTab === 'past') {
            return ageInDays > 7 && ageInDays <= 45;
        }

        if (activeTab === 'list') {
            return ageInDays >= -5 && ageInDays <= 30;
        }

        if (activeTab === 'favorites') {
            return isReleaseFavorited(rel);
        }

        return true;
    });

    if (query) {
        filtered = filtered.filter(rel => {
            const matchesName = rel.name.toLowerCase().includes(query);
            const matchesArtist = rel.artists.some(a => a.name.toLowerCase().includes(query));
            return matchesName || matchesArtist;
        });
    }

    renderReleaseCards(filtered, listContainer);
}

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

    if (activeTab === 'new' || activeTab === 'list') {
        const unseen = releases.filter(r => !seenIds.has(r.id));
        const seen = releases.filter(r => seenIds.has(r.id));

        if (unseen.length > 0) {
            unseen.forEach(rel => {
                container.appendChild(buildReleaseCard(rel, db, seenIds, preferredPlatform));
            });

            if (seen.length > 0) {
                const divider = document.createElement('div');
                divider.className = 'releases-divider';
                divider.innerHTML = '<span class="releases-divider-label">Past 7 Days </span>';
                container.appendChild(divider);
            }
        }

        seen.forEach(rel => {
            container.appendChild(buildReleaseCard(rel, db, seenIds, preferredPlatform));
        });
    } else {
        releases.forEach(rel => {
            container.appendChild(buildReleaseCard(rel, db, seenIds, preferredPlatform));
        });
    }
}

function buildReleaseCard(rel, db, seenIds, preferredPlatform) {
    const coverImg = (rel.images && rel.images.length > 0) ? rel.images[0].url : 'icon.png';
    const artistNames = rel.artists.map(a => a.name).join(', ');
    const primaryArtistObj = (rel.artists && rel.artists.length > 0) ? rel.artists[0] : { name: 'Unknown', id: '' };
    const primaryArtist = primaryArtistObj.name || 'Unknown';
    const isFav = isReleaseFavorited(rel);
    const isBrandNew = !seenIds.has(rel.id);

    // Look up artist avatar photo from followed artists list
    let artistAvatar = '';
    if (db && Array.isArray(db.artists)) {
        const found = db.artists.find(a =>
            (primaryArtistObj.id && a.id === primaryArtistObj.id) ||
            (a.name && a.name.toLowerCase() === primaryArtist.toLowerCase())
        );
        if (found && found.image) {
            artistAvatar = found.image;
        }
    }
    if (!artistAvatar) {
        artistAvatar = (rel.images && rel.images.length > 0) ? rel.images[rel.images.length - 1].url : coverImg;
    }

    const card = document.createElement('div');
    card.className = 'release-card';

    let redNewBubble = '';
    if (isBrandNew) {
        redNewBubble = `
            <span class="badge-new" title="New release — click to mark as seen">NEW</span>
        `;
    }

    card.innerHTML = `
        <div class="release-main">
            <img src="${coverImg}" alt="${rel.name}" class="album-cover" loading="lazy">
            <div class="release-details">
                <div class="release-title-row">
                    <span class="release-title">${escapeHtml(rel.name)}</span>
                    ${redNewBubble}
                    <span class="release-type-badge">${rel.album_type || 'single'}</span>
                </div>
                <div class="release-artists">${escapeHtml(artistNames)}</div>
                <div class="release-date">Released: ${typeof formatReleaseDate === 'function' ? formatReleaseDate(rel.release_date) : rel.release_date}</div>
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

    if (isBrandNew) {
        const badgeEl = card.querySelector('.badge-new');
        if (badgeEl) {
            badgeEl.addEventListener('click', (e) => {
                e.stopPropagation();
                markReleaseAsSeen(rel.id);
                filterAndRenderCurrentTab();
            });
        }
    }

    card.querySelector('.release-main').addEventListener('click', () => {
        if (isBrandNew) markReleaseAsSeen(rel.id);
        openInMusicService(rel.external_urls.spotify, primaryArtist, rel.name, preferredPlatform);
    });

    card.querySelector('.listen-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (isBrandNew) markReleaseAsSeen(rel.id);
        openInMusicService(rel.external_urls.spotify, primaryArtist, rel.name, preferredPlatform);
    });

    card.querySelector('.fav-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const nowFav = toggleFavoriteRelease(rel.id);
        showToast(nowFav ? `Added "${rel.name}" to Favorites!` : `Removed "${rel.name}" from Favorites.`);
        filterAndRenderCurrentTab();
    });

    return card;
}

function renderAllReleasesFromCache(releases) {
    allLoadedReleases = releases;
    autoFavoriteFromFavoritedArtists(allLoadedReleases);
    detectBrandNewReleases(allLoadedReleases);
    filterAndRenderCurrentTab();
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

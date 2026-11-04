let allFollowedArtists = [];

document.addEventListener('DOMContentLoaded', () => {
    loadFollowedArtists();

    const filterInput = document.getElementById('followingFilterInput');
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            filterAndRenderArtists();
        });
    }

    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeArtistModal);
    }
});

function loadFollowedArtists() {
    const db = getDatabase();
    allFollowedArtists = db.artists || [];

    const countEl = document.getElementById('followingTotalCount');
    if (countEl) {
        countEl.textContent = `${allFollowedArtists.length} Artist${allFollowedArtists.length === 1 ? '' : 's'}`;
    }

    filterAndRenderArtists();
}

function filterAndRenderArtists() {
    const container = document.getElementById('followingGrid');
    if (!container) return;

    const filterInput = document.getElementById('followingFilterInput');
    const query = filterInput ? filterInput.value.toLowerCase().trim() : '';

    let filtered = allFollowedArtists;
    if (query) {
        filtered = filtered.filter(a => a.name.toLowerCase().includes(query));
    }

    renderArtistGrid(filtered, container);
}

function renderArtistGrid(artists, container) {
    container.innerHTML = '';

    if (!artists || artists.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">👥</div>
                <h3>No Artists to Display</h3>
                <p>You aren't following any artists matching this query. Search for artists and follow them to track their new music!</p>
                <a href="search.html" class="btn btn-primary">Find Artists to Follow</a>
            </div>
        `;
        return;
    }

    const sorted = [...artists].sort((a, b) => {
        const aPinned = isArtistPinned(a.id);
        const bPinned = isArtistPinned(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        const aFav = isArtistFavorited(a.id);
        const bFav = isArtistFavorited(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;

        return a.name.localeCompare(b.name);
    });

    sorted.forEach(artist => {
        const avatarUrl = artist.image || 'icon.png';
        const pinned = isArtistPinned(artist.id);
        const favorited = isArtistFavorited(artist.id);

        const card = document.createElement('div');
        card.className = 'artist-card';

        card.innerHTML = `
            ${pinned ? '<div class="pinned-badge">📌 Pinned</div>' : ''}
            ${favorited ? '<div class="fav-artist-badge">★</div>' : ''}
            <img src="${avatarUrl}" alt="${artist.name}" class="artist-avatar" loading="lazy">
            <div class="artist-name" title="${artist.name}">${escapeHtml(artist.name)}</div>
            <div class="artist-genre">Click to view releases</div>
            <div class="artist-card-actions">
                <button class="artist-action-btn pin-btn ${pinned ? 'is-pinned' : ''}" title="${pinned ? 'Unpin from top' : 'Pin to top'}">
                    📌
                </button>
                <button class="artist-action-btn fav-artist-btn ${favorited ? 'is-favorite' : ''}" title="${favorited ? 'Remove from favorites' : 'Favorite (auto-star releases)'}">
                    ${favorited ? '★' : '☆'}
                </button>
                <button class="btn btn-danger btn-sm" style="flex: 1; border-radius: 9999px;">
                    Remove
                </button>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.artist-card-actions')) return;
            openArtistDiscographyModal(artist.id, artist.name);
        });

        const pinBtn = card.querySelector('.pin-btn');
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowPinned = togglePinArtist(artist.id);
            showToast(nowPinned ? `Pinned ${artist.name} to top` : `Unpinned ${artist.name}`);
            filterAndRenderArtists();
        });

        const favBtn = card.querySelector('.fav-artist-btn');
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowFav = toggleFavoriteArtist(artist.id);
            if (nowFav) {
                try {
                    const cachedStr = sessionStorage.getItem('cachedReleases');
                    if (cachedStr) {
                        const cached = JSON.parse(cachedStr);
                        const db = getDatabase();
                        let updated = false;
                        cached.forEach(rel => {
                            if (rel.artists && rel.artists.some(a => a.id === artist.id)) {
                                if (!db.favorites.includes(rel.id)) {
                                    db.favorites.push(rel.id);
                                    updated = true;
                                }
                            }
                        });
                        if (updated) saveDatabase(db);
                    }
                } catch (_) {}
            }
            showToast(nowFav ? `★ ${artist.name} favorited — releases will automatically be favorited!` : `Removed ${artist.name} from favorites`);
            filterAndRenderArtists();
        });

        const removeBtn = card.querySelector('.btn-danger');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Stop tracking releases from ${artist.name}?`)) {
                unfollowArtist(artist.id);
                showToast(`Removed ${artist.name}`);
                loadFollowedArtists();
                updateNavFollowingBadge();
            }
        });

        container.appendChild(card);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

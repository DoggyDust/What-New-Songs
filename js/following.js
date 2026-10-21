// ==========================================================================
// FOLLOWING SCREEN CONTROLLER (following.html)
// ==========================================================================
// This script powers the Following artists screen:
// 1. Lists all artists stored in the user's database.
// 2. Provides quick filtering to find specific artists.
// 3. Allows 1-click removal/unfollow with instant UI update.
// 4. Clicking an artist opens a modal displaying their 5 most recent releases.
// ==========================================================================

let allFollowedArtists = [];

document.addEventListener('DOMContentLoaded', () => {
    loadFollowedArtists();

    // Bind filter input
    const filterInput = document.getElementById('followingFilterInput');
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            filterAndRenderArtists();
        });
    }

    // Modal close button
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeArtistModal);
    }
});

// --------------------------------------------------------------------------
// Function: Load artists from database and render
// --------------------------------------------------------------------------
function loadFollowedArtists() {
    const db = getDatabase();
    allFollowedArtists = db.artists || [];

    // Update count in header
    const countEl = document.getElementById('followingTotalCount');
    if (countEl) {
        countEl.textContent = `${allFollowedArtists.length} Artist${allFollowedArtists.length === 1 ? '' : 's'}`;
    }

    filterAndRenderArtists();
}

// --------------------------------------------------------------------------
// Function: Filter artists list based on search box input
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// Function: Render artist cards into grid
// --------------------------------------------------------------------------
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

    artists.forEach(artist => {
        const avatarUrl = artist.image || 'icon.png';

        const card = document.createElement('div');
        card.className = 'artist-card';

        card.innerHTML = `
            <img src="${avatarUrl}" alt="${artist.name}" class="artist-avatar" loading="lazy">
            <div class="artist-name" title="${artist.name}">${escapeHtml(artist.name)}</div>
            <div class="artist-genre">Click to view releases</div>
            <button class="btn btn-danger btn-sm" style="margin-top: 10px; width: 100%; border-radius: 9999px;">
                Remove
            </button>
        `;

        // Click card to view releases
        card.addEventListener('click', () => {
            openArtistDiscographyModal(artist.id, artist.name);
        });

        // Click remove button
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

// --------------------------------------------------------------------------
// Helper: Sanitize HTML text
// --------------------------------------------------------------------------
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

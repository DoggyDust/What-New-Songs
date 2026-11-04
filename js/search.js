document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('artistSearchInput');

    if (searchBtn) {
        searchBtn.addEventListener('click', executeSearch);
    }

    // Trigger search when pressing Enter in input field
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') executeSearch();
        });
        searchInput.focus();
    }
});

async function executeSearch() {
    const input = document.getElementById('artistSearchInput');
    const resultsContainer = document.getElementById('searchResultsGrid');
    const query = input ? input.value.trim() : '';

    if (!query) {
        showToast('Please type an artist name or paste a Spotify link.', 'error');
        return;
    }

    if (!hasSpotifyCredentials()) {
        showToast('Spotify credentials required to search. Please enter your Client ID & Secret.', 'error');
        if (typeof openCredentialsModal === 'function') openCredentialsModal();
        return;
    }

    resultsContainer.innerHTML = '<div class="spinner"></div>';

    const directId = extractArtistId(query);

    if (directId) {
        try {
            const artist = await getArtistById(directId);
            if (artist && artist.id) {
                renderArtistResults([artist], resultsContainer);
                return;
            }
        } catch (error) {
            console.error('// Direct ID fetch error:', error);
        }
    }

    try {
        const artists = await searchSpotifyArtists(query);
        renderArtistResults(artists, resultsContainer);
    } catch (error) {
        console.error('// Search error:', error);
        resultsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">⚠️</div>
                <h3>Search Failed</h3>
                <p>Could not search Spotify at this moment. Check your internet connection.</p>
            </div>
        `;
    }
}

function renderArtistResults(artists, container) {
    container.innerHTML = '';

    if (!artists || artists.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-state-icon">🔍</div>
                <h3>No Artists Found</h3>
                <p>We couldn't find any artists matching that search. Try double-checking the spelling or paste a direct Spotify link.</p>
            </div>
        `;
        return;
    }

    artists.forEach(artist => {
        const avatarUrl = (artist.images && artist.images.length > 0) ? artist.images[0].url : 'icon.png';
        const isFollowed = isArtistFollowed(artist.id);
        const genres = (artist.genres && artist.genres.length > 0) ? artist.genres.slice(0, 2).join(', ') : 'Artist';

        const card = document.createElement('div');
        card.className = 'artist-card';

        card.innerHTML = `
            <img src="${avatarUrl}" alt="${artist.name}" class="artist-avatar" loading="lazy">
            <div class="artist-name" title="${artist.name}">${escapeHtml(artist.name)}</div>
            <div class="artist-genre">${escapeHtml(genres)}</div>
            <button class="follow-toggle-btn ${isFollowed ? 'is-following' : ''}" data-id="${artist.id}">
                ${isFollowed ? '✓ Following' : '+ Follow'}
            </button>
        `;

        const btn = card.querySelector('.follow-toggle-btn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleFollowToggle(artist, avatarUrl, btn);
        });

        card.addEventListener('click', () => {
            openArtistDiscographyModal(artist.id, artist.name);
        });

        container.appendChild(card);
    });
}

function handleFollowToggle(artist, avatarUrl, btn) {
    const isCurrentlyFollowed = isArtistFollowed(artist.id);

    if (isCurrentlyFollowed) {
        unfollowArtist(artist.id);
        btn.classList.remove('is-following');
        btn.textContent = '+ Follow';
        showToast(`Unfollowed ${artist.name}`);
    } else {
        followArtist({
            id: artist.id,
            name: artist.name,
            image: avatarUrl
        });
        btn.classList.add('is-following');
        btn.textContent = '✓ Following';
        showToast(`Now following ${artist.name}!`);
    }

    updateNavFollowingBadge();
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

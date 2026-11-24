document.addEventListener('DOMContentLoaded', () => {
    if (typeof initSessionTimestamps === 'function') {
        initSessionTimestamps();
    }
    applyThemeFromSettings();
    highlightActiveNav();
    updateNavFollowingBadge();

    const syncBtn = document.getElementById('navSyncBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', handleGlobalSync);
    }

    injectCredentialsModal();

    if (!hasSpotifyCredentials()) {
        setTimeout(() => {
            openCredentialsModal({ isInitialPrompt: true });
        }, 350);
    }

    initAutoUpdateChecker();
    initStandaloneAppNavigation();
});

function initStandaloneAppNavigation() {
    if (typeof window === 'undefined') return;
    const isStandalone = ('standalone' in window.navigator && window.navigator.standalone) ||
                         (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
    if (!isStandalone) return;

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || link.target === '_blank' || link.hasAttribute('download')) return;

        if (link.hostname === window.location.hostname || !href.includes('://')) {
            e.preventDefault();
            window.location.href = link.href;
        }
    }, false);
}

function initAutoUpdateChecker() {
    if (typeof window === 'undefined' || !window.fetch) return;
    if (typeof isElectronApp === 'function' && isElectronApp()) return;

    let initialVersion = null;

    async function checkForUpdates() {
        try {
            const pathPrefix = window.location.pathname.includes('/html/') ? '../' : './';
            const versionUrl = `${pathPrefix}version.json?_t=${Date.now()}`;
            const res = await fetch(versionUrl, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            if (!res.ok) return;
            const data = await res.json();
            const serverVersion = String(data.version || data.updatedAt || '');
            if (!serverVersion) return;

            if (initialVersion === null) {
                initialVersion = serverVersion;
                sessionStorage.setItem('app_active_version', serverVersion);
                return;
            }

            if (serverVersion !== initialVersion) {
                initialVersion = serverVersion;
                sessionStorage.setItem('app_active_version', serverVersion);
                showToast('Website updated! Refreshing...', 'info');
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        } catch (e) {
        }
    }

    const savedVer = sessionStorage.getItem('app_active_version');
    if (savedVer) {
        initialVersion = savedVer;
    }

    checkForUpdates();
    setInterval(checkForUpdates, 30000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkForUpdates();
        }
    });
    window.addEventListener('focus', checkForUpdates);
}

function applyThemeFromSettings() {
    const db = getDatabase();
    const settings = db.settings || {};
    const root = document.documentElement;

    root.style.removeProperty('--bg-main');
    root.style.removeProperty('--bg-card');
    root.style.removeProperty('--bg-surface');
    root.style.removeProperty('--text-primary');

    if (settings.theme === 'light') {
        document.body.classList.add('light-mode');
    } else if (settings.theme === 'custom') {
        document.body.classList.remove('light-mode');
        if (settings.bgColor) {
            root.style.setProperty('--bg-main', settings.bgColor);
            root.style.setProperty('--bg-surface', 'rgba(0, 0, 0, 0.35)');
            root.style.setProperty('--bg-card', 'rgba(0, 0, 0, 0.25)');
            root.style.setProperty('--text-primary', '#FFFFFF');
        }
    } else {
        document.body.classList.remove('light-mode');
    }

    const activeColor = settings.color || '#4169E1';
    root.style.setProperty('--primary-color', activeColor);
    root.style.setProperty('--primary-hover', calculateHoverColor(activeColor));
    root.style.setProperty('--accent-glow', hexToRgba(activeColor, 0.3));
}

function calculateHoverColor(hex) {
    if (!hex || hex.length < 6) return '#6787e7';
    const cleanHex = hex.replace('#', '');
    let r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    let g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    let b = parseInt(cleanHex.substring(4, 6), 16) || 0;

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness > 210) {
        r = Math.max(0, Math.round(r * 0.85));
        g = Math.max(0, Math.round(g * 0.85));
        b = Math.max(0, Math.round(b * 0.85));
    } else {
        r = Math.min(255, Math.round(r + (255 - r) * 0.20));
        g = Math.min(255, Math.round(g + (255 - g) * 0.20));
        b = Math.min(255, Math.round(b + (255 - b) * 0.20));
    }

    const rHex = r.toString(16).padStart(2, '0');
    const gHex = g.toString(16).padStart(2, '0');
    const bHex = b.toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}`;
}

function hexToRgba(hex, alpha = 0.3) {
    if (!hex || hex.length < 6) return `rgba(65, 105, 225, ${alpha})`;
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 65;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 225;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function highlightActiveNav() {
    const currentPath = window.location.pathname;
    const pageName = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';

    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-item');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === pageName || (pageName === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function updateNavFollowingBadge() {
    const db = getDatabase();
    const count = db.artists ? db.artists.length : 0;
    const badges = document.querySelectorAll('#navFollowingCount, .nav-badge, .mobile-nav-badge');
    badges.forEach(badge => {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    });
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '✅' : '⚠️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

async function handleGlobalSync() {
    const syncIcon = document.getElementById('navSyncIcon');
    if (syncIcon) syncIcon.classList.add('spinning');

    if (!hasSpotifyCredentials()) {
        showToast('Spotify credentials required. Please enter your Client ID & Secret.', 'error');
        if (typeof openCredentialsModal === 'function') openCredentialsModal();
        if (syncIcon) syncIcon.classList.remove('spinning');
        return;
    }

    showToast('Checking Spotify for new releases...', 'success');

    try {
        const db = getDatabase();
        if (db.artists.length === 0) {
            showToast('No artists followed yet. Search and follow artists first!', 'error');
            if (syncIcon) syncIcon.classList.remove('spinning');
            return;
        }

        const releases = await fetchAllFollowedReleases(db.artists);

        localStorage.setItem('cachedReleases', JSON.stringify(releases));

        if (typeof detectBrandNewReleases === 'function') {
            detectBrandNewReleases(releases);
        }

        if (typeof renderAllReleasesFromCache === 'function') {
            renderAllReleasesFromCache(releases);
        }

        const seenIds = new Set(db.seenReleaseIds || []);
        const fresh = releases.filter(r => {
            if (seenIds.has(r.id)) return false;
            const diffDays = (typeof getReleaseAgeInDays === 'function')
                ? getReleaseAgeInDays(r.release_date, r.release_date_precision)
                : 0;
            return diffDays >= -5 && diffDays <= 7;
        });

        if (fresh.length > 0) {
            showToast(`Found ${fresh.length} new release${fresh.length === 1 ? '' : 's'}!`, 'success');
        } else {
            showToast('All caught up! No new releases found.', 'success');
        }
    } catch (error) {
        showToast('Failed to sync with Spotify.', 'error');
    } finally {
        if (syncIcon) syncIcon.classList.remove('spinning');
    }
}

async function openArtistDiscographyModal(artistId, artistName) {
    if (!hasSpotifyCredentials()) {
        showToast('Please enter your Spotify API credentials first.', 'error');
        if (typeof openCredentialsModal === 'function') openCredentialsModal();
        return;
    }

    const modal = document.getElementById('artistModal');
    if (!modal) return;

    const modalTitle = document.getElementById('modalArtistName');
    const modalList = document.getElementById('modalReleasesList');

    if (modalTitle) modalTitle.textContent = `${artistName} — Recent Releases`;
    if (modalList) modalList.innerHTML = '<div class="spinner"></div>';

    modal.classList.add('active');

    try {
        const items = await fetchArtistReleases(artistId, 20, artistName);

        if (!items || items.length === 0) {
            modalList.innerHTML = '<p class="empty-state">No releases found for this artist.</p>';
            return;
        }

        const sorted = items.sort((a, b) => new Date(b.release_date) - new Date(a.release_date)).slice(0, 10);

        modalList.innerHTML = '';
        const db = getDatabase();
        const preferredPlatform = db.settings ? db.settings.platform : 'spotify';

        sorted.forEach(rel => {
            const cover = (rel.images && rel.images.length > 0) ? rel.images[0].url : 'icon.png';
            const row = document.createElement('div');
            row.className = 'release-card';
            row.style.marginBottom = '10px';

            const displayDate = typeof formatReleaseDate === 'function' ? formatReleaseDate(rel.release_date) : rel.release_date;

            row.innerHTML = `
                <div class="release-main">
                    <img src="${cover}" class="album-cover" style="width: 52px; height: 52px;" loading="lazy">
                    <div class="release-details">
                        <div class="release-title">${escapeHtml(rel.name)}</div>
                        <div class="release-date">Released: ${displayDate}</div>
                    </div>
                </div>
                <button class="listen-btn">▶ Listen</button>
            `;

            row.addEventListener('click', () => {
                openInMusicService(rel.external_urls.spotify, artistName, rel.name, preferredPlatform);
            });

            modalList.appendChild(row);
        });
    } catch (e) {
        modalList.innerHTML = '<p class="empty-state">Error loading artist releases.</p>';
    }
}

function closeArtistModal() {
    const modal = document.getElementById('artistModal');
    if (modal) modal.classList.remove('active');
}

function injectCredentialsModal() {
    if (document.getElementById('credentialsModal')) return;

    const modal = document.createElement('div');
    modal.id = 'credentialsModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box credentials-modal-box">
            <div class="modal-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">🟢</span>
                    <h3 class="modal-title">Spotify API Credentials</h3>
                </div>
            </div>

            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">
                Enter your Spotify Developer credentials to connect to the Spotify Web API. You can change your Client ID and Secret in Settings if required.
            </p>

            <form id="credentialsModalForm" onsubmit="return false;" style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <label for="credModalClientId" style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">
                        Spotify Client ID
                    </label>
                    <input
                        type="text"
                        id="credModalClientId"
                        class="input-field"
                        placeholder="Paste Spotify Client ID"
                        autocomplete="off"
                        spellcheck="false"
                        style="border-radius: var(--radius-md);"
                    >
                </div>

                <div>
                    <label for="credModalClientSecret" style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">
                        Spotify Client Secret
                    </label>
                    <div style="display: flex; gap: 8px;">
                        <input
                            type="password"
                            id="credModalClientSecret"
                            class="input-field"
                            placeholder="Paste Spotify Client Secret"
                            autocomplete="off"
                            spellcheck="false"
                            style="border-radius: var(--radius-md);"
                        >
                        <button type="button" id="credModalToggleSecretBtn" class="btn btn-secondary btn-sm" title="Show / Hide Secret" style="flex-shrink: 0; padding: 0 12px;">
                            👁️
                        </button>
                    </div>
                </div>

                <div id="credModalFeedback" style="display: none; font-size: 13px; padding: 8px 12px; border-radius: var(--radius-sm); line-height: 1.4;"></div>

                <div style="display: flex; gap: 10px; margin-top: 4px;">
                    <button type="submit" id="credModalSaveBtn" class="btn btn-primary" style="flex: 1;">
                        Save & Connect
                    </button>
                </div>

                <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; text-align: center;">
                    You can change these later if required
                </p>
            </form>

            <details class="credentials-guide" style="margin-top: 14px; font-size: 12px; color: var(--text-secondary); border-top: 1px solid var(--border-subtle); padding-top: 12px;">
                <summary style="cursor: pointer; font-weight: 600; color: var(--text-primary); user-select: none;">
                    ❓ How to get a free Spotify Client ID & Secret (1 min)
                </summary>
                <ol style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                    <li>Open the <a href="https://developer.spotify.com/dashboard" target="_blank" style="color: var(--primary-color); font-weight: 600;">Spotify Developer Dashboard</a> and log in.</li>
                    <li>Click <strong>Create App</strong>. Enter an App name (e.g. <em>What New Songs</em>) and Redirect URI: <code>http://127.0.0.1:8888/callback</code>.</li>
                    <li>Check <strong>Web API</strong> and click Save.</li>
                    <li>In Basic Information, click <strong>View client secret</strong> and copy the Client ID and Secret here.</li>
                </ol>
            </details>
        </div>
    `;

    document.body.appendChild(modal);

    const toggleSecretBtn = document.getElementById('credModalToggleSecretBtn');
    const credForm = document.getElementById('credentialsModalForm');

    if (toggleSecretBtn) {
        toggleSecretBtn.addEventListener('click', () => {
            const secretInput = document.getElementById('credModalClientSecret');
            if (!secretInput) return;
            const isPassword = secretInput.type === 'password';
            secretInput.type = isPassword ? 'text' : 'password';
            toggleSecretBtn.textContent = isPassword ? '🙈' : '👁️';
        });
    }

    if (credForm) {
        credForm.addEventListener('submit', handleCredentialsModalSubmit);
    }
}

function openCredentialsModal(options = {}) {
    injectCredentialsModal();

    const modal = document.getElementById('credentialsModal');
    if (!modal) return;

    const feedback = document.getElementById('credModalFeedback');
    if (feedback) {
        feedback.style.display = 'none';
        feedback.textContent = '';
    }

    const saved = typeof getSavedCredentials === 'function' ? getSavedCredentials() : { clientId: '', clientSecret: '' };
    const clientIdInput = document.getElementById('credModalClientId');
    const clientSecretInput = document.getElementById('credModalClientSecret');
    if (clientIdInput) clientIdInput.value = saved.clientId || '';
    if (clientSecretInput) clientSecretInput.value = saved.clientSecret || '';

    modal.classList.add('active');

    if (clientIdInput) {
        clientIdInput.focus();
    }
}

function closeCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    if (modal) modal.classList.remove('active');
}

async function handleCredentialsModalSubmit(e) {
    if (e) e.preventDefault();

    const clientIdInput = document.getElementById('credModalClientId');
    const clientSecretInput = document.getElementById('credModalClientSecret');
    const saveBtn = document.getElementById('credModalSaveBtn');
    const feedback = document.getElementById('credModalFeedback');

    const clientId = clientIdInput ? clientIdInput.value.trim() : '';
    const clientSecret = clientSecretInput ? clientSecretInput.value.trim() : '';

    function showFeedback(msg, isError = true) {
        if (!feedback) return;
        feedback.style.display = 'block';
        if (isError) {
            feedback.style.backgroundColor = 'rgba(226, 33, 52, 0.15)';
            feedback.style.color = '#ff6b6b';
            feedback.style.border = '1px solid rgba(226, 33, 52, 0.3)';
        } else {
            feedback.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            feedback.style.color = 'var(--text-secondary)';
            feedback.style.border = '1px solid var(--border-color)';
        }
        feedback.textContent = msg;
    }

    if (!clientId && !clientSecret) {
        showFeedback('Enter Client ID and Client Secret', true);
        return;
    }

    if (!clientId && clientSecret) {
        showFeedback('Enter Client ID', true);
        return;
    }

    if (clientId && !clientSecret) {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Verifying with Spotify...';
        }
        try {
            const decrypted = await decryptCredentialsWithPin(clientId);
            if (decrypted && decrypted.clientId && decrypted.clientSecret) {
                saveSpotifyCredentials(decrypted.clientId, decrypted.clientSecret);
                localStorage.setItem('spotify_auth_method', 'pin');
                closeCredentialsModal();
                showToast('Connected to Spotify successfully!', 'success');

                if (typeof checkAndLoadReleases === 'function') {
                    checkAndLoadReleases();
                }
                if (typeof loadCurrentSettingsIntoForm === 'function') {
                    loadCurrentSettingsIntoForm();
                }
                return;
            } else {
                throw new Error('Invalid decrypted credentials');
            }
        } catch (err) {
            showFeedback('Enter Client Secret', true);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save & Connect';
            }
            return;
        }
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Verifying with Spotify...';
    }
    showFeedback('Testing credentials with Spotify servers...', false);

    const testResult = await testSpotifyCredentials(clientId, clientSecret);

    if (testResult.success) {
        saveSpotifyCredentials(clientId, clientSecret);
        localStorage.setItem('spotify_auth_method', 'custom');

        closeCredentialsModal();
        showToast('Spotify credentials connected successfully!', 'success');

        if (typeof checkAndLoadReleases === 'function') {
            checkAndLoadReleases();
        }

        if (typeof loadCurrentSettingsIntoForm === 'function') {
            loadCurrentSettingsIntoForm();
        }
    } else {
        showFeedback(testResult.error || 'Spotify rejected these credentials. Please check your Spotify Developer Dashboard.', true);
    }

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Connect';
    }
}

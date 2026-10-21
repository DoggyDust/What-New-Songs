// ==========================================================================
// UI HELPER MODULE - Shared UI initialization, themes, toasts, and navigation
// ==========================================================================
// This script runs on all screens (index.html, search.html, following.html, settings.html)
// to ensure a uniform look, consistent navigation state, and real-time theme updates.
// ==========================================================================

// --------------------------------------------------------------------------
// Initialize UI: Apply themes, highlight active nav tab, and bind sync button
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // 1. Apply the user's saved theme & accent colors
    applyThemeFromSettings();

    // 2. Highlight current screen in top navigation
    highlightActiveNav();

    // 3. Update the followed artists badge counter
    updateNavFollowingBadge();

    // 4. Attach quick-sync action to the top navbar sync button
    const syncBtn = document.getElementById('navSyncBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', handleGlobalSync);
    }

    // 5. Inject Credentials Setup Modal for web users
    injectCredentialsModal();

    // 6. On both web AND desktop: prompt for PIN/credentials if not yet configured.
    // The Electron desktop app is equally protected — no auto-bypass with built-in keys.
    if (!hasSpotifyCredentials()) {
        setTimeout(() => {
            openCredentialsModal({ isInitialPrompt: true });
        }, 350);
    }
});

// --------------------------------------------------------------------------
// Function: Apply Theme & CSS Custom Properties from localStorage
// --------------------------------------------------------------------------
function applyThemeFromSettings() {
    const db = getDatabase();
    const settings = db.settings || {};
    const root = document.documentElement;

    // Reset inline overrides first
    root.style.removeProperty('--bg-main');
    root.style.removeProperty('--bg-card');
    root.style.removeProperty('--bg-surface');
    root.style.removeProperty('--text-primary');

    // Handle Theme Mode
    if (settings.theme === 'light') {
        document.body.classList.add('light-mode');
    } else if (settings.theme === 'custom') {
        document.body.classList.remove('light-mode');
        // Apply custom background color
        if (settings.bgColor) {
            root.style.setProperty('--bg-main', settings.bgColor);
            root.style.setProperty('--bg-surface', 'rgba(0, 0, 0, 0.35)');
            root.style.setProperty('--bg-card', 'rgba(0, 0, 0, 0.25)');
            root.style.setProperty('--text-primary', '#FFFFFF');
        }
    } else {
        // Standard Dark Mode
        document.body.classList.remove('light-mode');
    }

    // Apply User's Primary Accent Color (Buttons, Active Tabs, Highlights)
    if (settings.color) {
        root.style.setProperty('--primary-color', settings.color);
        // Calculate a glowing accent shadow
        root.style.setProperty('--accent-glow', hexToRgba(settings.color, 0.3));
    }
}

// --------------------------------------------------------------------------
// Helper: Convert HEX color to RGBA for smooth accent glows
// --------------------------------------------------------------------------
function hexToRgba(hex, alpha = 0.3) {
    if (!hex || hex.length < 6) return `rgba(29, 185, 84, ${alpha})`;
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 29;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 185;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 84;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --------------------------------------------------------------------------
// Function: Highlight which nav item is active based on the current HTML file
// --------------------------------------------------------------------------
function highlightActiveNav() {
    const currentPath = window.location.pathname;
    const pageName = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';

    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === pageName || (pageName === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// --------------------------------------------------------------------------
// Function: Update the badge in the navigation showing total followed artists
// --------------------------------------------------------------------------
function updateNavFollowingBadge() {
    const db = getDatabase();
    const count = db.artists ? db.artists.length : 0;
    const badge = document.getElementById('navFollowingCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

// --------------------------------------------------------------------------
// Function: Show modern toast notification (Non-blocking)
// --------------------------------------------------------------------------
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

    // Auto-remove after 3.5 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --------------------------------------------------------------------------
// Function: Trigger release sync from the navbar
// --------------------------------------------------------------------------
async function handleGlobalSync() {
    const syncIcon = document.getElementById('navSyncIcon');
    if (syncIcon) syncIcon.classList.add('spinning');

    // Ensure Spotify credentials exist before attempting sync
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

        // Fetch fresh releases from Spotify
        const releases = await fetchAllFollowedReleases(db.artists);
        
        // Cache in sessionStorage for fast screen switching
        sessionStorage.setItem('cachedReleases', JSON.stringify(releases));
        
        // If we are currently on the releases screen (index.html), re-render
        if (typeof renderAllReleasesFromCache === 'function') {
            renderAllReleasesFromCache(releases);
        }

        showToast(`Synced! Found ${releases.length} total releases.`, 'success');
    } catch (error) {
        console.error('// Sync Error:', error);
        showToast('Failed to sync with Spotify.', 'error');
    } finally {
        if (syncIcon) syncIcon.classList.remove('spinning');
    }
}

// --------------------------------------------------------------------------
// Function: Open artist discography modal (used on following & releases screens)
// --------------------------------------------------------------------------
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
        // Fetch up to 10 recent albums/singles
        const items = await fetchArtistReleases(artistId, 10);
        
        if (!items || items.length === 0) {
            modalList.innerHTML = '<p class="empty-state">No releases found for this artist.</p>';
            return;
        }

        // Sort newest first and take top 5
        const sorted = items.sort((a, b) => new Date(b.release_date) - new Date(a.release_date)).slice(0, 5);

        modalList.innerHTML = '';
        const db = getDatabase();
        const preferredPlatform = db.settings ? db.settings.platform : 'spotify';

        sorted.forEach(rel => {
            const cover = (rel.images && rel.images.length > 0) ? rel.images[0].url : 'icon.png';
            const row = document.createElement('div');
            row.className = 'release-card';
            row.style.marginBottom = '10px';
            
            row.innerHTML = `
                <div class="release-main">
                    <img src="${cover}" class="album-cover" style="width: 52px; height: 52px;">
                    <div class="release-details">
                        <div class="release-title">${rel.name}</div>
                        <div class="release-date">Released: ${rel.release_date}</div>
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

// Close modal helper
function closeArtistModal() {
    const modal = document.getElementById('artistModal');
    if (modal) modal.classList.remove('active');
}

// --------------------------------------------------------------------------
// Function: Inject Credentials Setup Modal into DOM (PIN + Custom Keys + Lockout)
// --------------------------------------------------------------------------
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
                    <h3 class="modal-title">Unlock Spotify Tracker</h3>
                </div>
            </div>
            
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;">
                Enter your access PIN to unlock and connect to Spotify, or click <strong>More Options</strong> to use your own Spotify Developer credentials.
            </p>

            <!-- 1. PIN Lockout Alert Banner (Shown only when 5 attempts are exceeded) -->
            <div id="pinLockoutBanner" style="display: none; background: rgba(226, 33, 52, 0.15); border: 1px solid rgba(226, 33, 52, 0.4); border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 16px; font-size: 13px; line-height: 1.5; color: #ff8585;">
                <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; margin-bottom: 4px; color: #ff6b6b;">
                    <span>🚫</span> PIN Access Locked Out
                </div>
                <span id="pinLockoutText">5 incorrect attempts reached. This device is locked out from using a PIN for 7 days. You must enter your own Spotify Developer credentials below to use the tracker.</span>
            </div>

            <!-- 2. Primary PIN Form (Enabled when not locked out) -->
            <div id="pinEntrySection">
                <form id="pinUnlockForm" onsubmit="return false;" style="display: flex; flex-direction: column; gap: 12px;">
                    <div>
                        <label for="credModalPinInput" style="display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">
                            Access PIN
                        </label>
                        <div style="display: flex; gap: 8px;">
                            <input 
                                type="password" 
                                id="credModalPinInput" 
                                class="input-field" 
                                placeholder="Enter Access PIN" 
                                autocomplete="current-password" 
                                inputmode="numeric"
                                spellcheck="false"
                                style="border-radius: var(--radius-md); font-family: inherit; letter-spacing: 2px;"
                                required
                            >
                            <button type="button" id="togglePinVisibilityBtn" class="btn btn-secondary btn-sm" title="Show / Hide PIN" style="flex-shrink: 0; padding: 0 12px;">
                                👁️
                            </button>
                        </div>
                    </div>

                    <div id="pinFeedback" style="display: none; font-size: 13px; padding: 8px 12px; border-radius: var(--radius-sm); line-height: 1.4;"></div>

                    <div style="display: flex; gap: 10px; margin-top: 4px;">
                        <button type="submit" id="credModalPinSubmitBtn" class="btn btn-primary" style="flex: 1;">
                            Unlock with PIN
                        </button>
                    </div>
                </form>
            </div>

            <!-- 3. Toggle for More Options (Custom Credentials) -->
            <div style="margin-top: 16px; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
                <button type="button" id="toggleMoreOptionsBtn" class="btn btn-secondary btn-sm" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <span id="moreOptionsToggleIcon">⚙️</span>
                    <span id="moreOptionsToggleLabel">More Options: Use Your Own Spotify Credentials</span>
                </button>
            </div>

            <!-- 4. Collapsible Custom Spotify Credentials Section -->
            <div id="customCredentialsSection" style="display: none; margin-top: 14px;">
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5;">
                    Enter your Spotify Web API credentials from your Developer Dashboard. Keys are saved strictly in this browser.
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
                        <button type="submit" id="credModalSaveBtn" class="btn btn-primary btn-sm" style="flex: 1;">
                            Save & Connect
                        </button>
                    </div>
                </form>

                <details class="credentials-guide" style="margin-top: 14px; font-size: 12px; color: var(--text-secondary); border-top: 1px solid var(--border-subtle); padding-top: 12px;">
                    <summary style="cursor: pointer; font-weight: 600; color: var(--text-primary); user-select: none;">
                        ❓ How to get a free Spotify Client ID & Secret (1 min)
                    </summary>
                    <ol style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                        <li>Open the <a href="https://developer.spotify.com/dashboard" target="_blank" style="color: var(--primary-color); font-weight: 600;">Spotify Developer Dashboard</a> and log in.</li>
                        <li>Click <strong>Create App</strong>. Enter an App name (e.g. <em>Music Tracker</em>) and Redirect URI: <code>http://localhost</code>.</li>
                        <li>Check <strong>Web API</strong> and click Save.</li>
                        <li>In settings, click <strong>View client secret</strong> and copy the Client ID and Secret here.</li>
                    </ol>
                </details>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Bind event handlers
    const pinForm = document.getElementById('pinUnlockForm');
    const togglePinBtn = document.getElementById('togglePinVisibilityBtn');
    const toggleSecretBtn = document.getElementById('credModalToggleSecretBtn');
    const moreOptionsBtn = document.getElementById('toggleMoreOptionsBtn');
    const credForm = document.getElementById('credentialsModalForm');

    // Toggle PIN visibility
    if (togglePinBtn) {
        togglePinBtn.addEventListener('click', () => {
            const pinInput = document.getElementById('credModalPinInput');
            if (!pinInput) return;
            const isPassword = pinInput.type === 'password';
            pinInput.type = isPassword ? 'text' : 'password';
            togglePinBtn.textContent = isPassword ? '🙈' : '👁️';
        });
    }

    // Toggle Secret visibility
    if (toggleSecretBtn) {
        toggleSecretBtn.addEventListener('click', () => {
            const secretInput = document.getElementById('credModalClientSecret');
            if (!secretInput) return;
            const isPassword = secretInput.type === 'password';
            secretInput.type = isPassword ? 'text' : 'password';
            toggleSecretBtn.textContent = isPassword ? '🙈' : '👁️';
        });
    }

    // Toggle More Options (Custom Credentials)
    if (moreOptionsBtn) {
        moreOptionsBtn.addEventListener('click', () => {
            const section = document.getElementById('customCredentialsSection');
            const label = document.getElementById('moreOptionsToggleLabel');
            if (!section) return;
            const isHidden = section.style.display === 'none';
            section.style.display = isHidden ? 'block' : 'none';
            if (label) {
                label.textContent = isHidden 
                    ? 'Hide Custom Spotify Credentials ▲' 
                    : 'More Options: Use Your Own Spotify Credentials ▾';
            }
        });
    }

    // Submit PIN form
    if (pinForm) {
        pinForm.addEventListener('submit', handlePinUnlockSubmit);
    }

    // Submit Custom Credentials form
    if (credForm) {
        credForm.addEventListener('submit', handleCredentialsModalSubmit);
    }
}

// --------------------------------------------------------------------------
// Function: Open Credentials / PIN Setup Modal
// --------------------------------------------------------------------------
function openCredentialsModal(options = {}) {
    injectCredentialsModal();

    const modal = document.getElementById('credentialsModal');
    if (!modal) return;

    const pinInput = document.getElementById('credModalPinInput');
    const pinSection = document.getElementById('pinEntrySection');
    const lockoutBanner = document.getElementById('pinLockoutBanner');
    const lockoutText = document.getElementById('pinLockoutText');
    const customSection = document.getElementById('customCredentialsSection');
    const pinFeedback = document.getElementById('pinFeedback');
    const moreOptionsLabel = document.getElementById('moreOptionsToggleLabel');

    // Check Lockout Status
    const lockoutStatus = typeof getPinLockoutStatus === 'function' ? getPinLockoutStatus() : { isLocked: false };

    if (lockoutStatus.isLocked) {
        // Locked out: hide PIN form, show warning banner, open custom credentials
        if (pinSection) pinSection.style.display = 'none';
        if (lockoutBanner) {
            lockoutBanner.style.display = 'block';
            if (lockoutText) {
                lockoutText.textContent = `5 incorrect attempts reached. This device is locked out from using a PIN for ${lockoutStatus.remainingDays} more day(s). You must enter your own Spotify Developer credentials below to use the tracker.`;
            }
        }
        if (customSection) customSection.style.display = 'block';
        if (moreOptionsLabel) moreOptionsLabel.textContent = 'Custom Spotify Developer Credentials';
    } else {
        // Normal state: show PIN entry
        if (pinSection) pinSection.style.display = 'block';
        if (lockoutBanner) lockoutBanner.style.display = 'none';

        if (pinFeedback) {
            if (lockoutStatus.attempts && lockoutStatus.attempts > 0) {
                pinFeedback.style.display = 'block';
                pinFeedback.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
                pinFeedback.style.color = '#f59e0b';
                pinFeedback.style.border = '1px solid rgba(245, 158, 11, 0.3)';
                pinFeedback.textContent = `⚠️ ${lockoutStatus.attemptsRemaining} attempt${lockoutStatus.attemptsRemaining === 1 ? '' : 's'} remaining before 7-day lockout.`;
            } else {
                pinFeedback.style.display = 'none';
                pinFeedback.textContent = '';
            }
        }
    }

    // Populate existing saved custom credentials if present
    const saved = typeof getSavedCredentials === 'function' ? getSavedCredentials() : { clientId: '', clientSecret: '' };
    const clientIdInput = document.getElementById('credModalClientId');
    const clientSecretInput = document.getElementById('credModalClientSecret');
    if (clientIdInput) clientIdInput.value = saved.clientId || '';
    if (clientSecretInput) clientSecretInput.value = saved.clientSecret || '';

    modal.classList.add('active');

    if (!lockoutStatus.isLocked && pinInput) {
        pinInput.value = '';
        pinInput.focus();
    } else if (clientIdInput) {
        clientIdInput.focus();
    }
}

// --------------------------------------------------------------------------
// Function: Close the Credentials / PIN Modal
// --------------------------------------------------------------------------
function closeCredentialsModal() {
    const modal = document.getElementById('credentialsModal');
    if (modal) modal.classList.remove('active');
}

// --------------------------------------------------------------------------
// Function: Handle PIN Unlock Form Submission
// --------------------------------------------------------------------------
async function handlePinUnlockSubmit(e) {
    if (e) e.preventDefault();

    const pinInput = document.getElementById('credModalPinInput');
    const submitBtn = document.getElementById('credModalPinSubmitBtn');
    const feedback = document.getElementById('pinFeedback');
    const pinSection = document.getElementById('pinEntrySection');
    const lockoutBanner = document.getElementById('pinLockoutBanner');
    const lockoutText = document.getElementById('pinLockoutText');
    const customSection = document.getElementById('customCredentialsSection');

    // 1. Verify lockout status before proceeding
    const currentLockout = getPinLockoutStatus();
    if (currentLockout.isLocked) {
        showToast('Device is locked out from PIN entry for 7 days.', 'error');
        openCredentialsModal();
        return;
    }

    const pin = pinInput ? pinInput.value.trim() : '';
    if (!pin) {
        if (feedback) {
            feedback.style.display = 'block';
            feedback.style.backgroundColor = 'rgba(226, 33, 52, 0.15)';
            feedback.style.color = '#ff6b6b';
            feedback.style.border = '1px solid rgba(226, 33, 52, 0.3)';
            feedback.textContent = 'Please enter your access PIN.';
        }
        return;
    }

    // UI loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying PIN...';
    }
    if (feedback) {
        feedback.style.display = 'block';
        feedback.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        feedback.style.color = 'var(--text-secondary)';
        feedback.style.border = '1px solid var(--border-color)';
        feedback.textContent = 'Decrypting credentials...';
    }

    try {
        // Attempt cryptographic decryption using PIN
        const decrypted = await decryptCredentialsWithPin(pin);

        if (decrypted && decrypted.clientId && decrypted.clientSecret) {
            // Success! Reset attempts and store credentials
            resetPinAttempts();
            saveSpotifyCredentials(decrypted.clientId, decrypted.clientSecret);
            localStorage.setItem('spotify_auth_method', 'pin');

            closeCredentialsModal();
            showToast('Access granted! Connected to Spotify.', 'success');

            // Refresh index screen releases if present
            if (typeof checkAndLoadReleases === 'function') {
                checkAndLoadReleases();
            }

            // Refresh settings screen if present
            if (typeof loadCurrentSettingsIntoForm === 'function') {
                loadCurrentSettingsIntoForm();
            }
            return;
        } else {
            throw new Error('Invalid decrypted payload.');
        }
    } catch (err) {
        // Cryptographic failure (OperationError) means wrong PIN!
        const failedStatus = recordFailedPinAttempt();

        if (failedStatus.isLocked) {
            // Lockout triggered!
            if (pinSection) pinSection.style.display = 'none';
            if (lockoutBanner) {
                lockoutBanner.style.display = 'block';
                if (lockoutText) {
                    lockoutText.textContent = `5 incorrect attempts reached! This device is locked out from using a PIN for 7 days. You must enter your own Spotify Developer credentials below to use the tracker.`;
                }
            }
            if (customSection) customSection.style.display = 'block';
            showToast('5 incorrect PIN attempts. Device locked out for 7 days!', 'error');
        } else {
            // Attempts remaining
            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.backgroundColor = 'rgba(226, 33, 52, 0.15)';
                feedback.style.color = '#ff6b6b';
                feedback.style.border = '1px solid rgba(226, 33, 52, 0.3)';
                feedback.textContent = `❌ Incorrect PIN. ${failedStatus.attemptsRemaining} attempt${failedStatus.attemptsRemaining === 1 ? '' : 's'} remaining before 7-day lockout.`;
            }
            if (pinInput) {
                pinInput.value = '';
                pinInput.focus();
            }
            showToast(`Incorrect PIN (${failedStatus.attemptsRemaining} remaining)`, 'error');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Unlock with PIN';
        }
    }
}

// --------------------------------------------------------------------------
// Function: Handle Custom Credentials Form Submission
// --------------------------------------------------------------------------
async function handleCredentialsModalSubmit(e) {
    if (e) e.preventDefault();

    const clientIdInput = document.getElementById('credModalClientId');
    const clientSecretInput = document.getElementById('credModalClientSecret');
    const saveBtn = document.getElementById('credModalSaveBtn');
    const feedback = document.getElementById('credModalFeedback');

    const clientId = clientIdInput ? clientIdInput.value.trim() : '';
    const clientSecret = clientSecretInput ? clientSecretInput.value.trim() : '';

    if (!clientId || !clientSecret) {
        if (feedback) {
            feedback.style.display = 'block';
            feedback.style.backgroundColor = 'rgba(226, 33, 52, 0.15)';
            feedback.style.color = '#ff6b6b';
            feedback.style.border = '1px solid rgba(226, 33, 52, 0.3)';
            feedback.textContent = 'Please enter both Client ID and Client Secret.';
        }
        return;
    }

    // Set loading state
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Verifying with Spotify...';
    }
    if (feedback) {
        feedback.style.display = 'block';
        feedback.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        feedback.style.color = 'var(--text-secondary)';
        feedback.style.border = '1px solid var(--border-color)';
        feedback.textContent = 'Testing credentials with Spotify servers...';
    }

    const testResult = await testSpotifyCredentials(clientId, clientSecret);

    if (testResult.success) {
        // Save to database & localStorage
        saveSpotifyCredentials(clientId, clientSecret);
        localStorage.setItem('spotify_auth_method', 'custom');
        
        closeCredentialsModal();
        showToast('Spotify credentials connected successfully!', 'success');

        // If on index.html, refresh releases
        if (typeof checkAndLoadReleases === 'function') {
            checkAndLoadReleases();
        }

        // If on settings.html, update form
        if (typeof loadCurrentSettingsIntoForm === 'function') {
            loadCurrentSettingsIntoForm();
        }
    } else {
        if (feedback) {
            feedback.style.display = 'block';
            feedback.style.backgroundColor = 'rgba(226, 33, 52, 0.15)';
            feedback.style.color = '#ff6b6b';
            feedback.style.border = '1px solid rgba(226, 33, 52, 0.3)';
            feedback.textContent = testResult.error || 'Spotify rejected these credentials. Please check your Spotify Developer Dashboard.';
        }
    }

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Connect';
    }
}


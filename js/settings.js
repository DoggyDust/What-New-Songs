// ==========================================================================
// SETTINGS SCREEN CONTROLLER (settings.html)
// ==========================================================================
// This script powers the Settings screen:
// 1. Manages View Mode selection (Timeline vs 30-Day List).
// 2. Customizes Theme (Dark, Light, or Custom color).
// 3. Customizes Accent/Button color with instant live-preview and Undo option.
// 4. Sets preferred music playback platform (Spotify, Apple Music, YouTube Music).
// 5. Diagnostics test to verify Spotify API connection status.
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadCurrentSettingsIntoForm();
    bindSettingsEvents();
});

// --------------------------------------------------------------------------
// Function: Populate form controls with saved database values
// --------------------------------------------------------------------------
function loadCurrentSettingsIntoForm() {
    const db = getDatabase();
    const settings = db.settings || {};

    const modeSelect = document.getElementById('settingModeSelect');
    const themeSelect = document.getElementById('settingThemeSelect');
    const platformSelect = document.getElementById('settingPlatformSelect');
    const colorPicker = document.getElementById('settingColorPicker');
    const bgPicker = document.getElementById('settingBgPicker');
    const customBgSection = document.getElementById('customBgSection');
    const undoBtn = document.getElementById('settingUndoColorBtn');

    if (modeSelect) modeSelect.value = settings.mode || 'timeline';
    if (themeSelect) themeSelect.value = settings.theme || 'dark';
    if (platformSelect) platformSelect.value = settings.platform || 'spotify';
    if (colorPicker) colorPicker.value = settings.color || '#007BFF';
    if (bgPicker) bgPicker.value = settings.bgColor || '#121212';

    // Show custom background picker only when custom theme is selected
    if (customBgSection) {
        customBgSection.style.display = (settings.theme === 'custom') ? 'flex' : 'none';
    }

    // Show undo button if previous settings exist
    if (undoBtn) {
        undoBtn.style.display = db.previousSettings ? 'inline-flex' : 'none';
    }

    // Populate Spotify Credentials section
    loadSpotifyCredentialsIntoSettings();
}

// --------------------------------------------------------------------------
// Function: Populate and update the Spotify Credentials section in Settings
// --------------------------------------------------------------------------
function loadSpotifyCredentialsIntoSettings() {
    const active = typeof getActiveSpotifyCredentials === 'function' ? getActiveSpotifyCredentials() : { clientId: '', clientSecret: '', isBuiltin: false };
    const saved = typeof getSavedCredentials === 'function' ? getSavedCredentials() : { clientId: '', clientSecret: '' };

    const statusBadge = document.getElementById('credentialsStatusBadge');
    const desc = document.getElementById('credentialsDesc');
    const clientIdInput = document.getElementById('settingClientIdInput');
    const clientSecretInput = document.getElementById('settingClientSecretInput');
    const clearBtn = document.getElementById('clearCredentialsSettingBtn');
    const notice = document.getElementById('credentialsSettingNotice');

    if (clientIdInput) clientIdInput.value = saved.clientId || '';
    if (clientSecretInput) clientSecretInput.value = saved.clientSecret || '';

    const hasCustom = Boolean(saved.clientId && saved.clientSecret);
    if (clearBtn) clearBtn.style.display = hasCustom ? 'inline-block' : 'none';

    const authMethod = localStorage.getItem('spotify_auth_method') || (hasCustom ? 'custom' : 'none');
    const lockout = typeof getPinLockoutStatus === 'function' ? getPinLockoutStatus() : { isLocked: false };
    const envLabel = (typeof isElectronApp === 'function' && isElectronApp()) ? 'Desktop App' : 'Web Mode';

    if (hasCustom) {
        if (statusBadge) {
            if (authMethod === 'pin') {
                statusBadge.textContent = `🟢 ${envLabel} (PIN Unlocked)`;
            } else {
                statusBadge.textContent = `🟢 ${envLabel} (Custom Keys)`;
            }
            statusBadge.style.backgroundColor = 'rgba(29, 185, 84, 0.2)';
            statusBadge.style.color = '#1DB954';
        }
        if (notice) {
            notice.textContent = authMethod === 'pin'
                ? 'Connected via access PIN. Credentials stored safely on your device.'
                : 'Your custom Spotify Developer credentials are saved safely on this device (localStorage).';
        }
    } else if (lockout.isLocked) {
        if (statusBadge) {
            statusBadge.textContent = `🚫 PIN Locked (${lockout.remainingDays} days left)`;
            statusBadge.style.backgroundColor = 'rgba(226, 33, 52, 0.2)';
            statusBadge.style.color = '#ff6b6b';
        }
        if (notice) {
            notice.textContent = `Device locked out from PIN access for ${lockout.remainingDays} more day(s) due to 5 incorrect attempts. You must enter your own Spotify credentials below.`;
        }
    } else {
        if (statusBadge) {
            statusBadge.textContent = '⚠️ Locked — Setup Required';
            statusBadge.style.backgroundColor = 'rgba(226, 33, 52, 0.2)';
            statusBadge.style.color = '#ff6b6b';
        }
        if (notice) {
            notice.textContent = 'Enter your access PIN or your own Spotify developer keys to unlock tracker features.';
        }
    }
}

// --------------------------------------------------------------------------
// Function: Bind change events to all inputs and diagnostic buttons
// --------------------------------------------------------------------------
function bindSettingsEvents() {
    const modeSelect = document.getElementById('settingModeSelect');
    const themeSelect = document.getElementById('settingThemeSelect');
    const platformSelect = document.getElementById('settingPlatformSelect');
    const colorPicker = document.getElementById('settingColorPicker');
    const bgPicker = document.getElementById('settingBgPicker');
    const undoBtn = document.getElementById('settingUndoColorBtn');
    const testConnBtn = document.getElementById('testConnectionBtn');

    // View Mode Change
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            updateAppSettings({ mode: modeSelect.value });
            showToast(`View mode updated to "${modeSelect.options[modeSelect.selectedIndex].text}"`);
        });
    }

    // Theme Change (Dark, Light, Custom)
    if (themeSelect) {
        themeSelect.addEventListener('change', () => {
            const val = themeSelect.value;
            const customBgSection = document.getElementById('customBgSection');
            if (customBgSection) {
                customBgSection.style.display = (val === 'custom') ? 'flex' : 'none';
            }

            updateAppSettings({ theme: val });
            applyThemeFromSettings();
            showToast(`Theme updated to ${val.charAt(0).toUpperCase() + val.slice(1)} Mode`);
        });
    }

    // Music Service Selection (Spotify, Apple Music, YouTube Music)
    if (platformSelect) {
        platformSelect.addEventListener('change', () => {
            updateAppSettings({ platform: platformSelect.value });
            showToast(`Music service set to ${platformSelect.options[platformSelect.selectedIndex].text}`);
        });
    }

    // Primary Accent Color Picker (With Real-Time Preview & Undo History Backup)
    if (colorPicker) {
        colorPicker.addEventListener('input', () => {
            const root = document.documentElement;
            const chosenColor = colorPicker.value;
            root.style.setProperty('--primary-color', chosenColor);
            if (typeof calculateHoverColor === 'function') {
                root.style.setProperty('--primary-hover', calculateHoverColor(chosenColor));
            }
            if (typeof hexToRgba === 'function') {
                root.style.setProperty('--accent-glow', hexToRgba(chosenColor, 0.3));
            }
        });

        colorPicker.addEventListener('change', () => {
            backupCurrentSettingsForUndo();
            updateAppSettings({ color: colorPicker.value });
            applyThemeFromSettings();
            
            const undo = document.getElementById('settingUndoColorBtn');
            if (undo) undo.style.display = 'inline-flex';
            showToast('Accent color updated!');
        });
    }

    // Custom Background Color Picker
    if (bgPicker) {
        bgPicker.addEventListener('change', () => {
            backupCurrentSettingsForUndo();
            updateAppSettings({ bgColor: bgPicker.value });
            applyThemeFromSettings();

            const undo = document.getElementById('settingUndoColorBtn');
            if (undo) undo.style.display = 'inline-flex';
            showToast('Background color updated!');
        });
    }

    // Undo Color Changes
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            const db = getDatabase();
            if (db.previousSettings) {
                db.settings = { ...db.previousSettings };
                db.previousSettings = null;
                saveDatabase(db);
                loadCurrentSettingsIntoForm();
                applyThemeFromSettings();
                showToast('Reverted color changes.');
            }
        });
    }

    // Toggle Secret Visibility in Settings
    const toggleSecretBtn = document.getElementById('settingToggleSecretBtn');
    if (toggleSecretBtn) {
        toggleSecretBtn.addEventListener('click', () => {
            const secretInput = document.getElementById('settingClientSecretInput');
            if (!secretInput) return;
            const isPassword = secretInput.type === 'password';
            secretInput.type = isPassword ? 'text' : 'password';
            toggleSecretBtn.textContent = isPassword ? '🙈' : '👁️';
        });
    }

    // Save Credentials in Settings
    const saveCredBtn = document.getElementById('saveCredentialsSettingBtn');
    if (saveCredBtn) {
        saveCredBtn.addEventListener('click', async () => {
            const clientIdInput = document.getElementById('settingClientIdInput');
            const clientSecretInput = document.getElementById('settingClientSecretInput');
            const id = clientIdInput ? clientIdInput.value.trim() : '';
            const secret = clientSecretInput ? clientSecretInput.value.trim() : '';

            if (!id || !secret) {
                showToast('Please fill in both Client ID and Client Secret.', 'error');
                return;
            }

            saveCredBtn.disabled = true;
            saveCredBtn.textContent = 'Verifying...';

            const test = await testSpotifyCredentials(id, secret);
            if (test.success) {
                saveSpotifyCredentials(id, secret);
                loadSpotifyCredentialsIntoSettings();
                showToast('Spotify credentials verified and saved!', 'success');
            } else {
                showToast(test.error || 'Failed to verify credentials with Spotify.', 'error');
            }

            saveCredBtn.disabled = false;
            saveCredBtn.textContent = 'Save Credentials';
        });
    }

    // Clear Stored Credentials in Settings
    const clearCredBtn = document.getElementById('clearCredentialsSettingBtn');
    if (clearCredBtn) {
        clearCredBtn.addEventListener('click', () => {
            clearSpotifyCredentials();
            loadSpotifyCredentialsIntoSettings();
            showToast('Spotify credentials cleared.', 'info');
        });
    }

    // Test Spotify Connection Button
    if (testConnBtn) {
        testConnBtn.addEventListener('click', testSpotifyConnection);
    }
}

// --------------------------------------------------------------------------
// Function: Backup current settings to support 1-click Undo
// --------------------------------------------------------------------------
function backupCurrentSettingsForUndo() {
    const db = getDatabase();
    db.previousSettings = JSON.parse(JSON.stringify(db.settings));
    saveDatabase(db);
}

// --------------------------------------------------------------------------
// Function: Test Spotify API Credentials & Connectivity
// --------------------------------------------------------------------------
async function testSpotifyConnection() {
    const statusEl = document.getElementById('connectionStatusText');
    const testBtn = document.getElementById('testConnectionBtn');

    if (testBtn) testBtn.disabled = true;
    if (statusEl) {
        statusEl.textContent = 'Testing connection with Spotify API...';
        statusEl.style.color = 'var(--text-secondary)';
    }

    const creds = typeof getActiveSpotifyCredentials === 'function' 
        ? getActiveSpotifyCredentials() 
        : { clientId: '', clientSecret: '', isBuiltin: false };

    if (!creds.clientId || !creds.clientSecret) {
        if (statusEl) {
            statusEl.textContent = '⚠️ No Spotify credentials configured. Please enter your Client ID & Secret above.';
            statusEl.style.color = '#f59e0b';
        }
        showToast('Spotify credentials missing.', 'error');
        if (testBtn) testBtn.disabled = false;
        return;
    }

    try {
        const test = await testSpotifyCredentials(creds.clientId, creds.clientSecret);
        if (test.success) {
            if (statusEl) {
            const credType = creds.isBuiltin ? 'app credentials' : 'custom credentials';
                statusEl.textContent = `🟢 Connected successfully using ${credType}!`;
                statusEl.style.color = '#1DB954';
            }
            showToast('Spotify connection verified!', 'success');
        } else {
            if (statusEl) {
                statusEl.textContent = `🔴 Connection failed: ${test.error}`;
                statusEl.style.color = '#E22134';
            }
            showToast('Spotify connection failed.', 'error');
        }
    } catch (error) {
        if (statusEl) {
            statusEl.textContent = '🔴 Connection failed. Please check network connection.';
            statusEl.style.color = '#E22134';
        }
        showToast('Spotify connection failed.', 'error');
    } finally {
        if (testBtn) testBtn.disabled = false;
    }
}

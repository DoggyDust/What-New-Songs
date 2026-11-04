document.addEventListener('DOMContentLoaded', () => {
    loadCurrentSettingsIntoForm();
    bindSettingsEvents();
});

function loadCurrentSettingsIntoForm() {
    const db = getDatabase();
    const settings = db.settings || {};

    const modeSelect = document.getElementById('settingModeSelect');
    const themeSelect = document.getElementById('settingThemeSelect');
    const platformSelect = document.getElementById('settingPlatformSelect');
    const colorPicker = document.getElementById('settingColorPicker');
    const bgPicker = document.getElementById('settingBgPicker');
    const customBgSection = document.getElementById('customBgSection');
    const undoColorBtn = document.getElementById('settingUndoColorBtn');
    const undoBgColorBtn = document.getElementById('settingUndoBgColorBtn');

    if (modeSelect) modeSelect.value = settings.mode || 'timeline';
    if (themeSelect) themeSelect.value = settings.theme || 'dark';
    if (platformSelect) platformSelect.value = settings.platform || 'spotify';
    if (colorPicker) colorPicker.value = settings.color || '#4169E1';
    if (bgPicker) bgPicker.value = settings.bgColor || '#121212';

    if (customBgSection) {
        customBgSection.style.display = (settings.theme === 'custom') ? 'flex' : 'none';
    }

    if (undoColorBtn) {
        undoColorBtn.style.display = (typeof getAccentColorHistoryCount === 'function' && getAccentColorHistoryCount() > 0) ? 'inline-flex' : 'none';
    }

    if (undoBgColorBtn) {
        undoBgColorBtn.style.display = (typeof getBgColorHistoryCount === 'function' && getBgColorHistoryCount() > 0) ? 'inline-flex' : 'none';
    }

    loadSpotifyCredentialsIntoSettings();
}

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
            statusBadge.textContent = authMethod === 'pin' ? `🟢 ${envLabel} (PIN Unlocked)` : `🟢 ${envLabel} (Custom Keys)`;
            statusBadge.style.backgroundColor = 'rgba(65, 105, 225, 0.2)';
            statusBadge.style.color = 'var(--primary-color)';
        }
        if (notice) {
            notice.textContent = authMethod === 'pin'
                ? 'Connected via access PIN. Credentials stored safely on your device.'
                : 'Your custom Spotify Developer credentials are saved safely on this device.';
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

function bindSettingsEvents() {
    const modeSelect = document.getElementById('settingModeSelect');
    const themeSelect = document.getElementById('settingThemeSelect');
    const platformSelect = document.getElementById('settingPlatformSelect');
    const colorPicker = document.getElementById('settingColorPicker');
    const bgPicker = document.getElementById('settingBgPicker');
    const undoColorBtn = document.getElementById('settingUndoColorBtn');
    const undoBgColorBtn = document.getElementById('settingUndoBgColorBtn');
    const testConnBtn = document.getElementById('testConnectionBtn');

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            updateAppSettings({ mode: modeSelect.value });
            showToast(`View mode updated to "${modeSelect.options[modeSelect.selectedIndex].text}"`);
        });
    }

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

    if (platformSelect) {
        platformSelect.addEventListener('change', () => {
            updateAppSettings({ platform: platformSelect.value });
            showToast(`Music service set to ${platformSelect.options[platformSelect.selectedIndex].text}`);
        });
    }

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
            const db = getDatabase();
            const currentColor = (db.settings && db.settings.color) || '#4169E1';
            if (typeof pushAccentColorHistory === 'function') {
                pushAccentColorHistory(currentColor);
            }
            updateAppSettings({ color: colorPicker.value });
            applyThemeFromSettings();
            
            if (undoColorBtn) undoColorBtn.style.display = 'inline-flex';
            showToast('Accent color updated!');
        });
    }

    if (undoColorBtn) {
        undoColorBtn.addEventListener('click', () => {
            if (typeof popAccentColorHistory === 'function') {
                const prev = popAccentColorHistory();
                if (prev) {
                    updateAppSettings({ color: prev });
                    if (colorPicker) colorPicker.value = prev;
                    applyThemeFromSettings();
                    if (getAccentColorHistoryCount() === 0) {
                        undoColorBtn.style.display = 'none';
                    }
                    showToast('Reverted accent color change.');
                } else {
                    undoColorBtn.style.display = 'none';
                }
            }
        });
    }

    if (bgPicker) {
        bgPicker.addEventListener('input', () => {
            const root = document.documentElement;
            const chosenBg = bgPicker.value;
            root.style.setProperty('--bg-main', chosenBg);
        });

        bgPicker.addEventListener('change', () => {
            const db = getDatabase();
            const currentBg = (db.settings && db.settings.bgColor) || '#121212';
            if (typeof pushBgColorHistory === 'function') {
                pushBgColorHistory(currentBg);
            }
            updateAppSettings({ bgColor: bgPicker.value });
            applyThemeFromSettings();

            if (undoBgColorBtn) undoBgColorBtn.style.display = 'inline-flex';
            showToast('Background color updated!');
        });
    }

    if (undoBgColorBtn) {
        undoBgColorBtn.addEventListener('click', () => {
            if (typeof popBgColorHistory === 'function') {
                const prev = popBgColorHistory();
                if (prev) {
                    updateAppSettings({ bgColor: prev });
                    if (bgPicker) bgPicker.value = prev;
                    applyThemeFromSettings();
                    if (getBgColorHistoryCount() === 0) {
                        undoBgColorBtn.style.display = 'none';
                    }
                    showToast('Reverted background color change.');
                } else {
                    undoBgColorBtn.style.display = 'none';
                }
            }
        });
    }

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

    const clearCredBtn = document.getElementById('clearCredentialsSettingBtn');
    if (clearCredBtn) {
        clearCredBtn.addEventListener('click', () => {
            clearSpotifyCredentials();
            loadSpotifyCredentialsIntoSettings();
            showToast('Spotify credentials cleared.', 'info');
        });
    }

    if (testConnBtn) {
        testConnBtn.addEventListener('click', testSpotifyConnection);
    }

    const exportBtn = document.getElementById('exportDataBtn');
    const importBtn = document.getElementById('importDataBtn');
    const importFileInput = document.getElementById('importFileInput');
    const importNotice = document.getElementById('importStatusNotice');

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            try {
                const res = exportDatabaseToFile();
                showToast(`Data exported to ${res.fileName}`, 'success');
            } catch (err) {
                showToast('Failed to export data.', 'error');
            }
        });
    }

    if (importBtn && importFileInput) {
        importBtn.addEventListener('click', () => {
            importFileInput.value = '';
            importFileInput.click();
        });

        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                const result = validateAndImportDatabase(content);

                if (importNotice) {
                    importNotice.style.display = 'block';
                    if (result.success) {
                        importNotice.className = 'import-notice-success';
                        importNotice.textContent = '✓ Success importing data';
                    } else {
                        importNotice.className = 'import-notice-error';
                        importNotice.textContent = '✕ ' + (result.error || 'Error importing data');
                    }
                }

                if (result.success) {
                    showToast('Success importing data', 'success');
                    loadCurrentSettingsIntoForm();
                    applyThemeFromSettings();
                    updateNavFollowingBadge();
                } else {
                    showToast(result.error || 'Error importing data', 'error');
                }
            };

            reader.onerror = () => {
                if (importNotice) {
                    importNotice.style.display = 'block';
                    importNotice.className = 'import-notice-error';
                    importNotice.textContent = '✕ Error importing data: Could not read file.';
                }
                showToast('Error importing data', 'error');
            };

            reader.readAsText(file);
        });
    }
}

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
                statusEl.style.color = 'var(--primary-color)';
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

// ==========================================================================
// SPOTIFY RELEASE TRACKER - MODULAR ARCHITECTURE OVERVIEW
// ==========================================================================
// This application has been refactored and recoded into clean, modular screens 
// with dedicated HTML and JavaScript files for each section of the app:
//
// 1. SCREENS (HTML Files):
//    - index.html       : Releases Screen (checks on app open, detects new drops,
//                         timeline/list views, favorites, and music playback)
//    - search.html      : Search & Discover Screen (search by artist name or
//                         direct Spotify links/URIs/IDs to follow/unfollow)
//    - following.html   : Following Artists Screen (lists all followed artists,
//                         discography modals, and quick unfollow management)
//    - settings.html    : Settings Screen (appearance themes, custom background,
//                         accent colors with undo, playback platform, diagnostics)
//
// 2. SCRIPTS (js/ Directory):
//    - js/storage.js    : Manages localStorage database (artists, favorites, settings,
//                         and seen releases to detect brand-new drops)
//    - js/spotify-api.js: Spotify Web API client (client credentials token handling,
//                         artist search, release fetching, multi-platform redirect)
//    - js/ui.js         : Shared UI utilities (dynamic theme applicator, active navbar
//                         indicators, non-blocking toast alerts, discography modal)
//    - js/releases.js   : Controller for index.html
//    - js/search.js     : Controller for search.html
//    - js/following.js  : Controller for following.html
//    - js/settings.js   : Controller for settings.html
//
// 3. STYLES (css/ Directory):
//    - css/style.css    : Premium Spotify-inspired dark/light theme, micro-animations,
//                         cards, buttons, modals, and toasts.
//
// 4. MAIN PROCESS:
//    - main.js          : Electron application window and external link handler.
// ==========================================================================

// Build stamp, filled in by vite.config.js (git commit + build time).
/* global __BUILD__, __BUILD_TIME__, __VERSION__ */

export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '1.0.0';

export const OLD_CLIENT_MSG = 'This room is on a newer version of the game. Refresh this page (Ctrl+Shift+R), then join again.';
export const OLD_HOST_MSG = 'The host is on an older version of the game. Ask them to refresh the page and host a new room.';

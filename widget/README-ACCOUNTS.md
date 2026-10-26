# Byte Frontiers — no-install account saves

## Run without installing Node.js
This build is a static website. Upload the entire folder (including the `assets` folder) to any static HTTPS host, such as GitHub Pages or Netlify Drop, then open `Signin.html`. No Node.js, npm, or backend server is required. HTTPS is required for the browser's secure password hashing.

You can also test with a static preview server already available in your editor, but password hashing requires a secure browser context (HTTPS or localhost).

## Accounts and saves
- Sign-up and login are handled in the browser.
- Passwords are salted and hashed with PBKDF2-SHA-256 using Web Crypto.
- Game progress autosaves to this browser's local storage every 15 seconds and when leaving the game.
- The same account and save can be used in the same browser profile on this device.

## Important limitation
This no-server version does **not** sync accounts across different devices or browsers, and clearing browser site data can erase accounts/saves. Real internet cloud syncing requires a hosted backend/database or a cloud service with authentication and write access. A static-only website cannot securely share writable account data between users by itself. Do not use a password you use for other services.

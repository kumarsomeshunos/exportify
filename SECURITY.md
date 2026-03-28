# Security Policy

## Authentication Model

Exportify uses **Spotify's Authorization Code with PKCE** (Proof Key for Code Exchange) flow. This means:

- **No client secret** is needed or stored in the app
- Authentication happens directly between the user's browser/terminal and Spotify
- Tokens are stored locally (browser `localStorage` or file system `.cache`) and never sent to any third-party server
- The web app runs entirely client-side — no backend server processes your data

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **kumarsomesh.unos@gmail.com** with details
3. Include steps to reproduce the issue if possible

You should receive a response within 48 hours.

## Best Practices for Users

- Never commit your `.env` or `.env.local` files to version control
- Use the provided `.env.example` and `.env.local.example` templates
- If you accidentally expose credentials, rotate them immediately in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- When self-hosting the web app, ensure your redirect URI matches your deployment domain exactly

# Exportify

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/kumarsomeshunos/exportify)](https://github.com/kumarsomeshunos/exportify/stargazers)

Export your Spotify data — liked songs, playlists, top tracks, artists, and more — to JSON or CSV. Available as a **web app** (runs in your browser) and a **CLI** (interactive terminal UI).

**No backend server. No data collection. Everything runs locally.**

## What You Can Export

| Category | Details |
| --- | --- |
| Liked Songs | All your saved tracks |
| Playlists & Tracks | Every playlist with full track listings |
| Top Tracks | Short (4 weeks), medium (6 months), and all-time |
| Top Artists | Short (4 weeks), medium (6 months), and all-time |
| Followed Artists | All artists you follow |
| Recently Played | Last 50 played tracks |

Export as **JSON** (single combined file) or **CSV** (one file per category).

---

## Spotify App Setup

Both the web and CLI apps need a Spotify Developer app. You only need to do this once.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **Create App**
4. Fill in the details:
   - **App name**: Exportify (or anything you like)
   - **App description**: Anything
   - **Redirect URIs**: Add these:
     - `http://127.0.0.1:8888/callback` (for local development)
     - Your production URL + `/callback` (if deploying, e.g. `https://yourdomain.com/callback`)
   - **APIs used**: Select **Web API**
5. Click **Save**
6. Go to your app's **Settings** and copy the **Client ID**

> **Note:** Exportify uses the PKCE auth flow — no client secret is needed.

---

## Web App

The web app runs entirely in your browser. No server-side processing.

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm (comes with Node.js)

### Quick Start

```sh
cd web
cp .env.local.example .env.local
```

Edit `web/.env.local` with your Spotify Client ID:

```
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
NEXT_PUBLIC_REDIRECT_URI=http://127.0.0.1:8888/callback
```

Then install and run:

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:8888](http://127.0.0.1:8888) in your browser.

### Deploying

To deploy (e.g. on Vercel), update `NEXT_PUBLIC_REDIRECT_URI` to match your production domain:

```
NEXT_PUBLIC_REDIRECT_URI=https://yourdomain.com/callback
```

Make sure this same URI is added in your Spotify app's redirect URIs.

```sh
npm run build
```

---

## CLI App

An interactive terminal UI built with [Textual](https://textual.textualize.io/).

### Prerequisites

- Python 3.13+
- [uv](https://docs.astral.sh/uv/)

### Quick Start

```sh
cp .env.example .env
```

Edit `.env` with your Spotify Client ID:

```
SPOTIPY_CLIENT_ID=your_client_id_here
SPOTIPY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

Then install and run:

```sh
uv sync
uv run exportify
```

On first run, a browser window opens for Spotify authorization. After authorizing, the TUI launches.

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `E` | Export |
| `A` | Select All |
| `N` | Select None |
| `Q` | Quit |

### Output

Data is exported to `export/<timestamp>/` with one file per category. Playlist tracks are saved in a `playlists/` subdirectory. A combined `exportify.json` is always generated.

---

## Project Structure

```
exportify/
├── main.py                 # CLI app (Textual TUI)
├── exportify.tcss           # TUI stylesheet
├── pyproject.toml           # Python project config
├── .env.example             # CLI env template
├── web/
│   ├── src/
│   │   ├── app/             # Next.js pages (landing, export, callback)
│   │   └── lib/             # Spotify auth + data fetchers, export helpers
│   ├── public/              # Static assets (favicon)
│   ├── .env.local.example   # Web env template
│   └── package.json
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── SECURITY.md
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for the security policy and how to report vulnerabilities.

## License

[MIT](LICENSE) — Somesh Kumar

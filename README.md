# Exportify

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/kumarsomeshunos/exportify)](https://github.com/kumarsomeshunos/exportify/stargazers)

Export your Spotify data — liked songs, playlists, top tracks, artists, and more — to JSON or CSV. **Transfer your Spotify library to YouTube Music.** Available as a **web app** (runs in your browser) and a **CLI** (interactive terminal UI).

**Try it now at [exportify.kumarsomesh.com](https://exportify.kumarsomesh.com)**

**No backend server. No data collection. Everything runs locally.**

**Both apps guide you through setup** — just run the app and follow the prompts. No manual config files needed.

## What You Can Do

### Export

| Category | Details |
| --- | --- |
| Liked Songs | All your saved tracks |
| Playlists & Tracks | Every playlist with full track listings |
| Top Tracks | Short (4 weeks), medium (6 months), and all-time |
| Top Artists | Short (4 weeks), medium (6 months), and all-time |
| Followed Artists | All artists you follow |
| Recently Played | Last 50 played tracks |

Export as **JSON** (single combined file) or **CSV** (one file per category).

### Transfer

| Source | Destination | What Transfers |
| --- | --- | --- |
| Spotify | YouTube Music | Liked Songs, Playlists |

Transfer uses smart confidence-based matching — each Spotify track is searched on YouTube Music, and only high-confidence matches are transferred. Low-confidence matches are flagged so you know what didn't make it.

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
     - `https://exportify.kumarsomesh.com/callback` (for the hosted version)
   - **APIs used**: Select **Web API**
5. Click **Save**
6. Go to your app's **Settings** and copy the **Client ID**

> **Note:** Exportify uses the PKCE auth flow — no client secret is needed.

---

## YouTube Music Setup (for Transfer)

To transfer your Spotify library to YouTube Music, you need to set up Google API access.

### Web App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one): click the project dropdown at the top → **New Project** → give it any name → **Create**
3. Enable the **YouTube Data API v3**:
   - In the left menu, go to **APIs & Services → Library**
   - Search for **YouTube Data API v3** → click it → click **Enable**
4. **Configure the OAuth consent screen** (required before creating credentials):
   - Go to **APIs & Services → OAuth consent screen**
   - Select **External** as the user type → click **Create**
   - Fill in the required fields:
     - **App name**: Exportify (or anything)
     - **User support email**: your Google email
     - **Developer contact email**: your Google email
   - Click **Save and Continue** through all remaining screens
   - On the **Test users** screen, click **Add users** and add your own Google account email
   - Click **Save and Continue** → **Back to Dashboard**
5. Create credentials:
   - Go to **APIs & Services → Credentials**
   - Click **+ Create Credentials → OAuth client ID**
   - Set **Application type** to **Web application**
   - Under **Authorized redirect URIs**, click **+ Add URI** and paste:
     - `http://127.0.0.1:8888/callback/youtube` (local dev)
     - Your production URL if deploying (e.g. `https://exportify.kumarsomesh.com/callback/youtube`)
   - Click **Create** → copy the **Client ID** from the dialog
6. Paste the Client ID into the Exportify transfer wizard when prompted

> **Note:** YouTube Data API has a daily quota of 10,000 units. Large library transfers may need a quota increase or may span multiple sessions.

### CLI App

The CLI uses `ytmusicapi` with OAuth. On first use, it opens a browser window for Google sign-in — no API keys or developer setup needed.

---

## Web App

The web app runs entirely in your browser. No server-side processing.

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm (comes with Node.js)

### Quick Start

```sh
cd web
npm install
npm run dev
```

Open [http://127.0.0.1:8888](http://127.0.0.1:8888) — the app walks you through creating a Spotify app and entering your Client ID. Everything is stored in your browser.

### Advanced: Environment Variables

Self-hosters can optionally pre-configure credentials via `web/.env.local`:

```sh
cp .env.local.example .env.local
# Edit with your Client ID and redirect URI
```

```
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
NEXT_PUBLIC_REDIRECT_URI=http://127.0.0.1:8888/callback

# Optional: YouTube Music transfer
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id_here
NEXT_PUBLIC_YOUTUBE_REDIRECT_URI=http://127.0.0.1:8888/callback/youtube
```

If set, the env var takes priority over the browser-stored Client ID.

### Deploying

To deploy (e.g. on Vercel), update `NEXT_PUBLIC_REDIRECT_URI` to match your production domain:

```
NEXT_PUBLIC_REDIRECT_URI=https://exportify.kumarsomesh.com/callback
NEXT_PUBLIC_YOUTUBE_REDIRECT_URI=https://exportify.kumarsomesh.com/callback/youtube
```

Make sure these same URIs are added in your Spotify app and Google Cloud project redirect URIs.

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
uv sync
uv run exportify
```

On first run, the app walks you through creating a Spotify app and entering your Client ID. It saves the credentials to `.env` automatically so you only need to do this once.

After setup, a browser window opens for Spotify authorization, then the TUI launches.

### Transfer Mode

Press **T** in the TUI to switch to Transfer mode. Connect your YouTube Music account (opens a browser for Google sign-in), then select what to transfer.

### Advanced: Manual Config

You can also configure credentials manually:

```sh
cp .env.example .env
# Edit with your Client ID
```

```
SPOTIPY_CLIENT_ID=your_client_id_here
SPOTIPY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `E` | Export (or switch to Export mode) |
| `T` | Transfer (or switch to Transfer mode) |
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
├── ytmusic.py              # YouTube Music integration (CLI)
├── exportify.tcss           # TUI stylesheet
├── pyproject.toml           # Python project config
├── .env.example             # CLI env template
├── web/
│   ├── src/
│   │   ├── app/             # Next.js pages
│   │   │   ├── page.tsx     # Landing page
│   │   │   ├── export/      # Spotify data export
│   │   │   ├── transfer/    # Spotify → YouTube Music transfer
│   │   │   └── callback/    # OAuth callbacks (Spotify + YouTube)
│   │   └── lib/
│   │       ├── spotify.ts   # Spotify auth + data fetchers
│   │       ├── youtube.ts   # YouTube Music auth + transfer
│   │       └── export.ts    # Export helpers (JSON/CSV)
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

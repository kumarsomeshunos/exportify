# Exportify

Export your Spotify data — liked songs, playlists, top tracks, artists, and more — to JSON or CSV via an interactive terminal UI.

## Setup

1. **Create a Spotify App** at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   - Set the redirect URI to `http://127.0.0.1:8888/callback`

2. **Configure credentials**
   ```sh
   cp .env.example .env
   # Edit .env with your Client ID (no secret needed — uses PKCE flow)
   ```

3. **Install dependencies**
   ```sh
   uv sync
   ```

## Usage

```sh
uv run exportify
```

This launches an interactive TUI where you can:
- **Select categories** to export using checkboxes
- **Choose format** (JSON or CSV)
- **Press Export** (or hit `E`) to start

### Keyboard Shortcuts

| Key | Action      |
| --- | ----------- |
| `E` | Export      |
| `A` | Select All  |
| `N` | Select None |
| `Q` | Quit        |

### Export Categories

- Liked Songs
- Playlists & Tracks
- Top Tracks (4 weeks / 6 months / all time)
- Top Artists (4 weeks / 6 months / all time)
- Followed Artists
- Recently Played

## Output

Data is exported to `export/<timestamp>/` with one file per category. Playlist tracks are saved in a `playlists/` subdirectory.

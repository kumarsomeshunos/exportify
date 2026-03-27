# Exportify

Export your Spotify data — liked songs, playlists, top tracks, artists, and more — to JSON or CSV.

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
# Export everything (default)
uv run exportify

# Export only liked songs
uv run exportify --liked-songs

# Export as CSV instead of JSON
uv run exportify --format csv

# Export specific data
uv run exportify --playlists --top-tracks --top-artists

# Custom output directory
uv run exportify --output my_data
```

### Available Flags

| Flag                 | Description                        |
| -------------------- | ---------------------------------- |
| `--all`              | Export everything (default)        |
| `--liked-songs`      | Liked/saved songs                  |
| `--playlists`        | Playlists and their tracks         |
| `--top-tracks`       | Top tracks (4w / 6m / all time)    |
| `--top-artists`      | Top artists (4w / 6m / all time)   |
| `--followed-artists` | Followed artists                   |
| `--recently-played`  | Recently played tracks             |
| `-f`, `--format`     | `json` (default) or `csv`          |
| `-o`, `--output`     | Output directory (default: export) |

## Output

Data is exported to `export/<timestamp>/` with one file per category. Playlist tracks are saved in a `playlists/` subdirectory.

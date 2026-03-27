"""Exportify — Export your Spotify data to JSON/CSV."""

import csv
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import spotipy
from dotenv import load_dotenv
from rich.text import Text
from spotipy.exceptions import SpotifyException
from spotipy.oauth2 import SpotifyPKCE
from textual import work
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import (
    Button,
    Checkbox,
    Footer,
    Header,
    Label,
    ProgressBar,
    RadioButton,
    RadioSet,
    RichLog,
    Rule,
    Static,
)

load_dotenv()

SCOPES = [
    "user-library-read",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-top-read",
    "user-read-recently-played",
    "user-follow-read",
]

MAX_RETRIES = 5


# ── Spotify helpers ────────────────────────────────────────────


def _api_call_with_retry(func, *args, log_fn=None, **kwargs):
    for attempt in range(MAX_RETRIES):
        try:
            return func(*args, **kwargs)
        except SpotifyException as e:
            if e.http_status == 429:
                retry_after = int(e.headers.get("Retry-After", 2 ** attempt)) if e.headers else 2 ** attempt
                if log_fn:
                    log_fn(f"Rate limited. Retrying in {retry_after}s...")
                time.sleep(retry_after)
            elif e.http_status >= 500:
                wait = 2 ** attempt
                if log_fn:
                    log_fn(f"Server error ({e.http_status}). Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
    return func(*args, **kwargs)


def get_spotify_client() -> spotipy.Spotify:
    client_id = os.getenv("SPOTIPY_CLIENT_ID")
    redirect_uri = os.getenv("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback")

    if not client_id:
        print(
            "Error: SPOTIPY_CLIENT_ID must be set.\n"
            "Copy .env.example to .env and fill in your Spotify app Client ID.\n"
            "Create an app at https://developer.spotify.com/dashboard"
        )
        sys.exit(1)

    auth_manager = SpotifyPKCE(
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=" ".join(SCOPES),
        open_browser=True,
    )

    # Show auth URL before TUI starts
    token_info = auth_manager.cache_handler.get_cached_token()
    if not token_info or auth_manager.is_token_expired(token_info):
        auth_url = auth_manager.get_authorize_url()
        print(f"\nOpen this URL to authorize Exportify:\n\n  {auth_url}\n")

    return spotipy.Spotify(auth_manager=auth_manager)


# ── Data fetchers ──────────────────────────────────────────────


def fetch_liked_songs(sp, log_fn=None):
    songs = []
    results = _api_call_with_retry(sp.current_user_saved_tracks, limit=50, log_fn=log_fn)
    while results:
        for item in results["items"]:
            track = item["track"]
            if not track:
                continue
            songs.append({
                "name": track["name"],
                "artist": ", ".join(a["name"] for a in track["artists"]),
                "album": track["album"]["name"],
                "added_at": item["added_at"],
                "duration_ms": track["duration_ms"],
                "spotify_url": track["external_urls"].get("spotify", ""),
                "uri": track["uri"],
            })
        results = _api_call_with_retry(sp.next, results, log_fn=log_fn) if results["next"] else None
    return songs


def fetch_playlists(sp, log_fn=None):
    playlists = []
    results = _api_call_with_retry(sp.current_user_playlists, limit=50, log_fn=log_fn)
    while results:
        for item in results["items"]:
            if not item:
                continue
            tracks_info = item.get("tracks") or {}
            playlists.append({
                "name": item.get("name", ""),
                "id": item["id"],
                "description": item.get("description", ""),
                "owner": item.get("owner", {}).get("display_name", ""),
                "public": item.get("public"),
                "total_tracks": tracks_info.get("total", 0),
                "spotify_url": item.get("external_urls", {}).get("spotify", ""),
                "uri": item.get("uri", ""),
            })
        results = _api_call_with_retry(sp.next, results, log_fn=log_fn) if results["next"] else None
    return playlists


def fetch_playlist_tracks(sp, playlist_id, log_fn=None):
    tracks = []
    results = _api_call_with_retry(sp.playlist_items, playlist_id, limit=100, log_fn=log_fn)
    while results:
        for item in results["items"]:
            track = item.get("track")
            if not track:
                continue
            tracks.append({
                "name": track["name"],
                "artist": ", ".join(a["name"] for a in track["artists"]),
                "album": track["album"]["name"],
                "added_at": item.get("added_at", ""),
                "duration_ms": track["duration_ms"],
                "spotify_url": track["external_urls"].get("spotify", ""),
                "uri": track["uri"],
            })
        results = _api_call_with_retry(sp.next, results, log_fn=log_fn) if results["next"] else None
    return tracks


def fetch_top_tracks(sp, time_range="medium_term", log_fn=None):
    tracks = []
    results = _api_call_with_retry(sp.current_user_top_tracks, limit=50, time_range=time_range, log_fn=log_fn)
    for i, track in enumerate(results["items"], 1):
        tracks.append({
            "rank": i,
            "name": track["name"],
            "artist": ", ".join(a["name"] for a in track["artists"]),
            "album": track["album"]["name"],
            "popularity": track["popularity"],
            "spotify_url": track["external_urls"].get("spotify", ""),
            "uri": track["uri"],
        })
    return tracks


def fetch_top_artists(sp, time_range="medium_term", log_fn=None):
    artists = []
    results = _api_call_with_retry(sp.current_user_top_artists, limit=50, time_range=time_range, log_fn=log_fn)
    for i, artist in enumerate(results["items"], 1):
        artists.append({
            "rank": i,
            "name": artist["name"],
            "genres": ", ".join(artist["genres"]),
            "followers": artist["followers"]["total"],
            "popularity": artist["popularity"],
            "spotify_url": artist["external_urls"].get("spotify", ""),
            "uri": artist["uri"],
        })
    return artists


def fetch_followed_artists(sp, log_fn=None):
    artists = []
    results = _api_call_with_retry(sp.current_user_followed_artists, limit=50, log_fn=log_fn)
    while True:
        for artist in results["artists"]["items"]:
            artists.append({
                "name": artist["name"],
                "genres": ", ".join(artist["genres"]),
                "followers": artist["followers"]["total"],
                "popularity": artist["popularity"],
                "spotify_url": artist["external_urls"].get("spotify", ""),
                "uri": artist["uri"],
            })
        if results["artists"]["cursors"]["after"]:
            results = _api_call_with_retry(
                sp.current_user_followed_artists,
                limit=50, after=results["artists"]["cursors"]["after"],
                log_fn=log_fn,
            )
        else:
            break
    return artists


def fetch_recently_played(sp, log_fn=None):
    tracks = []
    results = _api_call_with_retry(sp.current_user_recently_played, limit=50, log_fn=log_fn)
    for item in results["items"]:
        track = item["track"]
        tracks.append({
            "name": track["name"],
            "artist": ", ".join(a["name"] for a in track["artists"]),
            "album": track["album"]["name"],
            "played_at": item["played_at"],
            "duration_ms": track["duration_ms"],
            "spotify_url": track["external_urls"].get("spotify", ""),
            "uri": track["uri"],
        })
    return tracks


# ── Export helpers ──────────────────────────────────────────────


def save_json(data, filepath):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def save_csv(data, filepath):
    if not data:
        return
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)


def export_data(data, name, out_dir, fmt):
    if fmt == "json":
        path = out_dir / f"{name}.json"
        save_json(data, path)
    else:
        path = out_dir / f"{name}.csv"
        save_csv(data, path)
    return path


# ── Textual TUI ───────────────────────────────────────────────


EXPORT_OPTIONS = [
    ("liked_songs", "Liked Songs"),
    ("playlists", "Playlists & Tracks"),
    ("top_tracks", "Top Tracks"),
    ("top_artists", "Top Artists"),
    ("followed_artists", "Followed Artists"),
    ("recently_played", "Recently Played"),
]


class ExportifyApp(App):
    TITLE = "Exportify"
    SUB_TITLE = "Spotify Data Exporter"
    CSS_PATH = "exportify.tcss"

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("e", "export", "Export"),
        ("a", "select_all", "Select All"),
        ("n", "select_none", "Select None"),
    ]

    def __init__(self, sp: spotipy.Spotify, user_info: dict):
        super().__init__()
        self.sp = sp
        self.user_info = user_info

    def compose(self) -> ComposeResult:
        yield Header()
        yield Footer()
        with Horizontal(id="main"):
            with Vertical(id="sidebar"):
                yield Static(f"  {self.user_info['display_name']}", id="user-info")
                yield Rule()
                yield Label("Export Categories", id="section-label")
                for key, label in EXPORT_OPTIONS:
                    yield Checkbox(label, value=True, id=f"cb-{key}")
                yield Rule()
                yield Label("Format", id="format-label")
                with RadioSet(id="format-radio"):
                    yield RadioButton("JSON", value=True, id="fmt-json")
                    yield RadioButton("CSV", id="fmt-csv")
                yield Rule()
                yield Button("Export", variant="success", id="export-btn")
            with Vertical(id="content"):
                yield ProgressBar(total=100, show_eta=False, id="progress")
                yield RichLog(highlight=True, markup=True, id="log")

    def on_mount(self) -> None:
        log = self.query_one("#log", RichLog)
        log.write(Text.from_markup("[bold green]Welcome to Exportify![/]"))
        log.write(Text.from_markup(f"Logged in as [bold]{self.user_info['display_name']}[/] ({self.user_info['id']})"))
        log.write(Text.from_markup("\nSelect categories and press [bold]Export[/] or hit [bold]E[/] to start.\n"))

    def _log(self, message: str) -> None:
        log_widget = self.query_one("#log", RichLog)
        log_widget.write(Text.from_markup(message))

    def _get_selected(self) -> list[str]:
        selected = []
        for key, _ in EXPORT_OPTIONS:
            cb = self.query_one(f"#cb-{key}", Checkbox)
            if cb.value:
                selected.append(key)
        return selected

    def _get_format(self) -> str:
        fmt_json = self.query_one("#fmt-json", RadioButton)
        return "json" if fmt_json.value else "csv"

    def action_export(self) -> None:
        self.run_export()

    def action_select_all(self) -> None:
        for key, _ in EXPORT_OPTIONS:
            self.query_one(f"#cb-{key}", Checkbox).value = True

    def action_select_none(self) -> None:
        for key, _ in EXPORT_OPTIONS:
            self.query_one(f"#cb-{key}", Checkbox).value = False

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "export-btn":
            self.run_export()

    @work(thread=True)
    def run_export(self) -> None:
        selected = self._get_selected()
        if not selected:
            self.call_from_thread(self._log, "[bold yellow]No categories selected.[/]")
            return

        fmt = self._get_format()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_dir = Path("export") / timestamp

        btn = self.query_one("#export-btn", Button)
        progress = self.query_one("#progress", ProgressBar)

        self.call_from_thread(setattr, btn, "disabled", True)
        self.call_from_thread(self._log, f"\n[bold green]Starting export...[/] (format: {fmt})")

        # Calculate total steps
        total_steps = 0
        for s in selected:
            if s in ("top_tracks", "top_artists"):
                total_steps += 3
            else:
                total_steps += 1
        total_steps += 1  # combined JSON

        self.call_from_thread(setattr, progress, "total", total_steps)
        current_step = 0

        combined = {}

        def log(msg):
            self.call_from_thread(self._log, msg)

        def advance():
            nonlocal current_step
            current_step += 1
            self.call_from_thread(progress.update, progress=current_step)

        try:
            if "liked_songs" in selected:
                log("  [cyan]Fetching liked songs...[/]")
                liked = fetch_liked_songs(self.sp, log_fn=log)
                export_data(liked, "liked_songs", out_dir, fmt)
                combined["liked_songs"] = liked
                log(f"  [green]✓[/] Liked songs: [bold]{len(liked)}[/] items")
                advance()

            if "playlists" in selected:
                log("  [cyan]Fetching playlists...[/]")
                playlists = fetch_playlists(self.sp, log_fn=log)
                export_data(playlists, "playlists", out_dir, fmt)
                log(f"  [green]✓[/] Playlists: [bold]{len(playlists)}[/]")

                playlists_dir = out_dir / "playlists"
                playlist_tracks_combined = {}
                for pl in playlists:
                    log(f"    [dim]Fetching: {pl['name'][:50]}...[/]")
                    try:
                        tracks = fetch_playlist_tracks(self.sp, pl["id"], log_fn=log)
                    except SpotifyException as e:
                        log(f"    [yellow]⚠[/] Skipped '{pl['name'][:50]}' ({e.http_status}: access restricted)")
                        continue
                    safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in pl["name"])
                    export_data(tracks, safe_name.strip(), playlists_dir, fmt)
                    playlist_tracks_combined[pl["name"]] = tracks
                    log(f"    [green]✓[/] {pl['name'][:50]} ({len(tracks)} tracks)")

                combined["playlists"] = playlists
                combined["playlist_tracks"] = playlist_tracks_combined
                advance()

            if "top_tracks" in selected:
                for time_range, label in [("short_term", "4 weeks"), ("medium_term", "6 months"), ("long_term", "all time")]:
                    log(f"  [cyan]Fetching top tracks ({label})...[/]")
                    tracks = fetch_top_tracks(self.sp, time_range, log_fn=log)
                    export_data(tracks, f"top_tracks_{time_range}", out_dir, fmt)
                    combined[f"top_tracks_{time_range}"] = tracks
                    log(f"  [green]✓[/] Top tracks ({label}): [bold]{len(tracks)}[/] items")
                    advance()

            if "top_artists" in selected:
                for time_range, label in [("short_term", "4 weeks"), ("medium_term", "6 months"), ("long_term", "all time")]:
                    log(f"  [cyan]Fetching top artists ({label})...[/]")
                    artists = fetch_top_artists(self.sp, time_range, log_fn=log)
                    export_data(artists, f"top_artists_{time_range}", out_dir, fmt)
                    combined[f"top_artists_{time_range}"] = artists
                    log(f"  [green]✓[/] Top artists ({label}): [bold]{len(artists)}[/] items")
                    advance()

            if "followed_artists" in selected:
                log("  [cyan]Fetching followed artists...[/]")
                followed = fetch_followed_artists(self.sp, log_fn=log)
                export_data(followed, "followed_artists", out_dir, fmt)
                combined["followed_artists"] = followed
                log(f"  [green]✓[/] Followed artists: [bold]{len(followed)}[/] items")
                advance()

            if "recently_played" in selected:
                log("  [cyan]Fetching recently played...[/]")
                recent = fetch_recently_played(self.sp, log_fn=log)
                export_data(recent, "recently_played", out_dir, fmt)
                combined["recently_played"] = recent
                log(f"  [green]✓[/] Recently played: [bold]{len(recent)}[/] items")
                advance()

            # Save combined JSON
            combined_path = out_dir / "exportify.json"
            save_json(combined, combined_path)
            advance()

            log(f"\n[bold green]Done![/] Data exported to [bold]{out_dir}[/]")
            log(f"  Combined JSON: [bold]{combined_path}[/]")

        except SpotifyException as e:
            if e.http_status == 401:
                log("[bold red]Error:[/] Authentication expired. Delete .cache and restart.")
            elif e.http_status == 403:
                log("[bold red]Error:[/] 403 Forbidden. The app owner may need Spotify Premium.")
            else:
                log(f"[bold red]Error:[/] Spotify API error {e.http_status}: {e.msg}")
        except Exception as e:
            log(f"[bold red]Error:[/] {e}")
        finally:
            self.call_from_thread(setattr, btn, "disabled", False)


def main():
    # Auth happens before TUI starts (needs terminal for browser redirect)
    sp = get_spotify_client()

    try:
        user_info = sp.current_user()
    except SpotifyException as e:
        if e.http_status == 401:
            print("Error: Authentication failed. Delete .cache and try again.")
        elif e.http_status == 403:
            print("Error: 403 Forbidden. App owner needs Spotify Premium.")
        else:
            print(f"Error: Spotify API error {e.http_status}: {e.msg}")
        sys.exit(1)

    app = ExportifyApp(sp, user_info)
    app.run()


if __name__ == "__main__":
    main()

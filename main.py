"""Exportify — Export your Spotify data to JSON/CSV."""

import csv
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import spotipy
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from spotipy.oauth2 import SpotifyOAuth

load_dotenv()

console = Console()

SCOPES = [
    "user-library-read",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-top-read",
    "user-read-recently-played",
    "user-follow-read",
]


def get_spotify_client() -> spotipy.Spotify:
    client_id = os.getenv("SPOTIPY_CLIENT_ID")
    client_secret = os.getenv("SPOTIPY_CLIENT_SECRET")
    redirect_uri = os.getenv("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback")

    if not client_id or not client_secret:
        console.print(
            "[bold red]Error:[/] SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET must be set.\n"
            "Copy .env.example to .env and fill in your Spotify app credentials.\n"
            "Create an app at https://developer.spotify.com/dashboard"
        )
        sys.exit(1)

    auth_manager = SpotifyOAuth(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        scope=" ".join(SCOPES),
        open_browser=True,
    )

    # Show the auth URL so the user can open it in any browser
    token_info = auth_manager.cache_handler.get_cached_token()
    if not token_info or auth_manager.is_token_expired(token_info):
        auth_url = auth_manager.get_authorize_url()
        console.print(
            Panel(
                f"[bold]Open this URL to authorize Exportify:[/]\n\n[link={auth_url}]{auth_url}[/link]",
                title="[yellow]Spotify Auth[/yellow]",
                border_style="yellow",
            )
        )

    return spotipy.Spotify(auth_manager=auth_manager)


# ── Data fetchers ──────────────────────────────────────────────


def fetch_liked_songs(sp: spotipy.Spotify) -> list[dict]:
    songs = []
    results = sp.current_user_saved_tracks(limit=50)
    while results:
        for item in results["items"]:
            track = item["track"]
            songs.append({
                "name": track["name"],
                "artist": ", ".join(a["name"] for a in track["artists"]),
                "album": track["album"]["name"],
                "added_at": item["added_at"],
                "duration_ms": track["duration_ms"],
                "spotify_url": track["external_urls"].get("spotify", ""),
                "uri": track["uri"],
            })
        results = sp.next(results) if results["next"] else None
    return songs


def fetch_playlists(sp: spotipy.Spotify) -> list[dict]:
    playlists = []
    results = sp.current_user_playlists(limit=50)
    while results:
        for item in results["items"]:
            playlists.append({
                "name": item["name"],
                "id": item["id"],
                "description": item.get("description", ""),
                "owner": item["owner"]["display_name"],
                "public": item["public"],
                "total_tracks": item["tracks"]["total"],
                "spotify_url": item["external_urls"].get("spotify", ""),
                "uri": item["uri"],
            })
        results = sp.next(results) if results["next"] else None
    return playlists


def fetch_playlist_tracks(sp: spotipy.Spotify, playlist_id: str) -> list[dict]:
    tracks = []
    results = sp.playlist_items(playlist_id, limit=100)
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
        results = sp.next(results) if results["next"] else None
    return tracks


def fetch_top_tracks(sp: spotipy.Spotify, time_range: str = "medium_term") -> list[dict]:
    tracks = []
    results = sp.current_user_top_tracks(limit=50, time_range=time_range)
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


def fetch_top_artists(sp: spotipy.Spotify, time_range: str = "medium_term") -> list[dict]:
    artists = []
    results = sp.current_user_top_artists(limit=50, time_range=time_range)
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


def fetch_followed_artists(sp: spotipy.Spotify) -> list[dict]:
    artists = []
    results = sp.current_user_followed_artists(limit=50)
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
            results = sp.current_user_followed_artists(
                limit=50, after=results["artists"]["cursors"]["after"]
            )
        else:
            break
    return artists


def fetch_recently_played(sp: spotipy.Spotify) -> list[dict]:
    tracks = []
    results = sp.current_user_recently_played(limit=50)
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


def save_json(data: list[dict], filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def save_csv(data: list[dict], filepath: Path) -> None:
    if not data:
        return
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)


def export_data(data: list[dict], name: str, out_dir: Path, fmt: str) -> Path:
    if fmt == "json":
        path = out_dir / f"{name}.json"
        save_json(data, path)
    else:
        path = out_dir / f"{name}.csv"
        save_csv(data, path)
    return path


# ── CLI ────────────────────────────────────────────────────────


def print_summary(label: str, count: int) -> None:
    console.print(f"  [green]✓[/] {label}: [bold]{count}[/] items")


def main():
    console.print(Panel.fit("[bold green]Exportify[/] — Spotify Data Exporter", border_style="green"))

    import argparse

    parser = argparse.ArgumentParser(description="Export your Spotify data")
    parser.add_argument(
        "-f", "--format",
        choices=["json", "csv"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "-o", "--output",
        default="export",
        help="Output directory (default: export)",
    )
    parser.add_argument(
        "--liked-songs", action="store_true", default=False,
        help="Export liked songs",
    )
    parser.add_argument(
        "--playlists", action="store_true", default=False,
        help="Export playlists and their tracks",
    )
    parser.add_argument(
        "--top-tracks", action="store_true", default=False,
        help="Export top tracks",
    )
    parser.add_argument(
        "--top-artists", action="store_true", default=False,
        help="Export top artists",
    )
    parser.add_argument(
        "--followed-artists", action="store_true", default=False,
        help="Export followed artists",
    )
    parser.add_argument(
        "--recently-played", action="store_true", default=False,
        help="Export recently played tracks",
    )
    parser.add_argument(
        "--all", action="store_true", default=False,
        help="Export everything",
    )
    args = parser.parse_args()

    # If no specific flags, default to --all
    export_all = args.all or not any([
        args.liked_songs, args.playlists, args.top_tracks,
        args.top_artists, args.followed_artists, args.recently_played,
    ])

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.output) / timestamp
    fmt = args.format

    sp = get_spotify_client()

    # Verify connection
    try:
        user = sp.current_user()
    except spotipy.exceptions.SpotifyException as e:
        if e.http_status == 403:
            console.print(
                "[bold red]Error:[/] Spotify returned 403 Forbidden.\n"
                "This usually means the app owner needs an active [bold]Spotify Premium[/] subscription.\n"
                "See: https://developer.spotify.com/documentation/web-api"
            )
            sys.exit(1)
        raise
    console.print(f"\n[bold]Logged in as:[/] {user['display_name']} ({user['id']})\n")

    combined: dict[str, any] = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:

        if export_all or args.liked_songs:
            task = progress.add_task("Fetching liked songs...", total=None)
            liked = fetch_liked_songs(sp)
            export_data(liked, "liked_songs", out_dir, fmt)
            combined["liked_songs"] = liked
            progress.update(task, description="Liked songs")
            progress.stop_task(task)
            print_summary("Liked songs", len(liked))

        if export_all or args.playlists:
            task = progress.add_task("Fetching playlists...", total=None)
            playlists = fetch_playlists(sp)
            export_data(playlists, "playlists", out_dir, fmt)
            progress.update(task, description="Playlists fetched")
            progress.stop_task(task)
            print_summary("Playlists", len(playlists))

            # Export each playlist's tracks
            playlists_dir = out_dir / "playlists"
            playlist_tracks_combined = {}
            for pl in playlists:
                task = progress.add_task(f"  Fetching: {pl['name'][:40]}...", total=None)
                tracks = fetch_playlist_tracks(sp, pl["id"])
                safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in pl["name"])
                export_data(tracks, safe_name.strip(), playlists_dir, fmt)
                playlist_tracks_combined[pl["name"]] = tracks
                progress.update(task, description=f"  {pl['name'][:40]} ({len(tracks)} tracks)")
                progress.stop_task(task)

            combined["playlists"] = playlists
            combined["playlist_tracks"] = playlist_tracks_combined

        if export_all or args.top_tracks:
            for time_range, label in [("short_term", "4 weeks"), ("medium_term", "6 months"), ("long_term", "all time")]:
                task = progress.add_task(f"Fetching top tracks ({label})...", total=None)
                tracks = fetch_top_tracks(sp, time_range)
                export_data(tracks, f"top_tracks_{time_range}", out_dir, fmt)
                combined[f"top_tracks_{time_range}"] = tracks
                progress.update(task, description=f"Top tracks ({label})")
                progress.stop_task(task)
                print_summary(f"Top tracks ({label})", len(tracks))

        if export_all or args.top_artists:
            for time_range, label in [("short_term", "4 weeks"), ("medium_term", "6 months"), ("long_term", "all time")]:
                task = progress.add_task(f"Fetching top artists ({label})...", total=None)
                artists = fetch_top_artists(sp, time_range)
                export_data(artists, f"top_artists_{time_range}", out_dir, fmt)
                combined[f"top_artists_{time_range}"] = artists
                progress.update(task, description=f"Top artists ({label})")
                progress.stop_task(task)
                print_summary(f"Top artists ({label})", len(artists))

        if export_all or args.followed_artists:
            task = progress.add_task("Fetching followed artists...", total=None)
            followed = fetch_followed_artists(sp)
            export_data(followed, "followed_artists", out_dir, fmt)
            combined["followed_artists"] = followed
            progress.update(task, description="Followed artists")
            progress.stop_task(task)
            print_summary("Followed artists", len(followed))

        if export_all or args.recently_played:
            task = progress.add_task("Fetching recently played...", total=None)
            recent = fetch_recently_played(sp)
            export_data(recent, "recently_played", out_dir, fmt)
            combined["recently_played"] = recent
            progress.update(task, description="Recently played")
            progress.stop_task(task)
            print_summary("Recently played", len(recent))

    # Always save a combined JSON with all exported data
    combined_path = out_dir / "exportify.json"
    save_json(combined, combined_path)
    console.print(f"\n[bold green]Done![/] Data exported to [bold]{out_dir}[/]")
    console.print(f"  Combined JSON: [bold]{combined_path}[/]")


if __name__ == "__main__":
    main()

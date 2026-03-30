"""YouTube Music integration for Exportify — transfer Spotify data to YouTube Music."""

import re
import time
from pathlib import Path

from ytmusicapi import YTMusic

# ── Constants ──────────────────────────────────────────────────

OAUTH_FILE = "ytmusic_oauth.json"
MATCH_CONFIDENCE_THRESHOLD = 0.6  # Auto-accept matches above this score
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


# ── Auth ───────────────────────────────────────────────────────


def _interactive_ytmusic_setup() -> str:
    """Guide the user through first-time YouTube Music OAuth setup."""
    print(
        "\n  ╔══════════════════════════════════════════╗\n"
        "  ║  YouTube Music — First-Time Setup        ║\n"
        "  ╚══════════════════════════════════════════╝\n"
    )
    print("  Exportify will open a browser window for Google sign-in.")
    print("  Sign in with the Google account linked to your YouTube Music.\n")
    print("  No API keys or developer setup needed — just sign in and authorize.\n")

    input("  Press Enter to continue...")

    oauth_path = Path(OAUTH_FILE)
    YTMusic.setup_oauth(filepath=str(oauth_path), open_browser=True)

    print(f"\n  ✓ Credentials saved to {oauth_path.resolve()}")
    print("  You won't need to do this again.\n")
    return str(oauth_path)


def get_ytmusic_client() -> YTMusic:
    """Return an authenticated YTMusic client, running setup if needed."""
    oauth_path = Path(OAUTH_FILE)

    if not oauth_path.exists():
        _interactive_ytmusic_setup()

    return YTMusic(str(oauth_path))


# ── Song matching ──────────────────────────────────────────────


def _normalize(text: str) -> str:
    """Normalize text for comparison: lowercase, strip punctuation/extras."""
    text = text.lower().strip()
    # Remove common suffixes like "(feat. ...)", "(Remastered)", etc.
    text = re.sub(r"\s*[\(\[].*?[\)\]]", "", text)
    # Remove non-alphanumeric (keep spaces)
    text = re.sub(r"[^\w\s]", "", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _match_confidence(
    spotify_name: str,
    spotify_artist: str,
    ytm_title: str,
    ytm_artists: list[dict],
) -> float:
    """
    Score how well a YouTube Music result matches a Spotify track.
    Returns 0.0 (no match) to 1.0 (perfect match).
    """
    norm_sp_name = _normalize(spotify_name)
    norm_sp_artist = _normalize(spotify_artist.split(",")[0])  # Primary artist
    norm_yt_title = _normalize(ytm_title)
    norm_yt_artists = [_normalize(a.get("name", "")) for a in ytm_artists]

    # Title similarity (simple containment + equality check)
    if norm_sp_name == norm_yt_title:
        title_score = 1.0
    elif norm_sp_name in norm_yt_title or norm_yt_title in norm_sp_name:
        title_score = 0.8
    else:
        # Word overlap
        sp_words = set(norm_sp_name.split())
        yt_words = set(norm_yt_title.split())
        if sp_words and yt_words:
            overlap = len(sp_words & yt_words) / max(len(sp_words), len(yt_words))
            title_score = overlap * 0.7
        else:
            title_score = 0.0

    # Artist similarity
    artist_score = 0.0
    for yt_artist in norm_yt_artists:
        if norm_sp_artist == yt_artist:
            artist_score = 1.0
            break
        elif norm_sp_artist in yt_artist or yt_artist in norm_sp_artist:
            artist_score = 0.8
            break

    # Weighted combination: title matters more
    return title_score * 0.6 + artist_score * 0.4


def search_song(ytmusic: YTMusic, name: str, artist: str, log_fn=None) -> dict | None:
    """
    Search YouTube Music for a song matching the given name and artist.
    Returns the best match dict with videoId, or None if no confident match found.

    Match dict: {"videoId": str, "title": str, "artists": str, "confidence": float}
    """
    query = f"{name} {artist.split(',')[0]}"

    for attempt in range(MAX_RETRIES):
        try:
            results = ytmusic.search(query, filter="songs", limit=5)
            break
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                if log_fn:
                    log_fn(f"      [dim]Search retry {attempt + 1}...[/]")
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                if log_fn:
                    log_fn(f"      [yellow]⚠ Search failed: {e}[/]")
                return None

    if not results:
        return None

    best_match = None
    best_confidence = 0.0

    for result in results:
        if result.get("resultType") != "song":
            continue

        video_id = result.get("videoId")
        if not video_id:
            continue

        confidence = _match_confidence(
            name, artist,
            result.get("title", ""),
            result.get("artists", []),
        )

        if confidence > best_confidence:
            best_confidence = confidence
            artist_names = ", ".join(a.get("name", "") for a in result.get("artists", []))
            best_match = {
                "videoId": video_id,
                "title": result.get("title", ""),
                "artists": artist_names,
                "confidence": confidence,
            }

    if best_match and best_match["confidence"] >= MATCH_CONFIDENCE_THRESHOLD:
        return best_match

    return None


# ── Transfer operations ───────────────────────────────────────


def transfer_liked_songs(
    spotify_tracks: list[dict],
    ytmusic: YTMusic,
    log_fn=None,
    progress_fn=None,
) -> dict:
    """
    Transfer Spotify liked songs to YouTube Music by rating them as LIKE.

    Returns stats dict: {"matched": int, "not_found": int, "errors": int, "total": int}
    """
    stats = {"matched": 0, "not_found": 0, "errors": 0, "total": len(spotify_tracks)}

    for i, track in enumerate(spotify_tracks, 1):
        name = track.get("name", "")
        artist = track.get("artist", "")

        match = search_song(ytmusic, name, artist, log_fn=log_fn)

        if match:
            try:
                ytmusic.rate_song(match["videoId"], "LIKE")
                stats["matched"] += 1
                if log_fn:
                    conf_pct = int(match["confidence"] * 100)
                    log_fn(
                        f"    [green]✓[/] ({i}/{stats['total']}) "
                        f"{name} → {match['title']} by {match['artists']} "
                        f"[dim]({conf_pct}% match)[/]"
                    )
            except Exception as e:
                stats["errors"] += 1
                if log_fn:
                    log_fn(f"    [red]✗[/] ({i}/{stats['total']}) {name} — Error: {e}")
        else:
            stats["not_found"] += 1
            if log_fn:
                log_fn(f"    [yellow]?[/] ({i}/{stats['total']}) {name} by {artist} — No match found")

        if progress_fn:
            progress_fn()

        # Rate limit: small delay between operations
        time.sleep(0.3)

    return stats


def transfer_playlist(
    playlist_name: str,
    spotify_tracks: list[dict],
    ytmusic: YTMusic,
    log_fn=None,
    progress_fn=None,
) -> dict:
    """
    Transfer a Spotify playlist to YouTube Music:
    1. Search all tracks on YTM
    2. Create a new playlist
    3. Add matched tracks

    Returns stats dict: {"matched": int, "not_found": int, "errors": int, "total": int, "playlist_id": str | None}
    """
    stats = {"matched": 0, "not_found": 0, "errors": 0, "total": len(spotify_tracks), "playlist_id": None}

    if log_fn:
        log_fn(f"    [cyan]Searching for {len(spotify_tracks)} tracks...[/]")

    # Phase 1: Search for all tracks
    matched_ids = []
    for i, track in enumerate(spotify_tracks, 1):
        name = track.get("name", "")
        artist = track.get("artist", "")

        match = search_song(ytmusic, name, artist, log_fn=log_fn)

        if match:
            matched_ids.append(match["videoId"])
            stats["matched"] += 1
            if log_fn:
                conf_pct = int(match["confidence"] * 100)
                log_fn(
                    f"      [green]✓[/] ({i}/{stats['total']}) "
                    f"{name} → {match['title']} [dim]({conf_pct}%)[/]"
                )
        else:
            stats["not_found"] += 1
            if log_fn:
                log_fn(f"      [yellow]?[/] ({i}/{stats['total']}) {name} — Not found")

        if progress_fn:
            progress_fn()

        time.sleep(0.3)

    # Phase 2: Create playlist and add tracks
    if matched_ids:
        if log_fn:
            log_fn(f"    [cyan]Creating playlist '{playlist_name}'...[/]")

        try:
            playlist_id = ytmusic.create_playlist(
                title=playlist_name,
                description=f"Transferred from Spotify via Exportify",
                privacy_status="PRIVATE",
                video_ids=matched_ids,
            )
            stats["playlist_id"] = playlist_id
            if log_fn:
                log_fn(
                    f"    [green]✓[/] Created playlist '{playlist_name}' "
                    f"with {len(matched_ids)} tracks"
                )
        except Exception as e:
            stats["errors"] += 1
            if log_fn:
                log_fn(f"    [red]✗[/] Failed to create playlist: {e}")
    else:
        if log_fn:
            log_fn(f"    [yellow]⚠[/] No matches found — skipping playlist creation")

    return stats

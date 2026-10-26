"""MusicBrainz-backed search and Earworm entry operations."""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Dict, List, Optional
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from api.database import MoodDatabase


class EarwormService:
    def __init__(self, db: MoodDatabase):
        self.db = db
        self._cache: Dict[str, tuple[float, List[Dict]]] = {}
        self._lock = threading.Lock()
        self._last_musicbrainz_request = 0.0

    def search_music(self, query: str) -> List[Dict]:
        normalized = " ".join(query.split())
        if len(normalized) < 2:
            return []
        cached = self._cache.get(normalized.lower())
        if cached and time.time() - cached[0] < 300:
            return cached[1]

        # MusicBrainz asks clients to identify themselves and recommends no more
        # than roughly one request per second from an IP address.
        with self._lock:
            wait = 1.05 - (time.time() - self._last_musicbrainz_request)
            if wait > 0:
                time.sleep(wait)
            url = (
                "https://musicbrainz.org/ws/2/recording?fmt=json&limit=12&query="
                + quote_plus(normalized)
            )
            user_agent = os.getenv(
                "MUSICBRAINZ_USER_AGENT",
                "Earworm/1.1 (https://github.com/shirsakm/nightlio; contact@example.com)",
            )
            request = Request(url, headers={"User-Agent": user_agent, "Accept": "application/json"})
            try:
                with urlopen(request, timeout=12) as response:
                    data = json.loads(response.read().decode("utf-8"))
            finally:
                self._last_musicbrainz_request = time.time()

        results = [self._normalise_recording(item) for item in data.get("recordings", [])]
        self._cache[normalized.lower()] = (time.time(), results)
        return results

    @staticmethod
    def _normalise_recording(item: Dict) -> Dict:
        credits = item.get("artist-credit") or []
        artist_name = " & ".join(
            str(credit.get("name") or credit.get("artist", {}).get("name") or "")
            for credit in credits
        ).strip(" &") or "Unknown artist"
        release = (item.get("releases") or [{}])[0]
        release_mbid = release.get("id")
        return {
            "recording_mbid": item.get("id"),
            "title": item.get("title") or "Untitled recording",
            "artist_name": artist_name,
            "release_mbid": release_mbid,
            "release_group_mbid": (release.get("release-group") or {}).get("id"),
            "release_name": release.get("title"),
            "release_date": release.get("date"),
            "cover_art_url": (
                f"https://coverartarchive.org/release/{release_mbid}/front-250"
                if release_mbid else None
            ),
            "musicbrainz_url": f"https://musicbrainz.org/recording/{item.get('id')}" if item.get("id") else None,
        }

    def list_entries(self, user_id: int, start_date: Optional[str], end_date: Optional[str]) -> List[Dict]:
        return self.db.get_earworm_entries(user_id, start_date, end_date)

    def create_entry(self, user_id: int, payload: Dict) -> int:
        required = ("entry_date", "display_time", "recording_mbid", "title", "artist_name")
        missing = [key for key in required if not str(payload.get(key, "")).strip()]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")
        return self.db.create_earworm_entry(user_id, {**payload, "note": payload.get("note", "")})

    def update_entry(self, user_id: int, entry_id: int, payload: Dict) -> Optional[Dict]:
        return self.db.update_earworm_entry(user_id, entry_id, payload)

    def delete_entry(self, user_id: int, entry_id: int) -> bool:
        return self.db.delete_earworm_entry(user_id, entry_id)

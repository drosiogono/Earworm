"""Earworm music journal persistence for the Nightlio database facade."""

from __future__ import annotations

import sqlite3
from typing import Dict, List, Optional

try:
    from .database_common import DatabaseConnectionMixin
except ImportError:  # pragma: no cover - direct script fallback
    from database_common import DatabaseConnectionMixin  # type: ignore


class EarwormMixin(DatabaseConnectionMixin):
    """Stores one or more music memories per calendar day."""

    def _create_earworm_tables(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS earworm_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                entry_date TEXT NOT NULL,
                display_time TEXT NOT NULL,
                recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                recording_mbid TEXT NOT NULL,
                release_mbid TEXT,
                release_group_mbid TEXT,
                title TEXT NOT NULL,
                artist_name TEXT NOT NULL,
                release_name TEXT,
                release_date TEXT,
                cover_art_url TEXT,
                metadata_snapshot TEXT,
                mood TEXT,
                note TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_earworm_entries_user_date
            ON earworm_entries (user_id, entry_date, display_time)
            """
        )

    def create_earworm_entry(self, user_id: int, payload: Dict) -> int:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO earworm_entries (
                    user_id, entry_date, display_time, recording_mbid,
                    release_mbid, release_group_mbid, title, artist_name,
                    release_name, release_date, cover_art_url,
                    metadata_snapshot, mood, note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    payload["entry_date"],
                    payload["display_time"],
                    payload["recording_mbid"],
                    payload.get("release_mbid"),
                    payload.get("release_group_mbid"),
                    payload["title"],
                    payload["artist_name"],
                    payload.get("release_name"),
                    payload.get("release_date"),
                    payload.get("cover_art_url"),
                    payload.get("metadata_snapshot"),
                    payload.get("mood"),
                    payload.get("note", ""),
                ),
            )
            conn.commit()
            return int(cursor.lastrowid or 0)

    def get_earworm_entries(
        self, user_id: int, start_date: Optional[str] = None, end_date: Optional[str] = None
    ) -> List[Dict]:
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            query = "SELECT * FROM earworm_entries WHERE user_id = ?"
            params: List[object] = [user_id]
            if start_date:
                query += " AND entry_date >= ?"
                params.append(start_date)
            if end_date:
                query += " AND entry_date <= ?"
                params.append(end_date)
            query += " ORDER BY entry_date ASC, display_time ASC, id ASC"
            return [dict(row) for row in conn.execute(query, params).fetchall()]

    def update_earworm_entry(self, user_id: int, entry_id: int, payload: Dict) -> Optional[Dict]:
        fields = []
        params: List[object] = []
        for key in ("entry_date", "display_time", "note", "mood"):
            if key in payload:
                fields.append(f"{key} = ?")
                params.append(payload[key])
        if not fields:
            return self.get_earworm_entry(user_id, entry_id)
        fields.append("updated_at = CURRENT_TIMESTAMP")
        params.extend([entry_id, user_id])
        with self._connect() as conn:
            result = conn.execute(
                f"UPDATE earworm_entries SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
                params,
            )
            conn.commit()
            if result.rowcount == 0:
                return None
        return self.get_earworm_entry(user_id, entry_id)

    def get_earworm_entry(self, user_id: int, entry_id: int) -> Optional[Dict]:
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM earworm_entries WHERE id = ? AND user_id = ?",
                (entry_id, user_id),
            ).fetchone()
            return dict(row) if row else None

    def delete_earworm_entry(self, user_id: int, entry_id: int) -> bool:
        with self._connect() as conn:
            result = conn.execute(
                "DELETE FROM earworm_entries WHERE id = ? AND user_id = ?",
                (entry_id, user_id),
            )
            conn.commit()
            return result.rowcount > 0

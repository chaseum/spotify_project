from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

EXPECTED_COLUMNS = 6
DEFAULT_OUTPUT_PATH = Path("ml/data/sessions.parquet")


def _parse_timestamp(raw_value: str) -> datetime | None:
    value = raw_value.strip()
    if value.endswith("Z"):
        value = f"{value[:-1]}+00:00"

    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)

    return parsed


def _empty_output_table() -> pa.Table:
    schema = pa.schema(
        [
            ("session_id", pa.string()),
            ("artist_name", pa.string()),
            ("track_name", pa.string()),
            ("ts", pa.timestamp("us", tz="UTC")),
        ]
    )
    return pa.Table.from_pydict(
        {
            "session_id": [],
            "artist_name": [],
            "track_name": [],
            "ts": [],
        },
        schema=schema,
    )


def build_lastfm_sessions(
    input_path: Path,
    output_path: Path,
    max_gap_hours: float = 2.0,
) -> dict[str, int]:
    if max_gap_hours < 0:
        raise ValueError("max_gap_hours must be non-negative")

    stats: dict[str, int] = {
        "rows_read": 0,
        "rows_written": 0,
        "rows_skipped": 0,
        "rows_skipped_missing_columns": 0,
        "rows_skipped_missing_required": 0,
        "rows_skipped_invalid_timestamp": 0,
    }

    max_gap = timedelta(hours=max_gap_hours)
    valid_rows: list[dict[str, Any]] = []

    with input_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter="\t")
        for source_line_index, row in enumerate(reader):
            stats["rows_read"] += 1

            if len(row) < EXPECTED_COLUMNS:
                stats["rows_skipped_missing_columns"] += 1
                continue

            user_id = row[0].strip()
            timestamp_raw = row[1].strip()
            artist_name = row[3].strip()
            track_name = row[5].strip()

            if not user_id or not timestamp_raw or not artist_name or not track_name:
                stats["rows_skipped_missing_required"] += 1
                continue

            parsed_ts = _parse_timestamp(timestamp_raw)
            if parsed_ts is None:
                stats["rows_skipped_invalid_timestamp"] += 1
                continue

            valid_rows.append(
                {
                    "user_id": user_id,
                    "ts": parsed_ts,
                    "artist_name": artist_name,
                    "track_name": track_name,
                    "source_line_index": source_line_index,
                }
            )

    stats["rows_skipped"] = (
        stats["rows_skipped_missing_columns"]
        + stats["rows_skipped_missing_required"]
        + stats["rows_skipped_invalid_timestamp"]
    )

    valid_rows.sort(key=lambda item: (item["user_id"], item["ts"], item["source_line_index"]))

    session_counters: dict[str, int] = {}
    previous_ts_by_user: dict[str, datetime] = {}
    sessionized_rows: list[dict[str, Any]] = []

    for row in valid_rows:
        user_id = row["user_id"]
        row_ts = row["ts"]
        last_ts = previous_ts_by_user.get(user_id)

        if last_ts is None or (row_ts - last_ts) > max_gap:
            session_counters[user_id] = session_counters.get(user_id, 0) + 1

        sessionized_rows.append(
            {
                "session_id": f"{user_id}::{session_counters[user_id]}",
                "artist_name": row["artist_name"],
                "track_name": row["track_name"],
                "ts": row_ts,
            }
        )
        previous_ts_by_user[user_id] = row_ts

    stats["rows_written"] = len(sessionized_rows)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not sessionized_rows:
        table = _empty_output_table()
    else:
        table = pa.Table.from_pydict(
            {
                "session_id": [row["session_id"] for row in sessionized_rows],
                "artist_name": [row["artist_name"] for row in sessionized_rows],
                "track_name": [row["track_name"] for row in sessionized_rows],
                "ts": [row["ts"] for row in sessionized_rows],
            },
            schema=_empty_output_table().schema,
        )

    pq.write_table(table, output_path)
    return stats


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build playlist-like sessions from Last.fm 1K TSV data.")
    parser.add_argument("--input", required=True, type=Path, help="Path to userid-timestamp-...-traid-traname TSV")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Parquet output path (default: ml/data/sessions.parquet)",
    )
    parser.add_argument(
        "--max-gap-hours",
        type=float,
        default=2.0,
        help="Maximum allowed gap in hours within a session (default: 2.0)",
    )
    return parser


def main() -> None:
    parser = _build_arg_parser()
    args = parser.parse_args()

    stats = build_lastfm_sessions(
        input_path=args.input,
        output_path=args.output,
        max_gap_hours=args.max_gap_hours,
    )

    for key in sorted(stats):
        print(f"{key}={stats[key]}")


if __name__ == "__main__":
    main()

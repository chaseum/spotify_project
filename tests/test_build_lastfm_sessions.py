from pathlib import Path

import pyarrow.parquet as pq

from ml.build_lastfm_sessions import build_lastfm_sessions


def _write_tsv(path: Path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        for row in rows:
            handle.write("\t".join(row))
            handle.write("\n")


def _read_output_records(path: Path) -> list[dict[str, str]]:
    records = []
    for row in pq.read_table(path).to_pylist():
        records.append(
            {
                "session_id": row["session_id"],
                "artist_name": row["artist_name"],
                "track_name": row["track_name"],
                "ts": row["ts"].isoformat(),
            }
        )
    return records


def test_build_lastfm_sessions_is_deterministic_with_boundary_gap(tmp_path) -> None:
    input_path = tmp_path / "lastfm.tsv"
    output_a = tmp_path / "sessions_a.parquet"
    output_b = tmp_path / "sessions_b.parquet"

    _write_tsv(
        input_path,
        [
            ["user_b", "2024-01-01T13:30:01Z", "art-id-6", "Artist B3", "trk-id-6", "Track B3"],
            ["user_a", "2024-01-01T03:00:00Z", "art-id-2", "Artist A2", "trk-id-2", "Track A2"],
            ["user_a", "2024-01-01T01:00:00Z", "art-id-1", "Artist A1", "trk-id-1", "Track A1"],
            ["user_b", "2024-01-01T10:00:00Z", "art-id-4", "Artist B1", "trk-id-4", "Track B1"],
            ["user_a", "2024-01-01T05:00:01Z", "art-id-3", "Artist A3", "trk-id-3", "Track A3"],
            ["user_b", "2024-01-01T11:30:00Z", "art-id-5", "Artist B2", "trk-id-5", "Track B2"],
        ],
    )

    stats_a = build_lastfm_sessions(input_path=input_path, output_path=output_a, max_gap_hours=2.0)
    stats_b = build_lastfm_sessions(input_path=input_path, output_path=output_b, max_gap_hours=2.0)

    assert stats_a == {
        "rows_read": 6,
        "rows_written": 6,
        "rows_skipped": 0,
        "rows_skipped_missing_columns": 0,
        "rows_skipped_missing_required": 0,
        "rows_skipped_invalid_timestamp": 0,
    }
    assert stats_b == stats_a

    expected = [
        {
            "session_id": "user_a::1",
            "artist_name": "Artist A1",
            "track_name": "Track A1",
            "ts": "2024-01-01T01:00:00+00:00",
        },
        {
            "session_id": "user_a::1",
            "artist_name": "Artist A2",
            "track_name": "Track A2",
            "ts": "2024-01-01T03:00:00+00:00",
        },
        {
            "session_id": "user_a::2",
            "artist_name": "Artist A3",
            "track_name": "Track A3",
            "ts": "2024-01-01T05:00:01+00:00",
        },
        {
            "session_id": "user_b::1",
            "artist_name": "Artist B1",
            "track_name": "Track B1",
            "ts": "2024-01-01T10:00:00+00:00",
        },
        {
            "session_id": "user_b::1",
            "artist_name": "Artist B2",
            "track_name": "Track B2",
            "ts": "2024-01-01T11:30:00+00:00",
        },
        {
            "session_id": "user_b::2",
            "artist_name": "Artist B3",
            "track_name": "Track B3",
            "ts": "2024-01-01T13:30:01+00:00",
        },
    ]

    assert _read_output_records(output_a) == expected
    assert _read_output_records(output_b) == expected


def test_build_lastfm_sessions_skips_malformed_rows_and_reports_counts(tmp_path) -> None:
    input_path = tmp_path / "lastfm_bad.tsv"
    output_path = tmp_path / "sessions_bad.parquet"

    _write_tsv(
        input_path,
        [
            ["user_a", "2024-01-01T01:00:00Z", "art-id-1", "Artist A1", "trk-id-1", "Track A1"],
            ["user_a", "not-a-timestamp", "art-id-2", "Artist A2", "trk-id-2", "Track A2"],
            ["user_a", "2024-01-01T02:00:00Z", "art-id-3", "Artist A3", "trk-id-3", ""],
            ["user_a", "2024-01-01T02:30:00Z", "art-id-4", "Artist A4", "trk-id-4"],
            ["", "2024-01-01T03:00:00Z", "art-id-5", "Artist A5", "trk-id-5", "Track A5"],
        ],
    )

    stats = build_lastfm_sessions(input_path=input_path, output_path=output_path, max_gap_hours=2.0)

    assert stats == {
        "rows_read": 5,
        "rows_written": 1,
        "rows_skipped": 4,
        "rows_skipped_missing_columns": 1,
        "rows_skipped_missing_required": 2,
        "rows_skipped_invalid_timestamp": 1,
    }

    assert _read_output_records(output_path) == [
        {
            "session_id": "user_a::1",
            "artist_name": "Artist A1",
            "track_name": "Track A1",
            "ts": "2024-01-01T01:00:00+00:00",
        }
    ]

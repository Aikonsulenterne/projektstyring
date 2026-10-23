#!/usr/bin/env bash
# Throwaway local PostgreSQL for integration tests (no Docker needed).
# Usage: scripts/test-db.sh start|stop|url
# Uses the PostgreSQL binaries on PATH or /usr/lib/postgresql/*/bin. Data lives in
# $TEAMSPACE_PG_DIR (default: /tmp/teamspace-pg-test) and is disposable.
set -euo pipefail

PORT="${TEAMSPACE_PG_PORT:-54329}"
DIR="${TEAMSPACE_PG_DIR:-/tmp/teamspace-pg-test}"
DB="teamspace_test"
BIN="$(dirname "$(command -v pg_ctl 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | sort -V | tail -1)")"

as_pg() {
  # PostgreSQL refuses to run as root; drop to the postgres user when needed.
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

case "${1:-}" in
  start)
    if [ ! -f "$DIR/PG_VERSION" ]; then
      mkdir -p "$DIR"
      [ "$(id -u)" = "0" ] && chown postgres "$DIR"
      as_pg "$BIN/initdb" -D "$DIR" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
    fi
    if ! as_pg "$BIN/pg_ctl" -D "$DIR" status >/dev/null 2>&1; then
      as_pg "$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/server.log" -w start >/dev/null
    fi
    as_pg "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 \
      || as_pg "$BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres "$DB"
    echo "postgresql://postgres@127.0.0.1:$PORT/$DB"
    ;;
  stop)
    as_pg "$BIN/pg_ctl" -D "$DIR" -m fast stop >/dev/null 2>&1 || true
    ;;
  url)
    echo "postgresql://postgres@127.0.0.1:$PORT/$DB"
    ;;
  *)
    echo "usage: $0 start|stop|url" >&2
    exit 2
    ;;
esac

#!/usr/bin/env python3
"""Drop the dev database, recreate it, run migrations, then seed.

Reads DB config from env (same precedence/defaults as
apps/api/src/database/data-source.ts). The drop/create is executed inside the
`erp-postgres` Docker container so no local psql or psycopg2 is required.

Usage:
    python3 scripts/reset-db.py            # asks for confirmation
    python3 scripts/reset-db.py --yes      # skip confirmation
    python3 scripts/reset-db.py --no-seed  # reset + migrate only
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTAINER = "erp-postgres"

DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": os.environ.get("DB_PORT", "5433"),
    "name": os.environ.get("DB_NAME", "erp_dev"),
    "user": os.environ.get("DB_USER", "erp_user"),
    "pass": os.environ.get("DB_PASS", "erp_secret"),
}


def run(cmd, **kwargs):
    print(f"\n$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, **kwargs)


def psql(sql):
    """Run a SQL statement against the `postgres` maintenance DB in the container."""
    run([
        "docker", "exec",
        "-e", f"PGPASSWORD={DB['pass']}",
        CONTAINER,
        "psql", "-U", DB["user"], "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        "-c", sql,
    ])


def ensure_container():
    result = subprocess.run(
        ["docker", "ps", "--filter", f"name=^{CONTAINER}$", "--format", "{{.Names}}"],
        capture_output=True, text=True,
    )
    if CONTAINER not in result.stdout:
        sys.exit(
            f"Container '{CONTAINER}' is not running. Start it with:\n"
            f"    docker compose up -d postgres"
        )


def main():
    parser = argparse.ArgumentParser(description="Reset the dev database.")
    parser.add_argument("-y", "--yes", action="store_true", help="skip confirmation")
    parser.add_argument("--no-seed", action="store_true", help="skip the seed step")
    args = parser.parse_args()

    print(f"Target: {DB['user']}@{DB['host']}:{DB['port']}/{DB['name']} (container {CONTAINER})")

    if not args.yes:
        answer = input(f"This will DROP and recreate database '{DB['name']}'. Continue? [y/N] ")
        if answer.strip().lower() not in ("y", "yes"):
            print("Aborted.")
            return

    ensure_container()

    # 1. Drop + recreate (terminate live connections first; DROP can't run while connected).
    print("\n=== Dropping and recreating database ===")
    psql(
        f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        f"WHERE datname = '{DB['name']}' AND pid <> pg_backend_pid();"
    )
    psql(f'DROP DATABASE IF EXISTS "{DB["name"]}";')
    psql(f'CREATE DATABASE "{DB["name"]}" OWNER "{DB["user"]}";')

    # 2. Migrations.
    print("\n=== Running migrations ===")
    run(["pnpm", "--filter", "@erp/api", "migration:run"], cwd=REPO_ROOT)

    # 3. Seed.
    if args.no_seed:
        print("\nSkipping seed (--no-seed).")
    else:
        print("\n=== Seeding ===")
        run(["pnpm", "--filter", "@erp/api", "seed:inventory"], cwd=REPO_ROOT)

    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(f"\nCommand failed (exit {exc.returncode}). Database reset incomplete.")
    except KeyboardInterrupt:
        sys.exit("\nInterrupted.")

#!/bin/sh
set -eu

for database in "$CODER_POSTGRES_DB" "$KEYCLOAK_POSTGRES_DB"; do
  if ! psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --command \
    "SELECT 1 FROM pg_database WHERE datname = '$database'" | grep -q 1; then
    psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --command \
      "CREATE DATABASE \"$database\""
  fi
done

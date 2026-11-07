#!/bin/sh

(
  set -eu
  psql -X --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE ROLE contabilidad_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER DATABASE atlob_test OWNER TO contabilidad_app;
SQL

  printf '%s\n%s\n' "$ATLOB_TEST_APP_PASSWORD" "$ATLOB_TEST_APP_PASSWORD" |
    psql -X --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c '\password contabilidad_app'
)

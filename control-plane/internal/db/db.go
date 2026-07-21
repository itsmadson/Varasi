// Package db provides the Postgres pool and a tiny embedded migrator.
package db

import (
	"context"
	"embed"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type DB struct {
	Pool *pgxpool.Pool
}

func Connect(ctx context.Context, url string) (*DB, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("pgx pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &DB{Pool: pool}, nil
}

func (d *DB) Close() { d.Pool.Close() }

// Migrate applies embedded SQL files once, tracked in varasi.schema_migrations.
func (d *DB) Migrate(ctx context.Context) error {
	_, err := d.Pool.Exec(ctx, `
		CREATE SCHEMA IF NOT EXISTS varasi;
		CREATE TABLE IF NOT EXISTS varasi.schema_migrations (
			version text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`)
	if err != nil {
		return fmt.Errorf("bootstrap migrations table: %w", err)
	}

	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		var exists bool
		if err := d.Pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM varasi.schema_migrations WHERE version=$1)`, name,
		).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		sqlBytes, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		if _, err := d.Pool.Exec(ctx, string(sqlBytes)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := d.Pool.Exec(ctx,
			`INSERT INTO varasi.schema_migrations(version) VALUES ($1)`, name,
		); err != nil {
			return err
		}
	}
	return nil
}

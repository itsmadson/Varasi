package config

import (
	"os"
	"time"
)

// Config holds runtime configuration, sourced from environment variables.
type Config struct {
	Port         string
	DatabaseURL  string
	JWTSecret    []byte
	JWTTTL       time.Duration
	STACURL      string
	RasterURL    string
	VectorURL    string
	AIWorkerURL  string
	AllowOrigins []string
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Load builds Config from the environment with sensible dev defaults.
func Load() Config {
	return Config{
		Port:         env("CONTROL_PORT", "8080"),
		DatabaseURL:  env("DATABASE_URL", "postgres://postgres:varasi@localhost:5439/varasi?sslmode=disable"),
		JWTSecret:    []byte(env("JWT_SECRET", "change-me-in-prod")),
		JWTTTL:       24 * time.Hour,
		STACURL:      env("STAC_URL", "http://localhost:8081"),
		RasterURL:    env("RASTER_URL", "http://localhost:8082"),
		VectorURL:    env("VECTOR_URL", "http://localhost:8083"),
		AIWorkerURL:  env("AI_WORKER_URL", "http://localhost:8090"),
		AllowOrigins: []string{env("CORS_ORIGIN", "http://localhost:3000")},
	}
}

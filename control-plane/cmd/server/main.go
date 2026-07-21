// Command server runs the Varasi control-plane HTTP API.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/itsmadson/varasi/control-plane/internal/config"
	"github.com/itsmadson/varasi/control-plane/internal/db"
	"github.com/itsmadson/varasi/control-plane/internal/httpapi"
	"github.com/itsmadson/varasi/control-plane/internal/ws"
)

func main() {
	// Self-probe mode for container healthchecks (distroless has no shell).
	healthcheck := flag.Bool("healthcheck", false, "probe local /healthz and exit")
	flag.Parse()
	if *healthcheck {
		port := config.Load().Port
		resp, err := http.Get("http://127.0.0.1:" + port + "/healthz")
		if err != nil || resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		os.Exit(0)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	ctx := context.Background()

	database, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer database.Close()

	if err := database.Migrate(ctx); err != nil {
		logger.Error("migrate failed", "err", err)
		os.Exit(1)
	}
	logger.Info("migrations applied")

	hub := ws.NewHub()
	srv := httpapi.NewServer(cfg, database, hub)

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("control-plane listening", "addr", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

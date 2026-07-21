package httpapi

import (
	"net/http"
	"time"

	"github.com/itsmadson/varasi/control-plane/internal/auth"
	"github.com/itsmadson/varasi/control-plane/internal/config"
	"github.com/itsmadson/varasi/control-plane/internal/db"
	"github.com/itsmadson/varasi/control-plane/internal/ws"
)

// Server wires shared dependencies for all HTTP handlers.
type Server struct {
	cfg   config.Config
	db    *db.DB
	auth  *auth.Manager
	hub   *ws.Hub
	httpc *http.Client
}

func NewServer(cfg config.Config, database *db.DB, hub *ws.Hub) *Server {
	return &Server{
		cfg:   cfg,
		db:    database,
		auth:  auth.NewManager(cfg.JWTSecret, cfg.JWTTTL),
		hub:   hub,
		httpc: &http.Client{Timeout: 30 * time.Second},
	}
}

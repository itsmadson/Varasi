package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// Router builds the full HTTP surface: public auth, authenticated API,
// catalog proxy, WebSocket, health, and OpenAPI.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60_000_000_000)) // 60s
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   append(s.cfg.AllowOrigins, "*"),
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-API-Key"},
		AllowCredentials: false,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := s.db.Pool.Ping(r.Context()); err != nil {
			writeErr(w, http.StatusServiceUnavailable, "db down")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "varasi-control-plane"})
	})
	r.Get("/openapi.json", s.openAPI)
	r.Get("/docs", swaggerUI)

	// Public auth.
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Post("/register", s.register)
		r.Post("/login", s.login)
	})

	// Authenticated API.
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.authenticate)

		r.Get("/me", s.me)
		r.Get("/org", s.getOrg)

		r.Get("/projects", s.listProjects)
		r.With(requireRole("editor")).Post("/projects", s.createProject)

		r.With(requireRole("admin")).Post("/api-keys", s.createAPIKey)

		r.Get("/watch-areas", s.listWatchAreas)
		r.With(requireRole("editor")).Post("/watch-areas", s.createWatchArea)
		r.With(requireRole("editor")).Delete("/watch-areas/{id}", s.deleteWatchArea)

		r.Get("/jobs", s.listJobs)
		r.With(requireRole("editor")).Post("/jobs", s.createJob)

		r.Get("/detections", s.listDetections)
		r.With(requireRole("editor")).Post("/detections/run", s.runDetection)
	})

	// Catalog proxy (authenticated single origin for the frontend).
	r.Route("/catalog", func(r chi.Router) {
		r.Use(s.authenticate)
		r.HandleFunc("/stac/*", s.stacProxy())
		r.HandleFunc("/raster/*", s.rasterProxy())
		r.HandleFunc("/vector/*", s.vectorProxy())
	})

	// WebSocket live feed (auth via ?token= since browsers can't set WS headers).
	r.Get("/ws", s.wsHandler)

	return r
}

func (s *Server) wsHandler(w http.ResponseWriter, r *http.Request) {
	tok := r.URL.Query().Get("token")
	claims, err := s.auth.Verify(tok)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	s.hub.Serve(w, r, claims.OrgID.String())
}

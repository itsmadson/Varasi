package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type watchAreaReq struct {
	Name      string          `json:"name"`
	ProjectID *uuid.UUID      `json:"project_id"`
	Geometry  json.RawMessage `json:"geometry"` // GeoJSON geometry
	Tags      []string        `json:"tags"`
	Priority  int             `json:"priority"`
	Threshold float64         `json:"threshold"`
	Notify    json.RawMessage `json:"notify"`
}

// createWatchArea stores an AOI (as MultiPolygon/4326) that will trigger CD.
func (s *Server) createWatchArea(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	var req watchAreaReq
	if err := decode(r, &req); err != nil || req.Name == "" || len(req.Geometry) == 0 {
		writeErr(w, http.StatusBadRequest, "name and geometry required")
		return
	}
	if req.Priority == 0 {
		req.Priority = 3
	}
	if req.Threshold == 0 {
		req.Threshold = 0.1
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}
	if len(req.Notify) == 0 {
		req.Notify = json.RawMessage(`{}`)
	}
	var id uuid.UUID
	err := s.db.Pool.QueryRow(r.Context(),
		`INSERT INTO varasi.watch_areas(org_id,project_id,name,geom,tags,priority,threshold,notify)
		 VALUES($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)), $5,$6,$7,$8)
		 RETURNING id`,
		c.OrgID, req.ProjectID, req.Name, string(req.Geometry),
		req.Tags, req.Priority, req.Threshold, req.Notify,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid geometry: "+err.Error())
		return
	}
	s.audit(r, "watch_area.create", id.String())
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// listWatchAreas returns AOIs as a GeoJSON FeatureCollection.
func (s *Server) listWatchAreas(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT id,name,tags,priority,threshold,enabled,ST_AsGeoJSON(geom)
		 FROM varasi.watch_areas WHERE org_id=$1 ORDER BY created_at DESC`, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	features := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var name, geojson string
		var tags []string
		var priority int
		var threshold float64
		var enabled bool
		if err := rows.Scan(&id, &name, &tags, &priority, &threshold, &enabled, &geojson); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan")
			return
		}
		features = append(features, map[string]any{
			"type":     "Feature",
			"id":       id,
			"geometry": json.RawMessage(geojson),
			"properties": map[string]any{
				"name": name, "tags": tags, "priority": priority,
				"threshold": threshold, "enabled": enabled,
			},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"type": "FeatureCollection", "features": features,
	})
}

func (s *Server) deleteWatchArea(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	id := chi.URLParam(r, "id")
	tag, err := s.db.Pool.Exec(r.Context(),
		`DELETE FROM varasi.watch_areas WHERE id=$1 AND org_id=$2`, id, c.OrgID)
	if err != nil || tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.audit(r, "watch_area.delete", id)
	w.WriteHeader(http.StatusNoContent)
}

package httpapi

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// createPermits ingests permit parcels from a GeoJSON FeatureCollection (or a
// single Feature/geometry). Each polygon becomes a permit the org can monitor.
func (s *Server) createPermits(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	raw, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}

	// Accept a FeatureCollection, a single Feature, or a bare geometry.
	var fc struct {
		Type     string `json:"type"`
		Features []struct {
			Geometry   json.RawMessage        `json:"geometry"`
			Properties map[string]any         `json:"properties"`
		} `json:"features"`
		Geometry   json.RawMessage `json:"geometry"`
		Properties map[string]any  `json:"properties"`
	}
	if err := json.Unmarshal(raw, &fc); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid GeoJSON")
		return
	}

	type parcel struct {
		geom  json.RawMessage
		props map[string]any
	}
	var parcels []parcel
	if len(fc.Features) > 0 {
		for _, f := range fc.Features {
			if len(f.Geometry) > 0 {
				parcels = append(parcels, parcel{f.Geometry, f.Properties})
			}
		}
	} else if len(fc.Geometry) > 0 {
		parcels = append(parcels, parcel{fc.Geometry, fc.Properties})
	} else {
		parcels = append(parcels, parcel{raw, nil}) // bare geometry
	}

	var inserted int
	var projectID *uuid.UUID
	if pid := r.URL.Query().Get("project_id"); pid != "" {
		if id, err := uuid.Parse(pid); err == nil {
			projectID = &id
		}
	}
	for _, p := range parcels {
		permitNo, _ := p.props["permit_no"].(string)
		propsJSON, _ := json.Marshal(p.props)
		if len(propsJSON) == 0 {
			propsJSON = []byte(`{}`)
		}
		_, err := s.db.Pool.Exec(r.Context(),
			`INSERT INTO varasi.permits(org_id,project_id,permit_no,geom,props)
			 VALUES($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)), $5)`,
			c.OrgID, projectID, permitNo, string(p.geom), propsJSON)
		if err == nil {
			inserted++
		}
	}
	s.audit(r, "permits.upload", "")
	writeJSON(w, http.StatusCreated, map[string]any{"inserted": inserted, "received": len(parcels)})
}

// listPermits returns permits as a GeoJSON FeatureCollection, each flagged with
// whether any detected change has landed inside it (no-start = false).
func (s *Server) listPermits(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT p.id, p.permit_no, p.status, ST_AsGeoJSON(p.geom),
		        EXISTS(SELECT 1 FROM varasi.detections d
		               WHERE d.org_id=p.org_id AND ST_Intersects(d.geom, p.geom)) AS has_change
		 FROM varasi.permits p WHERE p.org_id=$1 ORDER BY p.created_at DESC`, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	features := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var permitNo, status *string
		var geojson string
		var hasChange bool
		if err := rows.Scan(&id, &permitNo, &status, &geojson, &hasChange); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan")
			return
		}
		features = append(features, map[string]any{
			"type":     "Feature",
			"id":       id,
			"geometry": json.RawMessage(geojson),
			"properties": map[string]any{
				"permit_no": permitNo, "status": status,
				"has_change": hasChange, "no_start": !hasChange,
			},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"type": "FeatureCollection", "features": features})
}

func (s *Server) deletePermit(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	id := chi.URLParam(r, "id")
	tag, err := s.db.Pool.Exec(r.Context(),
		`DELETE FROM varasi.permits WHERE id=$1 AND org_id=$2`, id, c.OrgID)
	if err != nil || tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// permitCompliance summarizes construction change vs permits for the org.
func (s *Server) permitCompliance(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	ctx := r.Context()

	var permitted, unpermitted int
	var permittedArea, unpermittedArea float64
	_ = s.db.Pool.QueryRow(ctx,
		`SELECT
		   count(*) FILTER (WHERE permit_status='permitted'),
		   count(*) FILTER (WHERE permit_status='unpermitted'),
		   COALESCE(SUM(area_m2) FILTER (WHERE permit_status='permitted'),0),
		   COALESCE(SUM(area_m2) FILTER (WHERE permit_status='unpermitted'),0)
		 FROM varasi.detections WHERE org_id=$1`, c.OrgID,
	).Scan(&permitted, &unpermitted, &permittedArea, &unpermittedArea)

	var totalPermits, noStart int
	_ = s.db.Pool.QueryRow(ctx, `SELECT count(*) FROM varasi.permits WHERE org_id=$1`, c.OrgID).Scan(&totalPermits)
	_ = s.db.Pool.QueryRow(ctx,
		`SELECT count(*) FROM varasi.permits p WHERE p.org_id=$1
		   AND NOT EXISTS(SELECT 1 FROM varasi.detections d WHERE d.org_id=p.org_id AND ST_Intersects(d.geom,p.geom))`,
		c.OrgID).Scan(&noStart)

	writeJSON(w, http.StatusOK, map[string]any{
		"permits_total":     totalPermits,
		"permitted_count":   permitted,
		"unpermitted_count": unpermitted,
		"no_start_count":    noStart,
		"permitted_area_m2":   permittedArea,
		"unpermitted_area_m2": unpermittedArea,
	})
}

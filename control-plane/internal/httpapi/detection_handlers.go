package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// runDetection proxies a change-detection request to the Python ai-worker,
// persists the resulting polygons as detections, and returns the FeatureCollection.
// The whole run is tracked as a job so the UI can show progress/history.
func (s *Server) runDetection(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	ctx := r.Context()

	// Pass the request body straight through to the ai-worker (same schema).
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	// Extract watch_area_id if present (not part of the ai-worker schema).
	var meta struct {
		WatchAreaID *uuid.UUID `json:"watch_area_id"`
	}
	_ = json.Unmarshal(raw, &meta)

	var jobID uuid.UUID
	_ = s.db.Pool.QueryRow(ctx,
		`INSERT INTO varasi.jobs(org_id,kind,status,params) VALUES($1,'change_detection','running',$2) RETURNING id`,
		c.OrgID, raw,
	).Scan(&jobID)
	s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.created", "job_id": jobID, "kind": "change_detection", "status": "running"})

	fail := func(status int, msg string) {
		_, _ = s.db.Pool.Exec(ctx, `UPDATE varasi.jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1`, jobID, msg)
		s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "failed"})
		writeErr(w, status, msg)
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Post(s.cfg.AIWorkerURL+"/detect", "application/json", bytes.NewReader(raw))
	if err != nil {
		fail(http.StatusBadGateway, "ai-worker unreachable")
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		fail(resp.StatusCode, "ai-worker error: "+string(body[:min(len(body), 300)]))
		return
	}

	var fc struct {
		Features []struct {
			Geometry   json.RawMessage `json:"geometry"`
			Properties struct {
				ChangeClass string  `json:"change_class"`
				Confidence  float64 `json:"confidence"`
				AreaM2      float64 `json:"area_m2"`
				BeforeDate  *string `json:"before_datetime"`
				AfterDate   *string `json:"after_datetime"`
			} `json:"properties"`
		} `json:"features"`
		Stats json.RawMessage `json:"stats"`
	}
	if err := json.Unmarshal(body, &fc); err != nil {
		fail(http.StatusBadGateway, "invalid ai-worker response")
		return
	}

	// Persist each detected polygon.
	for _, f := range fc.Features {
		_, _ = s.db.Pool.Exec(ctx,
			`INSERT INTO varasi.detections
			   (org_id,job_id,watch_area_id,geom,change_class,confidence,area_m2,before_date,after_date)
			 VALUES($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)), $5,$6,$7,
			   $8::timestamptz, $9::timestamptz)`,
			c.OrgID, jobID, meta.WatchAreaID, string(f.Geometry),
			f.Properties.ChangeClass, f.Properties.Confidence, f.Properties.AreaM2,
			f.Properties.BeforeDate, f.Properties.AfterDate,
		)
	}

	_, _ = s.db.Pool.Exec(ctx,
		`UPDATE varasi.jobs SET status='succeeded',progress=1,result=$2,updated_at=now() WHERE id=$1`,
		jobID, fc.Stats)
	s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "succeeded"})
	s.audit(r, "detection.run", jobID.String())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body) // return the ai-worker FeatureCollection verbatim
}

// listDetections returns stored detections for the org as a GeoJSON FeatureCollection.
func (s *Server) listDetections(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT id,change_class,confidence,area_m2,before_date,after_date,created_at,ST_AsGeoJSON(geom)
		 FROM varasi.detections WHERE org_id=$1 ORDER BY created_at DESC LIMIT 2000`, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	features := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var cls *string
		var conf, area *float64
		var bd, ad, created any
		var geojson string
		if err := rows.Scan(&id, &cls, &conf, &area, &bd, &ad, &created, &geojson); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan")
			return
		}
		features = append(features, map[string]any{
			"type":     "Feature",
			"id":       id,
			"geometry": json.RawMessage(geojson),
			"properties": map[string]any{
				"change_class": cls, "confidence": conf, "area_m2": area,
				"before_date": bd, "after_date": ad, "created_at": created,
			},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"type": "FeatureCollection", "features": features})
}

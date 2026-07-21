package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// detectResult is the parsed ai-worker response we care about for persistence.
type detectResult struct {
	Raw          []byte
	ChangedArea  float64
	ChangedFrac  float64
	PolygonCount int
	StatsRaw     json.RawMessage
}

// detectAndPersist calls the ai-worker with reqJSON, stores the polygons as
// detections (optionally tied to a watch area), and updates the job. Shared by
// the manual run endpoint and the watch-area alert engine.
func (s *Server) detectAndPersist(ctx context.Context, orgID, jobID uuid.UUID, waID *uuid.UUID, reqJSON []byte) (detectResult, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Post(s.cfg.AIWorkerURL+"/detect", "application/json", bytes.NewReader(reqJSON))
	if err != nil {
		return detectResult{}, fmt.Errorf("ai-worker unreachable: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return detectResult{}, fmt.Errorf("ai-worker %d: %s", resp.StatusCode, string(body[:min(len(body), 300)]))
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
		Stats struct {
			ChangedAreaM2   float64 `json:"changed_area_m2"`
			ChangedFraction float64 `json:"changed_fraction"`
			PolygonCount    int     `json:"polygon_count"`
		} `json:"stats"`
		StatsRaw json.RawMessage `json:"-"`
	}
	if err := json.Unmarshal(body, &fc); err != nil {
		return detectResult{}, fmt.Errorf("invalid ai-worker response")
	}
	// Keep the raw stats object for job.result.
	var envelope struct {
		Stats json.RawMessage `json:"stats"`
	}
	_ = json.Unmarshal(body, &envelope)

	for _, f := range fc.Features {
		_, _ = s.db.Pool.Exec(ctx,
			`INSERT INTO varasi.detections
			   (org_id,job_id,watch_area_id,geom,change_class,confidence,area_m2,before_date,after_date)
			 VALUES($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)), $5,$6,$7,
			   $8::timestamptz, $9::timestamptz)`,
			orgID, jobID, waID, string(f.Geometry),
			f.Properties.ChangeClass, f.Properties.Confidence, f.Properties.AreaM2,
			f.Properties.BeforeDate, f.Properties.AfterDate,
		)
	}
	_, _ = s.db.Pool.Exec(ctx,
		`UPDATE varasi.jobs SET status='succeeded',progress=1,result=$2,updated_at=now() WHERE id=$1`,
		jobID, envelope.Stats)

	return detectResult{
		Raw:          body,
		ChangedArea:  fc.Stats.ChangedAreaM2,
		ChangedFrac:  fc.Stats.ChangedFraction,
		PolygonCount: fc.Stats.PolygonCount,
		StatsRaw:     envelope.Stats,
	}, nil
}

// runDetection is the manual change-detection endpoint.
func (s *Server) runDetection(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	ctx := r.Context()

	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
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

	res, err := s.detectAndPersist(ctx, c.OrgID, jobID, meta.WatchAreaID, raw)
	if err != nil {
		_, _ = s.db.Pool.Exec(ctx, `UPDATE varasi.jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1`, jobID, err.Error())
		s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "failed"})
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "succeeded"})
	s.audit(r, "detection.run", jobID.String())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(res.Raw)
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

package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ingestEvent is posted by the ingest worker after a new item lands, so watch
// areas intersecting the footprint get evaluated automatically.
type ingestEvent struct {
	Geometry json.RawMessage `json:"geometry"`
}

// onItemIngested (internal, token-gated) finds enabled watch areas intersecting
// the new footprint and evaluates each in the background. This is the "detect on
// ingest" trigger; the same engine also runs on-demand via the evaluate endpoint.
func (s *Server) onItemIngested(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Internal-Token") != s.cfg.InternalToken {
		writeErr(w, http.StatusUnauthorized, "bad internal token")
		return
	}
	var ev ingestEvent
	if err := decode(r, &ev); err != nil || len(ev.Geometry) == 0 {
		writeErr(w, http.StatusBadRequest, "geometry required")
		return
	}
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT id, org_id FROM varasi.watch_areas
		 WHERE enabled AND ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($1),4326))`,
		string(ev.Geometry))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	type target struct{ wa, org uuid.UUID }
	var targets []target
	for rows.Next() {
		var t target
		if err := rows.Scan(&t.wa, &t.org); err == nil {
			targets = append(targets, t)
		}
	}
	// Evaluate asynchronously so ingestion is never blocked by inference.
	for _, t := range targets {
		go func(orgID, waID uuid.UUID) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()
			if _, err := s.evaluateWatchArea(ctx, orgID, waID); err != nil {
				fmt.Printf("auto-evaluate watch_area=%s failed: %v\n", waID, err)
			}
		}(t.org, t.wa)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"evaluating": len(targets)})
}

type stacFeature struct {
	ID         string          `json:"id"`
	Collection string          `json:"collection"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties struct {
		Datetime string `json:"datetime"`
	} `json:"properties"`
}

// searchScenes finds scenes intersecting a geometry, newest first.
func (s *Server) searchScenes(ctx context.Context, geom json.RawMessage, limit int) ([]stacFeature, error) {
	body, _ := json.Marshal(map[string]any{
		"intersects": geom,
		"limit":      limit,
		"sortby":     []map[string]string{{"field": "datetime", "direction": "desc"}},
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.STACURL+"/search", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		Features []stacFeature `json:"features"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out.Features, nil
}

type evalResult struct {
	Evaluated bool    `json:"evaluated"`
	Reason    string  `json:"reason,omitempty"`
	Before    string  `json:"before,omitempty"`
	After     string  `json:"after,omitempty"`
	Fraction  float64 `json:"changed_fraction"`
	Threshold float64 `json:"threshold"`
	Alerted   bool    `json:"alerted"`
	AlertID   *string `json:"alert_id,omitempty"`
}

// evaluateWatchArea finds the two most recent intersecting scenes, runs change
// detection over the watch-area geometry, and raises an alert (with notifications)
// when the changed fraction crosses the area's threshold.
func (s *Server) evaluateWatchArea(ctx context.Context, orgID, waID uuid.UUID) (evalResult, error) {
	var name string
	var threshold float64
	var geom []byte
	var notifyRaw []byte
	err := s.db.Pool.QueryRow(ctx,
		`SELECT name, threshold, ST_AsGeoJSON(geom), notify
		 FROM varasi.watch_areas WHERE id=$1 AND org_id=$2`, waID, orgID,
	).Scan(&name, &threshold, &geom, &notifyRaw)
	if err != nil {
		return evalResult{}, fmt.Errorf("watch area not found")
	}

	scenes, err := s.searchScenes(ctx, geom, 12)
	if err != nil {
		return evalResult{}, fmt.Errorf("scene search failed: %w", err)
	}
	if len(scenes) < 2 {
		return evalResult{Evaluated: false, Reason: "need >=2 intersecting scenes", Threshold: threshold}, nil
	}
	after := scenes[0]
	var before *stacFeature
	for i := 1; i < len(scenes); i++ {
		if scenes[i].Properties.Datetime != after.Properties.Datetime {
			before = &scenes[i]
			break
		}
	}
	if before == nil {
		return evalResult{Evaluated: false, Reason: "no earlier scene", Threshold: threshold}, nil
	}

	reqJSON, _ := json.Marshal(map[string]any{
		"before":      map[string]any{"collection": before.Collection, "item_id": before.ID, "datetime": before.Properties.Datetime},
		"after":       map[string]any{"collection": after.Collection, "item_id": after.ID, "datetime": after.Properties.Datetime},
		"aoi":         json.RawMessage(geom),
		"algorithm":   "image_diff",
		"threshold":   0.4,
		"min_area_m2": 30000,
	})

	var jobID uuid.UUID
	_ = s.db.Pool.QueryRow(ctx,
		`INSERT INTO varasi.jobs(org_id,kind,status,params) VALUES($1,'change_detection','running',$2) RETURNING id`,
		orgID, reqJSON,
	).Scan(&jobID)
	s.hub.Broadcast(orgID.String(), map[string]any{"type": "job.created", "job_id": jobID, "kind": "change_detection", "status": "running"})

	res, err := s.detectAndPersist(ctx, orgID, jobID, &waID, reqJSON)
	if err != nil {
		_, _ = s.db.Pool.Exec(ctx, `UPDATE varasi.jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1`, jobID, err.Error())
		return evalResult{}, err
	}
	s.hub.Broadcast(orgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "succeeded"})

	out := evalResult{
		Evaluated: true, Before: before.ID, After: after.ID,
		Fraction: res.ChangedFrac, Threshold: threshold,
	}
	if res.ChangedFrac < threshold {
		return out, nil
	}

	// Threshold crossed → raise alert + notify.
	title := fmt.Sprintf("Change detected in %q", name)
	body := fmt.Sprintf("%.1f%% of the watch area changed between %s and %s (%d regions, %.2f km²).",
		res.ChangedFrac*100, before.Properties.Datetime[:10], after.Properties.Datetime[:10],
		res.PolygonCount, res.ChangedArea/1e6)
	severity := "warning"
	if res.ChangedFrac >= threshold*2 {
		severity = "critical"
	}
	var alertID uuid.UUID
	_ = s.db.Pool.QueryRow(ctx,
		`INSERT INTO varasi.alerts(org_id,watch_area_id,severity,title,body) VALUES($1,$2,$3,$4,$5) RETURNING id`,
		orgID, waID, severity, title, body,
	).Scan(&alertID)

	var notifyCfg map[string]any
	_ = json.Unmarshal(notifyRaw, &notifyCfg)
	go notify(context.Background(), notifyCfg, AlertMessage{
		Title: title, Body: body, Severity: severity, WatchArea: name,
		AreaM2: res.ChangedArea, Fraction: res.ChangedFrac,
	})

	s.hub.Broadcast(orgID.String(), map[string]any{
		"type": "alert.created", "alert_id": alertID, "severity": severity, "title": title,
	})

	aid := alertID.String()
	out.Alerted = true
	out.AlertID = &aid
	return out, nil
}

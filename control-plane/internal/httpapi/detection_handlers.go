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
	Score        float64            // Σ(area × classWeight × confidence)
	ByClass      map[string]float64 // area per change class
	TopDetection *uuid.UUID         // largest-area detection, for alert linkage
}

// classWeight ranks change classes for severity scoring.
func classWeight(cls string) float64 {
	switch cls {
	case "urban_growth":
		return 1.0
	case "water_change":
		return 0.9
	case "vegetation_loss":
		return 0.8
	case "bare_soil":
		return 0.6
	case "vegetation_gain":
		return 0.4
	default:
		return 0.3
	}
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

	byClass := map[string]float64{}
	var score, topArea float64
	var topID *uuid.UUID
	for _, f := range fc.Features {
		var detID uuid.UUID
		err := s.db.Pool.QueryRow(ctx,
			`INSERT INTO varasi.detections
			   (org_id,job_id,watch_area_id,geom,change_class,confidence,area_m2,before_date,after_date)
			 VALUES($1,$2,$3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4),4326)), $5,$6,$7,
			   $8::timestamptz, $9::timestamptz)
			 RETURNING id`,
			orgID, jobID, waID, string(f.Geometry),
			f.Properties.ChangeClass, f.Properties.Confidence, f.Properties.AreaM2,
			f.Properties.BeforeDate, f.Properties.AfterDate,
		).Scan(&detID)
		if err != nil {
			continue
		}
		cls := f.Properties.ChangeClass
		if cls == "" {
			cls = "unknown"
		}
		byClass[cls] += f.Properties.AreaM2
		score += f.Properties.AreaM2 * classWeight(cls) * f.Properties.Confidence
		if f.Properties.AreaM2 >= topArea {
			topArea = f.Properties.AreaM2
			id := detID
			topID = &id
		}
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
		Score:        score,
		ByClass:      byClass,
		TopDetection: topID,
	}, nil
}

// listModels proxies the ai-worker model catalog (backends, tags, runtime,
// availability) so the UI can offer a model picker per category.
func (s *Server) listModels(w http.ResponseWriter, r *http.Request) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(s.cfg.AIWorkerURL + "/models")
	if err != nil {
		writeErr(w, http.StatusBadGateway, "ai-worker unreachable")
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
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
	// Optional ?watch_area=<uuid> filter (feeds the watch-area timeline + alert overlay).
	args := []any{c.OrgID}
	where := `org_id=$1`
	if wa := r.URL.Query().Get("watch_area"); wa != "" {
		if id, err := uuid.Parse(wa); err == nil {
			args = append(args, id)
			where += ` AND watch_area_id=$2`
		}
	}
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT id,job_id,watch_area_id,change_class,confidence,area_m2,before_date,after_date,created_at,ST_AsGeoJSON(geom)
		 FROM varasi.detections WHERE `+where+` ORDER BY created_at DESC LIMIT 2000`, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	features := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var jobID, waID *uuid.UUID
		var cls *string
		var conf, area *float64
		var bd, ad, created any
		var geojson string
		if err := rows.Scan(&id, &jobID, &waID, &cls, &conf, &area, &bd, &ad, &created, &geojson); err != nil {
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
				"job_id": jobID, "watch_area_id": waID,
			},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"type": "FeatureCollection", "features": features})
}

package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// evaluateWatchAreaHandler triggers an on-demand evaluation of a watch area.
// (The same engine runs automatically when new imagery is ingested.)
func (s *Server) evaluateWatchAreaHandler(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	res, err := s.evaluateWatchArea(r.Context(), c.OrgID, id)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	s.audit(r, "watch_area.evaluate", id.String())
	writeJSON(w, http.StatusOK, res)
}

// listAlerts returns alerts for the org, newest first.
func (s *Server) listAlerts(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	onlyOpen := r.URL.Query().Get("open") == "true"
	// Structured run metrics (regions, area, dates) let the client compose a
	// localized title/body instead of showing the stored English text.
	q := `SELECT a.id,a.severity,a.title,a.body,a.acknowledged,a.created_at,
	             w.name, a.watch_area_id, a.score,
	             agg.n, agg.area, agg.bd, agg.ad
	      FROM varasi.alerts a
	      LEFT JOIN varasi.watch_areas w ON w.id=a.watch_area_id
	      LEFT JOIN LATERAL (
	          SELECT count(*) AS n, COALESCE(SUM(d2.area_m2),0) AS area,
	                 to_char(min(d2.before_date),'YYYY-MM-DD') AS bd,
	                 to_char(min(d2.after_date),'YYYY-MM-DD') AS ad
	          FROM varasi.detections d0
	          JOIN varasi.detections d2 ON d2.job_id = d0.job_id
	          WHERE d0.id = a.detection_id
	      ) agg ON true
	      WHERE a.org_id=$1`
	if onlyOpen {
		q += ` AND a.acknowledged=false`
	}
	q += ` ORDER BY a.created_at DESC LIMIT 500`
	rows, err := s.db.Pool.Query(r.Context(), q, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var waID *uuid.UUID
		var severity, title string
		var body, waName *string
		var ack bool
		var created any
		var score float64
		var n *int
		var area *float64
		var bd, ad *string
		if err := rows.Scan(&id, &severity, &title, &body, &ack, &created, &waName, &waID, &score, &n, &area, &bd, &ad); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan")
			return
		}
		out = append(out, map[string]any{
			"id": id, "severity": severity, "title": title, "body": body,
			"acknowledged": ack, "created_at": created,
			"watch_area": waName, "watch_area_id": waID, "score": score,
			"metrics": map[string]any{"polygon_count": n, "area_m2": area, "before_date": bd, "after_date": ad},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"alerts": out})
}

// alertDetail returns everything a report needs for one alert: the alert row,
// its watch area (geometry + name), the before/after scenes of the detection
// run, the run's detection polygons (FeatureCollection), and per-class stats.
func (s *Server) alertDetail(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	ctx := r.Context()
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}

	var severity, title string
	var body, waName *string
	var waID, detID *uuid.UUID
	var ack bool
	var created any
	var score float64
	err = s.db.Pool.QueryRow(ctx,
		`SELECT a.severity,a.title,a.body,a.acknowledged,a.created_at,a.score,
		        a.watch_area_id,a.detection_id,w.name
		 FROM varasi.alerts a
		 LEFT JOIN varasi.watch_areas w ON w.id=a.watch_area_id
		 WHERE a.id=$1 AND a.org_id=$2`, id, c.OrgID,
	).Scan(&severity, &title, &body, &ack, &created, &score, &waID, &detID, &waName)
	if err != nil {
		writeErr(w, http.StatusNotFound, "alert not found")
		return
	}

	alert := map[string]any{
		"id": id, "severity": severity, "title": title, "body": body,
		"acknowledged": ack, "created_at": created, "score": score,
		"watch_area": waName, "watch_area_id": waID,
	}

	// Watch-area geometry.
	var waGeoJSON *string
	if waID != nil {
		var g string
		if s.db.Pool.QueryRow(ctx, `SELECT ST_AsGeoJSON(geom) FROM varasi.watch_areas WHERE id=$1`, waID).Scan(&g) == nil {
			waGeoJSON = &g
		}
	}

	// Resolve the detection run (job) from the linked detection; pull scene ids
	// from the job params so the report can show a before/after swipe.
	var jobID *uuid.UUID
	var before, after, collection *string
	if detID != nil {
		var params []byte
		_ = s.db.Pool.QueryRow(ctx,
			`SELECT d.job_id, j.params FROM varasi.detections d
			 JOIN varasi.jobs j ON j.id=d.job_id WHERE d.id=$1`, detID).Scan(&jobID, &params)
		if len(params) > 0 {
			var p struct {
				Before struct {
					Collection string `json:"collection"`
					ItemID     string `json:"item_id"`
				} `json:"before"`
				After struct {
					Collection string `json:"collection"`
					ItemID     string `json:"item_id"`
				} `json:"after"`
			}
			if json.Unmarshal(params, &p) == nil {
				before, after, collection = &p.Before.ItemID, &p.After.ItemID, &p.After.Collection
			}
		}
	}

	// Detection polygons for that run.
	features := []map[string]any{}
	byClass := map[string]float64{}
	var totalArea float64
	if jobID != nil {
		rows, _ := s.db.Pool.Query(ctx,
			`SELECT change_class,confidence,area_m2,permit_status,model,ST_AsGeoJSON(geom)
			 FROM varasi.detections WHERE job_id=$1 AND org_id=$2`, jobID, c.OrgID)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var cls, permitStatus, model *string
				var conf, area *float64
				var g string
				if rows.Scan(&cls, &conf, &area, &permitStatus, &model, &g) != nil {
					continue
				}
				k := "unknown"
				if cls != nil {
					k = *cls
				}
				a := 0.0
				if area != nil {
					a = *area
				}
				byClass[k] += a
				totalArea += a
				features = append(features, map[string]any{
					"type": "Feature", "geometry": json.RawMessage(g),
					"properties": map[string]any{"change_class": cls, "confidence": conf, "area_m2": area, "permit_status": permitStatus, "model": model},
				})
			}
		}
	}

	// Acquisition dates of the compared rasters (for a localized title/body).
	var bd, ad *string
	if jobID != nil {
		_ = s.db.Pool.QueryRow(ctx,
			`SELECT to_char(min(before_date),'YYYY-MM-DD'), to_char(min(after_date),'YYYY-MM-DD')
			 FROM varasi.detections WHERE job_id=$1 AND org_id=$2`, jobID, c.OrgID).Scan(&bd, &ad)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"alert":           alert,
		"watch_area_geom": rawOrNil(waGeoJSON),
		"scenes":          map[string]any{"collection": collection, "before": before, "after": after},
		"dates":           map[string]any{"before": bd, "after": ad},
		"detections":      map[string]any{"type": "FeatureCollection", "features": features},
		"stats":           map[string]any{"changed_area_m2": totalArea, "polygon_count": len(features), "class_breakdown": byClass},
	})
}

func rawOrNil(s *string) any {
	if s == nil {
		return nil
	}
	return json.RawMessage(*s)
}

func (s *Server) ackAlert(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	id := chi.URLParam(r, "id")
	tag, err := s.db.Pool.Exec(r.Context(),
		`UPDATE varasi.alerts SET acknowledged=true WHERE id=$1 AND org_id=$2`, id, c.OrgID)
	if err != nil || tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "acknowledged"})
}

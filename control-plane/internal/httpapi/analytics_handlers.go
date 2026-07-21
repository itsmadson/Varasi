package httpapi

import "net/http"

// analyticsSummary aggregates the org's detections for the Analytics page:
// totals, change-class breakdown, and a monthly time series of changed area.
func (s *Server) analyticsSummary(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	ctx := r.Context()

	var totalDetections int
	var totalArea float64
	_ = s.db.Pool.QueryRow(ctx,
		`SELECT count(*), COALESCE(SUM(area_m2),0) FROM varasi.detections WHERE org_id=$1`, c.OrgID,
	).Scan(&totalDetections, &totalArea)

	var scenes, watchAreas, openAlerts int
	_ = s.db.Pool.QueryRow(ctx, `SELECT count(*) FROM varasi.watch_areas WHERE org_id=$1`, c.OrgID).Scan(&watchAreas)
	_ = s.db.Pool.QueryRow(ctx, `SELECT count(*) FROM varasi.alerts WHERE org_id=$1 AND acknowledged=false`, c.OrgID).Scan(&openAlerts)

	// Change-class breakdown (count + area).
	byClass := []map[string]any{}
	if rows, err := s.db.Pool.Query(ctx,
		`SELECT COALESCE(change_class,'unknown'), count(*), COALESCE(SUM(area_m2),0)
		 FROM varasi.detections WHERE org_id=$1 GROUP BY 1 ORDER BY 3 DESC`, c.OrgID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var cls string
			var n int
			var area float64
			if rows.Scan(&cls, &n, &area) == nil {
				byClass = append(byClass, map[string]any{"class": cls, "count": n, "area_m2": area})
			}
		}
	}

	// Monthly changed-area time series (by after_date).
	series := []map[string]any{}
	if rows, err := s.db.Pool.Query(ctx,
		`SELECT to_char(date_trunc('month', COALESCE(after_date, created_at)),'YYYY-MM') AS m,
		        count(*), COALESCE(SUM(area_m2),0)
		 FROM varasi.detections WHERE org_id=$1 GROUP BY 1 ORDER BY 1`, c.OrgID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var m string
			var n int
			var area float64
			if rows.Scan(&m, &n, &area) == nil {
				series = append(series, map[string]any{"month": m, "count": n, "area_m2": area})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"totals": map[string]any{
			"detections":      totalDetections,
			"changed_area_m2": totalArea,
			"watch_areas":     watchAreas,
			"open_alerts":     openAlerts,
			"scenes":          scenes,
		},
		"by_class": byClass,
		"series":   series,
	})
}

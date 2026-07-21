package httpapi

import (
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
	q := `SELECT a.id,a.severity,a.title,a.body,a.acknowledged,a.created_at,
	             w.name, a.watch_area_id
	      FROM varasi.alerts a
	      LEFT JOIN varasi.watch_areas w ON w.id=a.watch_area_id
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
		if err := rows.Scan(&id, &severity, &title, &body, &ack, &created, &waName, &waID); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan")
			return
		}
		out = append(out, map[string]any{
			"id": id, "severity": severity, "title": title, "body": body,
			"acknowledged": ack, "created_at": created,
			"watch_area": waName, "watch_area_id": waID,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"alerts": out})
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

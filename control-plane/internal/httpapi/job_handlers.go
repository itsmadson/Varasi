package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// listJobs returns jobs for the caller's org.
func (s *Server) listJobs(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	status := r.URL.Query().Get("status")
	q := `SELECT id,kind,status,progress,error,created_at,updated_at
	      FROM varasi.jobs WHERE org_id=$1`
	args := []any{c.OrgID}
	if status != "" {
		q += ` AND status=$2`
		args = append(args, status)
	}
	q += ` ORDER BY created_at DESC LIMIT 200`
	rows, err := s.db.Pool.Query(r.Context(), q, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var kind, st string
		var progress float64
		var errMsg *string
		var created, updated any
		if err := rows.Scan(&id, &kind, &st, &progress, &errMsg, &created, &updated); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan")
			return
		}
		out = append(out, map[string]any{
			"id": id, "kind": kind, "status": st, "progress": progress,
			"error": errMsg, "created_at": created, "updated_at": updated,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": out})
}

type jobReq struct {
	Kind      string          `json:"kind"`
	ProjectID *uuid.UUID      `json:"project_id"`
	Params    json.RawMessage `json:"params"`
}

// createJob enqueues a job and notifies subscribers over WebSocket.
func (s *Server) createJob(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	var req jobReq
	if err := decode(r, &req); err != nil || req.Kind == "" {
		writeErr(w, http.StatusBadRequest, "kind required")
		return
	}
	if len(req.Params) == 0 {
		req.Params = json.RawMessage(`{}`)
	}
	var id uuid.UUID
	err := s.db.Pool.QueryRow(r.Context(),
		`INSERT INTO varasi.jobs(org_id,project_id,kind,params) VALUES($1,$2,$3,$4) RETURNING id`,
		c.OrgID, req.ProjectID, req.Kind, req.Params,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "insert")
		return
	}
	s.hub.Broadcast(c.OrgID.String(), map[string]any{
		"type": "job.created", "job_id": id, "kind": req.Kind, "status": "queued",
	})
	s.audit(r, "job.create", id.String())
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "status": "queued"})
}

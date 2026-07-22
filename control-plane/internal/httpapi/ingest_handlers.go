package httpapi

import (
	"bytes"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ingestRaster proxies an "add raster" request to the ingest service, tracked as
// a job. The ingest service reads only the source header (metadata-first) and
// registers a STAC Item — no pixel copy.
func (s *Server) ingestRaster(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	ctx := r.Context()

	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}

	var jobID uuid.UUID
	_ = s.db.Pool.QueryRow(ctx,
		`INSERT INTO varasi.jobs(org_id,kind,status,params) VALUES($1,'ingest','running',$2) RETURNING id`,
		c.OrgID, raw,
	).Scan(&jobID)
	s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.created", "job_id": jobID, "kind": "ingest", "status": "running"})

	client := &http.Client{Timeout: 3 * time.Minute}
	resp, err := client.Post(s.cfg.IngestURL+"/ingest", "application/json", bytes.NewReader(raw))
	if err != nil {
		_, _ = s.db.Pool.Exec(ctx, `UPDATE varasi.jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1`, jobID, "ingest service unreachable")
		s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "failed"})
		writeErr(w, http.StatusBadGateway, "ingest service unreachable")
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		_, _ = s.db.Pool.Exec(ctx, `UPDATE varasi.jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1`, jobID, string(body[:min(len(body), 300)]))
		s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "failed"})
		writeErr(w, resp.StatusCode, "ingest failed: "+string(body[:min(len(body), 300)]))
		return
	}

	_, _ = s.db.Pool.Exec(ctx, `UPDATE varasi.jobs SET status='succeeded',progress=1,result=$2,updated_at=now() WHERE id=$1`, jobID, body)
	s.hub.Broadcast(c.OrgID.String(), map[string]any{"type": "job.updated", "job_id": jobID, "status": "succeeded"})
	s.audit(r, "raster.ingest", jobID.String())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

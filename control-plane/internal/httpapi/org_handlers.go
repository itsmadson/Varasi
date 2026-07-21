package httpapi

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/itsmadson/varasi/control-plane/internal/auth"
)

// --- org info ---

func (s *Server) getOrg(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	var name, slug string
	var quota int64
	err := s.db.Pool.QueryRow(r.Context(),
		`SELECT name,slug,storage_quota_bytes FROM varasi.organizations WHERE id=$1`, c.OrgID,
	).Scan(&name, &slug, &quota)
	if err != nil {
		writeErr(w, http.StatusNotFound, "org not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id": c.OrgID, "name": name, "slug": slug, "storage_quota_bytes": quota,
	})
}

// --- projects ---

type projectReq struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Collections []string `json:"collections"`
}

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT id,name,slug,description,collections,created_at
		 FROM varasi.projects WHERE org_id=$1 ORDER BY created_at DESC`, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var name, slug, desc string
		var cols []string
		var created any
		if err := rows.Scan(&id, &name, &slug, &desc, &cols, &created); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan")
			return
		}
		out = append(out, map[string]any{
			"id": id, "name": name, "slug": slug, "description": desc,
			"collections": cols, "created_at": created,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": out})
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	var req projectReq
	if err := decode(r, &req); err != nil || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	if req.Collections == nil {
		req.Collections = []string{}
	}
	var id uuid.UUID
	err := s.db.Pool.QueryRow(r.Context(),
		`INSERT INTO varasi.projects(org_id,name,slug,description,collections)
		 VALUES($1,$2,$3,$4,$5) RETURNING id`,
		c.OrgID, req.Name, slugify(req.Name), req.Description, req.Collections,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusConflict, "project exists or invalid")
		return
	}
	s.audit(r, "project.create", id.String())
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// --- api keys ---

type apiKeyReq struct {
	Name string `json:"name"`
}

func (s *Server) createAPIKey(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	var req apiKeyReq
	if err := decode(r, &req); err != nil || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	full, prefix, secret := auth.GenerateAPIKey()
	hash, err := auth.HashAPISecret(secret)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash")
		return
	}
	uid := c.UserID
	var id uuid.UUID
	err = s.db.Pool.QueryRow(r.Context(),
		`INSERT INTO varasi.api_keys(org_id,user_id,name,prefix,key_hash)
		 VALUES($1,$2,$3,$4,$5) RETURNING id`,
		c.OrgID, uid, req.Name, prefix, hash,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "insert")
		return
	}
	s.audit(r, "apikey.create", id.String())
	// The full secret is shown exactly once.
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "key": full, "name": req.Name})
}

func (s *Server) audit(r *http.Request, action, target string) {
	c := claimsFrom(r.Context())
	if c == nil {
		return
	}
	_, _ = s.db.Pool.Exec(r.Context(),
		`INSERT INTO varasi.audit_log(org_id,user_id,action,target) VALUES($1,$2,$3,$4)`,
		c.OrgID, c.UserID, action, target)
}

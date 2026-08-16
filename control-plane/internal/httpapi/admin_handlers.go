package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// listAPIKeys returns the org's API keys (metadata only — never the secret).
func (s *Server) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT id,name,prefix,revoked,last_used_at,created_at FROM varasi.api_keys
		 WHERE org_id=$1 ORDER BY created_at DESC`, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	keys := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var name, prefix string
		var revoked bool
		var lastUsed, created any
		if rows.Scan(&id, &name, &prefix, &revoked, &lastUsed, &created) != nil {
			continue
		}
		keys = append(keys, map[string]any{
			"id": id, "name": name, "prefix": prefix, "revoked": revoked,
			"last_used_at": lastUsed, "created_at": created,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys})
}

// revokeAPIKey marks a key revoked (soft delete).
func (s *Server) revokeAPIKey(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	id := chi.URLParam(r, "id")
	tag, err := s.db.Pool.Exec(r.Context(),
		`UPDATE varasi.api_keys SET revoked=true WHERE id=$1 AND org_id=$2`, id, c.OrgID)
	if err != nil || tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.audit(r, "apikey.revoke", id)
	w.WriteHeader(http.StatusNoContent)
}

// listMembers returns the org's members with their role.
func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT u.email, COALESCE(u.full_name,''), m.role, m.created_at
		 FROM varasi.memberships m JOIN varasi.users u ON u.id=m.user_id
		 WHERE m.org_id=$1 ORDER BY m.created_at`, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	members := []map[string]any{}
	for rows.Next() {
		var email, fullName, role string
		var created any
		if rows.Scan(&email, &fullName, &role, &created) != nil {
			continue
		}
		members = append(members, map[string]any{"email": email, "full_name": fullName, "role": role, "created_at": created})
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": members})
}

// listAudit returns the org's recent audit-log entries.
func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	rows, err := s.db.Pool.Query(r.Context(),
		`SELECT a.action, a.target, COALESCE(u.email,''), a.created_at
		 FROM varasi.audit_log a LEFT JOIN varasi.users u ON u.id=a.user_id
		 WHERE a.org_id=$1 ORDER BY a.created_at DESC LIMIT 200`, c.OrgID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	events := []map[string]any{}
	for rows.Next() {
		var action, target, email string
		var created any
		if rows.Scan(&action, &target, &email, &created) != nil {
			continue
		}
		events = append(events, map[string]any{"action": action, "target": target, "user": email, "created_at": created})
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

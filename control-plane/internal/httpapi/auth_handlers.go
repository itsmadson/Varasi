package httpapi

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/itsmadson/varasi/control-plane/internal/auth"
)

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	return strings.Trim(slugRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	OrgName  string `json:"org_name"`
}

type authResp struct {
	Token string    `json:"token"`
	OrgID uuid.UUID `json:"org_id"`
	Role  string    `json:"role"`
	Email string    `json:"email"`
}

// register creates a user, their organization, and an owner membership.
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if len(req.Password) < 8 || !strings.Contains(req.Email, "@") {
		writeErr(w, http.StatusBadRequest, "email invalid or password too short (min 8)")
		return
	}
	if req.OrgName == "" {
		req.OrgName = strings.Split(req.Email, "@")[0] + "'s org"
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash failed")
		return
	}

	ctx := r.Context()
	tx, err := s.db.Pool.Begin(ctx)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "tx")
		return
	}
	defer tx.Rollback(ctx)

	var userID, orgID uuid.UUID
	err = tx.QueryRow(ctx,
		`INSERT INTO varasi.users(email,password_hash,full_name) VALUES($1,$2,$3) RETURNING id`,
		strings.ToLower(req.Email), hash, req.FullName,
	).Scan(&userID)
	if err != nil {
		writeErr(w, http.StatusConflict, "email already registered")
		return
	}
	slug := slugify(req.OrgName)
	if slug == "" {
		slug = "org"
	}
	slug = slug + "-" + auth.FingerprintKey(userID.String())[:6]
	if err = tx.QueryRow(ctx,
		`INSERT INTO varasi.organizations(name,slug) VALUES($1,$2) RETURNING id`,
		req.OrgName, slug,
	).Scan(&orgID); err != nil {
		writeErr(w, http.StatusInternalServerError, "create org")
		return
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO varasi.memberships(org_id,user_id,role) VALUES($1,$2,'owner')`,
		orgID, userID,
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "membership")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, "commit")
		return
	}

	token, _ := s.auth.Issue(userID, orgID, "owner", strings.ToLower(req.Email))
	writeJSON(w, http.StatusCreated, authResp{token, orgID, "owner", strings.ToLower(req.Email)})
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// login verifies credentials and returns a JWT for the user's first org.
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad body")
		return
	}
	ctx := r.Context()
	var userID uuid.UUID
	var hash, email string
	var active bool
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id,password_hash,email,is_active FROM varasi.users WHERE email=$1`,
		strings.ToLower(req.Email),
	).Scan(&userID, &hash, &email, &active)
	if err != nil || !active || !auth.CheckPassword(hash, req.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	var orgID uuid.UUID
	var role string
	if err := s.db.Pool.QueryRow(ctx,
		`SELECT org_id,role FROM varasi.memberships WHERE user_id=$1 ORDER BY created_at LIMIT 1`,
		userID,
	).Scan(&orgID, &role); err != nil {
		writeErr(w, http.StatusForbidden, "no organization")
		return
	}
	token, _ := s.auth.Issue(userID, orgID, role, email)
	writeJSON(w, http.StatusOK, authResp{token, orgID, role, email})
}

// me returns the current principal from the token/api-key.
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	c := claimsFrom(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"user_id": c.UserID, "org_id": c.OrgID, "role": c.Role, "email": c.Email,
	})
}

// resolveAPIKey validates a vsk_ key and builds equivalent claims.
func (s *Server) resolveAPIKey(ctx context.Context, full string) (*auth.Claims, error) {
	parts := strings.SplitN(full, "_", 3)
	if len(parts) != 3 || parts[0] != "vsk" {
		return nil, auth.ErrInvalidToken
	}
	prefix, secret := parts[1], parts[2]
	var id, orgID uuid.UUID
	var userID *uuid.UUID
	var keyHash string
	var revoked bool
	err := s.db.Pool.QueryRow(ctx,
		`SELECT id,org_id,user_id,key_hash,revoked FROM varasi.api_keys WHERE prefix=$1`,
		prefix,
	).Scan(&id, &orgID, &userID, &keyHash, &revoked)
	if err != nil || revoked || !auth.CheckAPISecret(keyHash, secret) {
		return nil, auth.ErrInvalidToken
	}
	_, _ = s.db.Pool.Exec(ctx, `UPDATE varasi.api_keys SET last_used_at=now() WHERE id=$1`, id)

	role := "editor" // API keys act with editor rights by default
	uid := uuid.Nil
	if userID != nil {
		uid = *userID
	}
	return &auth.Claims{UserID: uid, OrgID: orgID, Role: role, Email: "apikey:" + prefix}, nil
}

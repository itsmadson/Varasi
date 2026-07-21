package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/itsmadson/varasi/control-plane/internal/auth"
)

type ctxKey int

const claimsKey ctxKey = iota

// roleRank orders RBAC roles; a higher rank satisfies a lower requirement.
var roleRank = map[string]int{"viewer": 1, "editor": 2, "admin": 3, "owner": 4}

func claimsFrom(ctx context.Context) *auth.Claims {
	c, _ := ctx.Value(claimsKey).(*auth.Claims)
	return c
}

// authenticate accepts either a Bearer JWT or an API key (X-API-Key / Bearer vsk_...).
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var claims *auth.Claims

		if apiKey := apiKeyFromRequest(r); apiKey != "" {
			c, err := s.resolveAPIKey(r.Context(), apiKey)
			if err != nil {
				writeErr(w, http.StatusUnauthorized, "invalid api key")
				return
			}
			claims = c
		} else if tok := bearer(r); tok != "" {
			c, err := s.auth.Verify(tok)
			if err != nil {
				writeErr(w, http.StatusUnauthorized, "invalid token")
				return
			}
			claims = c
		} else {
			writeErr(w, http.StatusUnauthorized, "missing credentials")
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireRole enforces a minimum RBAC role.
func requireRole(min string) func(http.Handler) http.Handler {
	need := roleRank[min]
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c := claimsFrom(r.Context())
			if c == nil || roleRank[c.Role] < need {
				writeErr(w, http.StatusForbidden, "insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

func apiKeyFromRequest(r *http.Request) string {
	if k := r.Header.Get("X-API-Key"); k != "" {
		return k
	}
	if b := bearer(r); strings.HasPrefix(b, "vsk_") {
		return b
	}
	return ""
}

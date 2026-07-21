// Package auth handles password hashing, JWT issuance/verification, and API keys.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidToken = errors.New("invalid token")

// Claims is the JWT payload: who the user is and which org/role is active.
type Claims struct {
	UserID uuid.UUID `json:"uid"`
	OrgID  uuid.UUID `json:"org"`
	Role   string    `json:"role"`
	Email  string    `json:"email"`
	jwt.RegisteredClaims
}

type Manager struct {
	secret []byte
	ttl    time.Duration
}

func NewManager(secret []byte, ttl time.Duration) *Manager {
	return &Manager{secret: secret, ttl: ttl}
}

// --- passwords ---

func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// --- JWT ---

func (m *Manager) Issue(userID, orgID uuid.UUID, role, email string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID, OrgID: orgID, Role: role, Email: email,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
			Issuer:    "varasi",
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

func (m *Manager) Verify(token string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

// --- API keys ---
// Format: vsk_<prefix>_<secret>. We store prefix (lookup) + bcrypt(secret).

func GenerateAPIKey() (full, prefix, secret string) {
	prefix = randHex(6)
	secret = randHex(24)
	full = "vsk_" + prefix + "_" + secret
	return
}

func HashAPISecret(secret string) (string, error) {
	// bcrypt has a 72-byte cap; API secret is 48 hex chars, safely under.
	b, err := bcrypt.GenerateFromPassword([]byte(secret), bcrypt.DefaultCost)
	return string(b), err
}

func CheckAPISecret(hash, secret string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(secret)) == nil
}

func FingerprintKey(full string) string {
	sum := sha256.Sum256([]byte(full))
	return hex.EncodeToString(sum[:8])
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

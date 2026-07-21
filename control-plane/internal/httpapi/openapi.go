package httpapi

import "net/http"

// openAPI serves a hand-maintained OpenAPI 3 document describing the public API.
func (s *Server) openAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(openAPIDoc))
}

func swaggerUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!doctype html><html><head><meta charset="utf-8">
<title>Varasi API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="app"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload=()=>SwaggerUIBundle({url:'/openapi.json',dom_id:'#app'})</script>
</body></html>`))
}

const openAPIDoc = `{
  "openapi": "3.0.3",
  "info": {"title": "Varasi Control-Plane API", "version": "0.1.0",
    "description": "Auth, multi-tenancy, RBAC, catalog proxy, watch areas, jobs."},
  "servers": [{"url": "/"}],
  "components": {
    "securitySchemes": {
      "bearer": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
      "apiKey": {"type": "apiKey", "in": "header", "name": "X-API-Key"}
    }
  },
  "security": [{"bearer": []}, {"apiKey": []}],
  "paths": {
    "/healthz": {"get": {"summary": "Health", "security": [], "responses": {"200": {"description": "ok"}}}},
    "/api/v1/auth/register": {"post": {"summary": "Register user + org", "security": [],
      "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "object",
        "required": ["email","password"], "properties": {
          "email": {"type": "string"}, "password": {"type": "string", "minLength": 8},
          "full_name": {"type": "string"}, "org_name": {"type": "string"}}}}}},
      "responses": {"201": {"description": "created, returns token"}}}},
    "/api/v1/auth/login": {"post": {"summary": "Login", "security": [],
      "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "object",
        "required": ["email","password"], "properties": {
          "email": {"type": "string"}, "password": {"type": "string"}}}}}},
      "responses": {"200": {"description": "token"}, "401": {"description": "invalid"}}}},
    "/api/v1/me": {"get": {"summary": "Current principal", "responses": {"200": {"description": "ok"}}}},
    "/api/v1/org": {"get": {"summary": "Current org", "responses": {"200": {"description": "ok"}}}},
    "/api/v1/projects": {
      "get": {"summary": "List projects", "responses": {"200": {"description": "ok"}}},
      "post": {"summary": "Create project (editor+)", "responses": {"201": {"description": "created"}}}},
    "/api/v1/api-keys": {"post": {"summary": "Create API key (admin+)", "responses": {"201": {"description": "created; secret shown once"}}}},
    "/api/v1/watch-areas": {
      "get": {"summary": "List watch areas (GeoJSON FC)", "responses": {"200": {"description": "ok"}}},
      "post": {"summary": "Create watch area (editor+)", "responses": {"201": {"description": "created"}}}},
    "/api/v1/watch-areas/{id}": {"delete": {"summary": "Delete watch area (editor+)",
      "parameters": [{"name": "id", "in": "path", "required": true, "schema": {"type": "string"}}],
      "responses": {"204": {"description": "deleted"}}}},
    "/api/v1/jobs": {
      "get": {"summary": "List jobs", "responses": {"200": {"description": "ok"}}},
      "post": {"summary": "Enqueue job (editor+)", "responses": {"201": {"description": "queued"}}}},
    "/catalog/stac/{path}": {"get": {"summary": "Proxy to STAC search API",
      "parameters": [{"name": "path", "in": "path", "required": true, "schema": {"type": "string"}}],
      "responses": {"200": {"description": "ok"}}}},
    "/catalog/raster/{path}": {"get": {"summary": "Proxy to titiler-pgstac tiler",
      "parameters": [{"name": "path", "in": "path", "required": true, "schema": {"type": "string"}}],
      "responses": {"200": {"description": "ok"}}}}
  }
}`

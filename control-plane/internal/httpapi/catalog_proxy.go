package httpapi

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// reverseProxy strips a path prefix and forwards to an upstream base URL.
// Used to expose eoAPI (STAC search, titiler tiles, tipg vectors) behind the
// authenticated control-plane so the frontend talks to a single origin.
func reverseProxy(base, stripPrefix string) http.HandlerFunc {
	target, err := url.Parse(base)
	if err != nil {
		panic("bad upstream url: " + base)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	origDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		origDirector(req)
		req.URL.Path = "/" + strings.TrimPrefix(strings.TrimPrefix(req.URL.Path, stripPrefix), "/")
		req.Host = target.Host
		// Rewrite tile/link self-references back through the gateway.
		req.Header.Set("X-Forwarded-Host", req.Header.Get("Host"))
	}
	return proxy.ServeHTTP
}

func (s *Server) stacProxy() http.HandlerFunc {
	return reverseProxy(s.cfg.STACURL, "/catalog/stac")
}

func (s *Server) rasterProxy() http.HandlerFunc {
	return reverseProxy(s.cfg.RasterURL, "/catalog/raster")
}

func (s *Server) vectorProxy() http.HandlerFunc {
	return reverseProxy(s.cfg.VectorURL, "/catalog/vector")
}

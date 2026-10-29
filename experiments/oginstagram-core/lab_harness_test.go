package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// Local-only feasibility harness. It changes neither upstream fetch/parse logic nor production routes.
func TestLabServe(t *testing.T) {
	mode := os.Getenv("OG_LAB_MODE")
	if mode == "" {
		t.Skip("explicit local lab mode required")
	}
	cfg := configFromEnv()
	if err := cfg.validate(); err != nil {
		t.Fatal(err)
	}
	store, err := openLocalStore(cfg.DataDir)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	cfg.Store = store
	pool := newSessionPool(cfg)
	if mode == "direct" {
		pool.proxyURL = func() *url.URL { return nil }
		pool.sessions = []*Session{{name: "local-direct", client: buildSessionClient(nil, pool)}}
	}
	signer, err := parseOffloadSigner(`{"active":"lab","keys":{"lab":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}}`)
	if err != nil {
		t.Fatal(err)
	}
	app := newApp(cfg, pool, signer)
	home := map[string]string{}
	for locale := range homeLocales {
		home[locale] = "<!doctype html><h1>Local core experiment</h1>"
	}
	gateway := newGateway(cfg, app, home)
	mux := http.NewServeMux()
	mux.HandleFunc("/lab/post/", func(w http.ResponseWriter, r *http.Request) {
		code := strings.TrimPrefix(r.URL.Path, "/lab/post/")
		if r.Method != "GET" || !regexp.MustCompile(`^[A-Za-z0-9_-]{1,24}$`).MatchString(code) {
			http.Error(w, "invalid request", 400)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
		defer cancel()
		started := time.Now()
		meta := &fetchMeta{}
		post, fetchErr := app.getPost(ctx, code, meta)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		result := map[string]any{"mode": mode, "shortcode": code, "elapsedMs": time.Since(started).Milliseconds(), "fetched": meta.fetched, "privateHelperAvailable": externalHelperPostImpl != nil}
		if fetchErr != nil {
			w.WriteHeader(fetchErr.Status)
			result["error"] = fetchErr.PublicMessage
			result["errorCode"] = fetchErr.Code
		} else {
			result["post"] = post
			result["complete"] = !post.Partial
		}
		_ = json.NewEncoder(w).Encode(result)
	})
	mux.HandleFunc("/lab/report", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(filepath.Dir(cfg.DataDir), "summary.json"))
	})
	mux.HandleFunc("/lab/image/", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/lab/image/")
		if !regexp.MustCompile("^[A-Za-z0-9_-]+-[0-9]+[.](jpg|png|webp)$").MatchString(name) {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(filepath.Dir(cfg.DataDir), "images", name))
	})
	mux.HandleFunc("/lab/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(cfg.AssetsDir, "lab.html"))
	})
	mux.Handle("/", gateway)
	listener, err := net.Listen("tcp", "127.0.0.1:18080")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("local core lab mode=%s address=%s", mode, listener.Addr())
	t.Fatal(http.Serve(listener, mux))
}

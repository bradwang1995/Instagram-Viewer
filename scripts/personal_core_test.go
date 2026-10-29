package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"testing"
	"time"
)

// Compiled into the pinned upstream checkout; exposes only loopback metadata.
func TestPersonalCore(t *testing.T) {
	if os.Getenv("PERSONAL_CORE") != "1" {
		t.Skip("personal mode required")
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
	pool.proxyURL = func() *url.URL { return nil }
	pool.sessions = []*Session{{name: "personal-direct", client: buildSessionClient(nil, pool)}}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	signer, err := parseOffloadSigner(`{"active":"local","keys":{"local":"` + base64.RawURLEncoding.EncodeToString(key) + `"}}`)
	if err != nil {
		t.Fatal(err)
	}
	app := newApp(cfg, pool, signer)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("personal-core-v1")) })
	mux.HandleFunc("/post/", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Path[len("/post/"):]
		if r.Method != "GET" || !regexp.MustCompile(`^[A-Za-z0-9_-]{1,24}$`).MatchString(code) {
			http.Error(w, "invalid request", 400)
			return
		}
		if r.Header.Get("Origin") != "" || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			http.Error(w, "server requests only", 403)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
		defer cancel()
		var post Post
		var fetchErr *AppError
		if r.URL.Query().Get("refresh") == "1" {
			var ttl time.Duration
			var persist bool
			post, ttl, persist, fetchErr = app.fetchPost(ctx, code)
			if fetchErr == nil && persist && !post.Partial {
				app.posts.put(ctx, code, post, ttl)
			}
		} else {
			post, fetchErr = app.getPost(ctx, code, &fetchMeta{})
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if fetchErr != nil {
			w.WriteHeader(fetchErr.Status)
			json.NewEncoder(w).Encode(map[string]any{"errorCode": fetchErr.Code})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"complete": !post.Partial, "post": post})
	})
	server := &http.Server{Addr: "127.0.0.1:18081", Handler: mux, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	t.Fatal(server.ListenAndServe())
}

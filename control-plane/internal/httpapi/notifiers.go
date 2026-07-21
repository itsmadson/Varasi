package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"time"
)

// AlertMessage is the payload delivered to every configured channel.
type AlertMessage struct {
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	Severity  string  `json:"severity"`
	WatchArea string  `json:"watch_area"`
	AreaM2    float64 `json:"changed_area_m2"`
	Fraction  float64 `json:"changed_fraction"`
}

// notify fans an alert out to all channels present in the watch-area `notify`
// config. Each channel is best-effort; failures are logged, never fatal.
//
// Config shape (watch_areas.notify jsonb):
//
//	{ "webhook": {"url": "..."},
//	  "slack":   {"url": "..."},
//	  "discord": {"url": "..."},
//	  "telegram":{"bot_token": "...", "chat_id": "..."},
//	  "email":   {"to": "ops@example.com"} }
func notify(ctx context.Context, cfg map[string]any, msg AlertMessage) {
	for channel, raw := range cfg {
		conf, _ := raw.(map[string]any)
		var err error
		switch channel {
		case "webhook":
			err = postJSON(ctx, str(conf, "url"), msg)
		case "slack":
			err = postJSON(ctx, str(conf, "url"), map[string]string{"text": fmt.Sprintf("*%s*\n%s", msg.Title, msg.Body)})
		case "discord":
			err = postJSON(ctx, str(conf, "url"), map[string]string{"content": fmt.Sprintf("**%s**\n%s", msg.Title, msg.Body)})
		case "telegram":
			err = telegram(ctx, str(conf, "bot_token"), str(conf, "chat_id"), msg)
		case "email":
			err = email(str(conf, "to"), msg)
		default:
			continue
		}
		if err != nil {
			slog.Warn("notifier failed", "channel", channel, "err", err)
		}
	}
}

func str(m map[string]any, k string) string {
	if m == nil {
		return ""
	}
	s, _ := m[k].(string)
	return s
}

func postJSON(ctx context.Context, url string, payload any) error {
	if url == "" {
		return fmt.Errorf("missing url")
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}

func telegram(ctx context.Context, token, chatID string, msg AlertMessage) error {
	if token == "" || chatID == "" {
		return fmt.Errorf("missing telegram token/chat_id")
	}
	api := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	form := url.Values{"chat_id": {chatID}, "text": {msg.Title + "\n" + msg.Body}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, api, bytes.NewBufferString(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("telegram status %d", resp.StatusCode)
	}
	return nil
}

// email sends via SMTP using SMTP_* env (host, port, user, pass, from). No-op if
// SMTP isn't configured — keeps the channel declarable without a mail server.
func email(to string, msg AlertMessage) error {
	host := os.Getenv("SMTP_HOST")
	if host == "" || to == "" {
		return nil
	}
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = "alerts@varasi.local"
	}
	auth := smtp.PlainAuth("", os.Getenv("SMTP_USER"), os.Getenv("SMTP_PASS"), host)
	body := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: [Varasi] %s\r\n\r\n%s\r\n", from, to, msg.Title, msg.Body)
	return smtp.SendMail(host+":"+port, auth, from, []string{to}, []byte(body))
}

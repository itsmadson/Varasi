// Package ws is a minimal per-org WebSocket broadcast hub for live job/alert feeds.
package ws

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(*http.Request) bool { return true }, // gated by auth before upgrade
}

type client struct {
	conn *websocket.Conn
	send chan []byte
}

// Hub fans out messages to all clients subscribed to a given room (org id).
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*client]struct{}
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]map[*client]struct{})}
}

// Broadcast sends a JSON payload to every client in room.
func (h *Hub) Broadcast(room string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[room] {
		select {
		case c.send <- data:
		default: // drop for slow clients
		}
	}
}

func (h *Hub) add(room string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[room] == nil {
		h.rooms[room] = make(map[*client]struct{})
	}
	h.rooms[room][c] = struct{}{}
}

func (h *Hub) remove(room string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.rooms[room]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.rooms, room)
		}
	}
}

// Serve upgrades the connection and pumps broadcasts to the client until close.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, room string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{conn: conn, send: make(chan []byte, 32)}
	h.add(room, c)

	go func() { // reader: discard, detect close
		defer func() { h.remove(room, c); conn.Close() }()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	_ = conn.WriteJSON(map[string]string{"type": "connected", "room": room})
	for data := range c.send {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}
	}
}

# Error Fix Prompts

Prompts and solutions encountered during development.

---

## Error: Client cannot connect

Fix:
- Ensure server is running
- Use correct IP (use `ipconfig` on host machine)
- Both devices on same network

---

## Error: "Connection reset by peer"

Fix:
- Server was closed while client was active
- Restart both server and client

---

## Error: Flask GUI not responding

Fix:
- Port 5000 already in use
Try:
python gui_client.py --port 5051
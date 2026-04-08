# Usage Guide

---

## 1. Start Server
python server/server.py

Choose:
- AES or DES
- Show encrypted packets (y/n)
- Port number

---

## 2. Start CLI Client
python client/client.py

Enter:
- Server IP
- Server port
- Show encrypted packets? (y/n)

---

## 3. Start GUI Client
python client/gui_client.py

Open:
http://127.0.0.1:5000

Type your message → message is encrypted → server decrypts → replies encrypted.

---

## 4. Two-device Support

If using across two devices:
- Both must be on same network (WiFi / hotspot)
- Server IP must be the IP of the server device (use `ipconfig`).
# Workflow & Architecture

Client → Encrypt → Server → Decrypt → Process → Encrypt → Client

pgsql
Copy code

---

## Components

### Server
- Handles encryption & decryption
- Manages continuous messages

### CLI Client
- Sends/receives encrypted text
- Works over LAN

### GUI Client (Flask)
- Web interface in browser
- Ideal for user-friendly interaction

---

## Data Flow

1. Client enters message  
2. Message encrypted  
3. Sent to server  
4. Server decrypts  
5. Server replies with encrypted data  
6. Client decrypts and shows message
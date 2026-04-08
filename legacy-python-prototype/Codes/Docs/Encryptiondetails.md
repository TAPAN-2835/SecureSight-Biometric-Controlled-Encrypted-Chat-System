# Encryption Details

Project uses PyCryptodome.

---

## AES

- Key: 16 bytes
- Block size: 16 bytes
- Mode: ECB
- Padding: PKCS7

---

## DES

- Key: 8 bytes
- Block size: 8 bytes
- Mode: ECB
- Padding: PKCS7

---

## Flow

Message → Pad → Encrypt → Send → Receive → Decrypt → Display
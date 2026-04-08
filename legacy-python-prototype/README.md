# 🛡️ Legacy Python Prototype (Archived)

**WARNING: This directory contains deprecated R&D code.**

This folder houses the initial proof-of-concept for the Secure Chat system. It was built using a Python-based Client-Server architecture over raw TCP sockets to validate the feasibility of:
1. Client-side AES encryption/decryption mechanisms.
2. Real-time facial recognition using `python-opencv` and `face_recognition`.

### Why was this archived?
To make the application more accessible, performant, and scalable, the entire architecture was rewritten into a serverless web application (located in the root's `frontend/` directory). The facial recognition was successfully migrated to run locally in the user's browser via `face-api.js`, and the socket server logic was completely replaced by Supabase Realtime cloud channels.

### Contents
- **`Codes/`**: The original standalone python scripts (`server.py`, `client.py`, `gui_client.py`).
- **`face_db/`**: Local disk-based database storage of registered facial encodings.

*This code is provided "as is" and is no longer being actively maintained or run. For the functional product, please see the `frontend` folder.*

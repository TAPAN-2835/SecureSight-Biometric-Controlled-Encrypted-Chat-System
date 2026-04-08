import socket
import threading
from Crypto.Cipher import AES, DES
from Crypto.Util.Padding import pad, unpad

from face_auth import FaceAuthenticator

# Start Biometric Setup immediately
auth = FaceAuthenticator()
if not auth.is_registered():
    print("Biometric registration required...")
    auth.register_face()
else:
    choice = input("Face already registered. Use existing? (y/n): ").lower().strip()
    if choice != 'y':
        auth.register_face()

print("=== Secure Chat Client ===")
server_ip = input("Enter Server IP address: ")
port = int(input("Enter Server port number: "))

client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client.connect((server_ip, port))
print("Connected to Server.\n")

mode = client.recv(1024).decode()
key = client.recv(1024)
print(f"Encryption Mode: {mode}")
print(f"[Received Key]: {key}\n")

# Start monitoring after connection
auth.start_monitoring()

def send_messages():
    while True:
        try:
            msg = input("")
            if msg.lower() == "exit":
                auth.stop_monitoring()
                client.close()
                exit()

            if mode == "AES":
                cipher = AES.new(key, AES.MODE_ECB)
                enc = cipher.encrypt(pad(msg.encode(), AES.block_size))
            else:
                cipher = DES.new(key, DES.MODE_ECB)
                enc = cipher.encrypt(pad(msg.encode(), DES.block_size))

            is_auth, _ = auth.get_authentication_status()
            if is_auth:
                print(f"[Encrypted Sent]: {enc}")

            client.send(enc)
        except EOFError:
            break
        except Exception as e:
            print(f"Send error: {e}")
            break

def receive_messages():
    while True:
        try:
            data = client.recv(1024)
            if not data:
                break
            
            if mode == "AES":
                decipher = AES.new(key, AES.MODE_ECB)
                dec = unpad(decipher.decrypt(data), AES.block_size)
            else:
                decipher = DES.new(key, DES.MODE_ECB)
                dec = unpad(decipher.decrypt(data), DES.block_size)

            is_auth, reason = auth.get_authentication_status()
            if is_auth:
                print(f"\nFriend: {dec.decode()}")
            else:
                print(f"\nFriend: [ENCRYPTED] {data.hex()} (Reason: {reason})")
                
        except Exception as e:
            break

send_thread = threading.Thread(target=send_messages)
recv_thread = threading.Thread(target=receive_messages)

send_thread.start()
recv_thread.start()
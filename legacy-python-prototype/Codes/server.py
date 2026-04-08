import socket
import os
import threading
from Crypto.Cipher import AES, DES
from Crypto.Util.Padding import pad, unpad

print("=== Secure Chat Server ===")
mode = input("Choose encryption mode (AES/DES): ").upper()

if mode == "AES":
    key = os.urandom(16)
    print("[Generated AES Key]:", key)
elif mode == "DES":
    key = os.urandom(8)
    print("[Generated DES Key]:", key)
else:
    print("Invalid mode. Choose AES or DES.")
    exit()


show_enc = input("Do you want to see encrypted text? (y/n): ").lower() == "y"

port = int(input("Enter port number (e.g., 9999): "))

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind(('0.0.0.0', port))
server.listen(1)
print("Waiting for connection...")

client, addr = server.accept()
print(f"Connected with {addr}")

client.send(mode.encode())
client.send(key)
print("Key sent to client successfully.\n")

def send_messages():
    while True:
        msg = input("")
        if msg.lower() == "exit":
            client.close()
            os._exit(0)

        if mode == "AES":
            cipher = AES.new(key, AES.MODE_ECB)
            enc = cipher.encrypt(pad(msg.encode(), AES.block_size))
        else:
            cipher = DES.new(key, DES.MODE_ECB)
            enc = cipher.encrypt(pad(msg.encode(), DES.block_size))

        if show_enc:
            print(f"[Encrypted Sent]: {enc}")

        client.send(enc)

def receive_messages():
    while True:
        try:
            data = client.recv(1024)
            if not data:
                break
            if show_enc:
                print(f"[Encrypted Received]: {data}")

            if mode == "AES":
                decipher = AES.new(key, AES.MODE_ECB)
                dec = unpad(decipher.decrypt(data), AES.block_size)
            else:
                decipher = DES.new(key, DES.MODE_ECB)
                dec = unpad(decipher.decrypt(data), DES.block_size)

            print(f"\nFriend: {dec.decode()}")
        except:
            break

send_thread = threading.Thread(target=send_messages)
recv_thread = threading.Thread(target=receive_messages)

send_thread.start()
recv_thread.start()
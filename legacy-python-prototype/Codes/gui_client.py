from flask import Flask, render_template_string, request, jsonify
import socket, threading
from Crypto.Cipher import AES, DES
from Crypto.Util.Padding import pad, unpad
from face_auth import FaceAuthenticator

app = Flask(__name__)

html_template = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Secure Chat Client</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Rajdhani:wght@600&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Rajdhani', sans-serif; background: #0a0e27; color: #e0e0e0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; overflow: hidden; position: relative; }
body::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at 20% 50%, rgba(0, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(100, 255, 218, 0.1) 0%, transparent 50%); animation: pulse 8s ease-in-out infinite; pointer-events: none; }
@keyframes pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
.grid-background { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: linear-gradient(rgba(100, 255, 218, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(100, 255, 218, 0.03) 1px, transparent 1px); background-size: 50px 50px; animation: gridMove 20s linear infinite; pointer-events: none; }
@keyframes gridMove { 0% { transform: translateY(0); } 100% { transform: translateY(50px); } }
h2 { font-family: 'Orbitron', sans-serif; color: #64ffda; font-size: 36px; margin-bottom: 30px; text-align: center; position: relative; z-index: 10; letter-spacing: 3px; animation: glowTitle 3s ease-in-out infinite; }
h2::before { content: "▸ "; color: #00ff88; animation: blink 1.5s infinite; }
h2::after { content: " ◂"; color: #00ff88; animation: blink 1.5s infinite 0.75s; }
@keyframes glowTitle { 0%, 100% { text-shadow: 0 0 10px #64ffda, 0 0 20px #64ffda, 0 0 30px #00bfa5; } 50% { text-shadow: 0 0 20px #64ffda, 0 0 40px #64ffda, 0 0 60px #00bfa5, 0 0 80px #00bfa5; } }
@keyframes blink { 0%, 49%, 100% { opacity: 1; } 50%, 99% { opacity: 0.3; } }
#container { width: 100%; max-width: 750px; background: rgba(10, 14, 39, 0.85); border-radius: 20px; box-shadow: 0 0 60px rgba(100, 255, 218, 0.2), inset 0 0 60px rgba(100, 255, 218, 0.03); padding: 40px; backdrop-filter: blur(20px); border: 1px solid rgba(100, 255, 218, 0.2); position: relative; z-index: 10; animation: containerFloat 6s ease-in-out infinite; }
@keyframes containerFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
#container::before { content: ""; position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; background: linear-gradient(45deg, #64ffda, #00bfa5, #90caf9, #64ffda); border-radius: 20px; z-index: -1; opacity: 0; animation: borderGlow 3s linear infinite; background-size: 300% 300%; }
@keyframes borderGlow { 0% { opacity: 0.5; background-position: 0% 50%; } 50% { opacity: 0.8; background-position: 100% 50%; } 100% { opacity: 0.5; background-position: 0% 50%; } }
#connect-box { display: flex; flex-direction: column; gap: 18px; align-items: center; }
input[type="text"], input[type="number"] { width: 100%; max-width: 500px; padding: 16px 24px; border-radius: 12px; border: 2px solid rgba(100, 255, 218, 0.3); background: rgba(13, 37, 56, 0.6); color: #64ffda; font-size: 16px; font-family: 'Rajdhani', sans-serif; font-weight: 600; transition: all 0.4s ease; }
input:focus { border-color: #64ffda; background: rgba(13, 37, 56, 0.9); box-shadow: 0 0 20px rgba(100, 255, 218, 0.4), inset 0 0 20px rgba(100, 255, 218, 0.1); outline: none; transform: scale(1.02); }
input::placeholder { color: rgba(100, 255, 218, 0.4); }
.checkbox-container { display: flex; align-items: center; gap: 12px; margin: 8px 0; padding: 12px 20px; background: rgba(100, 255, 218, 0.05); border-radius: 10px; border: 1px solid rgba(100, 255, 218, 0.2); transition: all 0.3s ease; }
.checkbox-container:hover { background: rgba(100, 255, 218, 0.1); border-color: #64ffda; }
input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; accent-color: #64ffda; }
label { cursor: pointer; user-select: none; color: #90caf9; font-weight: 600; font-size: 16px; }
button { padding: 16px 50px; border-radius: 12px; border: none; background: linear-gradient(135deg, #64ffda, #00bfa5); color: #0a192f; font-weight: 700; font-size: 18px; cursor: pointer; transition: all 0.4s ease; box-shadow: 0 4px 25px rgba(100, 255, 218, 0.4); font-family: 'Orbitron', sans-serif; margin-top: 10px; position: relative; overflow: hidden; letter-spacing: 2px; }
button::before { content: ""; position: absolute; top: 50%; left: 50%; width: 0; height: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.5); transform: translate(-50%, -50%); transition: width 0.6s, height 0.6s; }
button:hover::before { width: 300px; height: 300px; }
button:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 8px 35px rgba(100, 255, 218, 0.6); }
button:active { transform: translateY(0) scale(0.98); }
button span { position: relative; z-index: 1; }
#messages-wrapper { position: relative; border-radius: 12px; overflow: hidden; margin-bottom: 20px; border: 2px solid rgba(100, 255, 218, 0.2); }
#messages { background: rgba(13, 37, 56, 0.4); height: 420px; overflow-y: auto; padding: 20px; position: relative; transition: filter 0.5s ease; }
#privacy-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(10, 14, 39, 0.6); backdrop-filter: blur(10px); z-index: 100; opacity: 0; pointer-events: none; transition: all 0.5s ease; text-align: center; color: #ff5252; padding: 20px; }
#privacy-overlay.active { opacity: 1; pointer-events: all; }
#privacy-overlay h3 { font-family: 'Orbitron', sans-serif; margin-bottom: 10px; letter-spacing: 2px; }
#privacy-overlay .reason { color: #e0e0e0; font-weight: 600; font-size: 14px; background: rgba(255, 82, 82, 0.2); padding: 5px 15px; border-radius: 20px; }
#messages::before { content: "[ SECURE CHANNEL ]"; position: absolute; top: -12px; left: 20px; background: #0a0e27; padding: 0 10px; color: #64ffda; font-size: 12px; font-weight: 700; letter-spacing: 2px; z-index: 101; }
#messages::-webkit-scrollbar { width: 10px; }
#messages::-webkit-scrollbar-track { background: rgba(13, 37, 56, 0.5); border-radius: 10px; }
#messages::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #64ffda, #00bfa5); border-radius: 10px; box-shadow: 0 0 10px rgba(100, 255, 218, 0.5); }
.msg { margin: 14px 0; padding: 12px 18px; border-radius: 10px; background: rgba(100, 255, 218, 0.05); line-height: 1.6; animation: messageSlide 0.5s ease-out; border-left: 3px solid; font-size: 16px; font-weight: 600; }
@keyframes messageSlide { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
.you { color: #64ffda; border-left-color: #64ffda; background: rgba(100, 255, 218, 0.08); box-shadow: 0 0 15px rgba(100, 255, 218, 0.1); }
.friend { color: #90caf9; border-left-color: #90caf9; background: rgba(144, 202, 249, 0.08); box-shadow: 0 0 15px rgba(144, 202, 249, 0.1); }
.enc { color: #ffb74d; border-left-color: #ffb74d; font-size: 0.85em; background: rgba(255, 183, 77, 0.08); box-shadow: 0 0 15px rgba(255, 183, 77, 0.1); }
#error { color: #ff5252; margin-top: 15px; font-weight: 700; animation: errorPulse 1s infinite alternate; text-align: center; padding: 14px; border-radius: 10px; background: rgba(255, 82, 82, 0.15); border: 2px solid #ff5252; box-shadow: 0 0 20px rgba(255, 82, 82, 0.3); letter-spacing: 1px; }
@keyframes errorPulse { from { opacity: 0.7; box-shadow: 0 0 20px rgba(255, 82, 82, 0.3); } to { opacity: 1; box-shadow: 0 0 30px rgba(255, 82, 82, 0.6); } }
#chat-box { display: flex; flex-direction: column; }
.input-group { display: flex; gap: 15px; align-items: center; }
#chat-box input[type="text"] { flex: 1; margin: 0; }
#chat-box button { margin: 0; padding: 16px 35px; }
.status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #00ff88; box-shadow: 0 0 10px #00ff88; animation: statusBlink 2s infinite; margin-right: 8px; }
@keyframes statusBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@media (max-width: 768px) { #container { padding: 25px; } h2 { font-size: 24px; } .input-group { flex-direction: column; } #chat-box button { width: 100%; } }
</style>
</head>
<body>
<div class="grid-background"></div>
<h2>🔐 Secure Chat Client</h2>
<div id="container">
<div id="connect-box">
<input type="text" id="ip" placeholder="▸ Server IP Address (127.0.0.1)"/>
<input type="number" id="port" value="9999" placeholder="▸ Port Number (e.g., 9999)"/>
<div id="auth-status" style="margin: 8px 0; padding: 12px 20px; background: rgba(100, 255, 218, 0.05); border-radius: 10px; border: 1px solid rgba(100, 255, 218, 0.2); color: #90caf9; font-weight: 600;">
    BIOMETRIC STATUS: <span id="auth-text" style="color: #ff5252;">UNAUTHENTICATED</span>
</div>
<button onclick="connectServer()"><span>⚡ ESTABLISH CONNECTION</span></button>
<div id="error"></div>
</div>
<div id="chat-box" style="display:none;">
<div id="messages-wrapper">
    <div id="privacy-overlay">
        <h3>🚨 SECURITY LOCK</h3>
        <span class="reason" id="lock-reason">SHOULDER SURFING DETECTED</span>
        <p style="margin-top:15px; font-size: 14px; opacity:0.8;">Face Authentication Required to View</p>
    </div>
    <div id="messages"></div>
</div>
<div class="input-group">
<input type="text" id="msg" placeholder="▸ Type secure message..." onkeypress="if(event.key==='Enter')sendMessage()"/>
<button onclick="sendMessage()"><span>SEND</span></button>
</div>
</div>
</div>
<script>
let isAuth=false;async function connectServer(){const ip=document.getElementById('ip').value.trim();const port=document.getElementById('port').value.trim();document.getElementById('error').innerText="";if(!ip||!port){showError("⚠ INVALID PARAMETERS: IP and Port Required");return}const res=await fetch("/connect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ip,port})});const data=await res.json();if(data.status==="connected"){document.getElementById("connect-box").style.display="none";document.getElementById("chat-box").style.display="flex";addMessage({text:'<span class="status-indicator"></span>CONNECTION ESTABLISHED | Encryption: '+data.mode.toUpperCase(),isSystem:true},"you");pollMessages();pollAuthStatus()}else{showError("⚠ CONNECTION FAILED: "+data.message)}}function showError(msg){document.getElementById('error').innerText=msg}async function sendMessage(){const msg=document.getElementById('msg').value;if(!msg)return;document.getElementById('msg').value='';addMessage({text:"▸ YOU: "+msg,isSystem:true},"you");await fetch("/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({msg})})}function addMessage(msg,cls){const div=document.createElement("div");div.className="msg "+cls;if(msg.isSystem||typeof msg==='string'){div.innerHTML=msg.text||msg}else{div.setAttribute('data-plain',msg.plain);div.setAttribute('data-enc',msg.enc);div.innerHTML=isAuth?("Friend: "+msg.plain):("Friend: [ENCRYPTED] "+msg.enc)}document.getElementById("messages").appendChild(div);document.getElementById("messages").scrollTop=document.getElementById("messages").scrollHeight}async function pollMessages(){const res=await fetch("/receive");const data=await res.json();if(data.new_messages&&data.new_messages.length>0){data.new_messages.forEach(m=>addMessage(m,"friend"))}setTimeout(pollMessages,1000)}async function pollAuthStatus(){const res=await fetch("/auth_status");const data=await res.json();const authText=document.getElementById("auth-text");const overlay=document.getElementById("privacy-overlay");const reasonText=document.getElementById("lock-reason");const oldAuth=isAuth;isAuth=data.is_authenticated;if(isAuth){authText.innerText="AUTHENTICATED";authText.style.color="#00ff88";overlay.classList.remove("active")}else{authText.innerText="UNAUTHENTICATED";authText.style.color="#ff5252";overlay.classList.add("active");reasonText.innerText=data.reason||"FACE NOT VERIFIED"}if(oldAuth!==isAuth){updateMessageVisibility()}setTimeout(pollAuthStatus,1000)}function updateMessageVisibility(){const msgs=document.querySelectorAll('.msg.friend');msgs.forEach(div=>{const plain=div.getAttribute('data-plain');const enc=div.getAttribute('data-enc');if(plain&&enc){div.innerHTML=isAuth?("Friend: "+plain):("Friend: [ENCRYPTED] "+enc)}})}
</script>
</body>
</html>
"""

client_socket = None
key = None
mode = None
auth = None
running = True
received_messages = []

def receive_thread():
    global running, client_socket, key, mode, auth, received_messages
    while running and client_socket:
        try:
            data = client_socket.recv(1024)
            if not data: break
            
            decipher = AES.new(key, AES.MODE_ECB) if mode == "AES" else DES.new(key, DES.MODE_ECB)
            block_size = AES.block_size if mode == "AES" else DES.block_size
            dec = unpad(decipher.decrypt(data), block_size)
            
            # Store both versions for live toggling
            received_messages.append({
                "plain": dec.decode(),
                "enc": data.hex(),
                "isSystem": False
            })
        except Exception as e:
            print(f"Receive error: {e}")
            break

@app.route("/")
def index():
    return render_template_string(html_template)

@app.route("/connect", methods=["POST"])
def connect_server():
    global client_socket, key, mode, auth, running
    data = request.get_json()
    ip, port = data["ip"], int(data["port"])
    try:
        client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client_socket.connect((ip, port))
        mode = client_socket.recv(1024).decode()
        key = client_socket.recv(1024)
        
        # Use the global auth object initialized at startup
        if not auth:
            auth = FaceAuthenticator()
            
        if not auth.is_registered():
            auth.register_face()
        auth.start_monitoring()
        
        running = True
        threading.Thread(target=receive_thread, daemon=True).start()
        return jsonify({"status": "connected", "message": "Connected successfully", "mode": mode})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Connection failed: {str(e)}"})

@app.route("/send", methods=["POST"])
def send_message():
    global client_socket, key, mode, auth, received_messages
    data = request.get_json()
    msg = data["msg"]
    if not client_socket:
        return jsonify({"status": "error", "message": "Not connected"})
    if msg.lower() == "exit":
        try: 
            if auth: auth.stop_monitoring()
            client_socket.close()
        except: pass
        return jsonify({"status": "closed"})
    try:
        cipher = AES.new(key, AES.MODE_ECB) if mode == "AES" else DES.new(key, DES.MODE_ECB)
        block_size = AES.block_size if mode == "AES" else DES.block_size
        enc = cipher.encrypt(pad(msg.encode(), block_size))
        
        # Authenticate check before showing encrypted sent message in preview
        is_auth, _ = auth.get_authentication_status() if auth else (False, "")
        if auth and is_auth:
            received_messages.append({
                "text": f"<div class='enc'>[Encrypted Sent]: {enc.hex()}</div>",
                "isSystem": True
            })
            
        client_socket.send(enc)
        return jsonify({"status": "sent"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route("/auth_status", methods=["GET"])
def get_auth_status():
    global auth
    is_authenticated, reason = auth.get_authentication_status() if auth else (False, "AUTH NOT INITIALIZED")
    return jsonify({"is_authenticated": is_authenticated, "reason": reason})

@app.route("/receive", methods=["GET"])
def receive_message():
    global received_messages
    msgs = received_messages[:]
    received_messages = []
    return jsonify({"new_messages": msgs})

if __name__ == "__main__":
    print("=== Secure Chat Biometric Setup ===")
    auth = FaceAuthenticator()
    # Check registration immediately at startup
    if not auth.is_registered():
        print("Registration required...")
        auth.register_face()
    else:
        choice = input("Face already registered. Use existing? (y/n): ").lower().strip()
        if choice != 'y':
            auth.register_face()
            
    print("🚀 GUI Chat Client running at http://127.0.0.1:5000")
    app.run(debug=True, use_reloader=False)
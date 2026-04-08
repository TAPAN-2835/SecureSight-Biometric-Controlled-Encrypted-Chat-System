"""
Face Recognition Automation System - STABLE VERSION
====================================================
Opens apps in sequence when registered face is detected.
Closes app when face disappears or multiple faces appear.

APPS SEQUENCE:
1. Notepad
2. Google Chrome
3. Command Prompt (CMD)
4. Microsoft Word

STABILITY IMPROVEMENTS:
- Uses rolling average of last 10 frames for stable detection
- Ignores brief detection flickers
- Only changes state after consistent detection

Libraries Required:
  pip install opencv-python opencv-contrib-python numpy
"""

import cv2
import os
import subprocess
import time
import numpy as np
from enum import Enum
from collections import deque   

# =============================================================================
# CONFIGURATION
# =============================================================================

FACE_DB_FOLDER = "face_db"
MODEL_FILE = os.path.join(FACE_DB_FOLDER, "face_model.yml")
REGISTERED_FACE_FILE = os.path.join(FACE_DB_FOLDER, "registered_face.jpg")

# Apps to open: (Name, Command, Process name for taskkill)
APPS_TO_OPEN = [
    ("Notepad", "notepad.exe", "notepad.exe"),
    ("Google Chrome", "chrome", "chrome.exe"),
    ("Command Prompt", "cmd.exe", "cmd.exe"),
    ("Microsoft Word", "winword", "WINWORD.EXE"),
]

# Detection settings
CONFIDENCE_THRESHOLD = 85           # Higher = more lenient (LBPH)
VERIFICATION_TIME = 2.0             # Seconds to wait before opening app
STABILITY_FRAMES = 10               # Number of frames for rolling average
STABILITY_THRESHOLD = 0.7           # 70% of frames must agree

# =============================================================================
# STATE MACHINE
# =============================================================================

class State(Enum):
    IDLE = "IDLE"
    VERIFYING = "VERIFYING"
    APP_OPEN = "APP_OPEN"

# =============================================================================
# GLOBALS
# =============================================================================

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
face_recognizer = cv2.face.LBPHFaceRecognizer_create()

current_state = State.IDLE
current_app_index = 0
verification_start_time = None
current_app_name = None

# Rolling buffer for stable detection
detection_buffer = deque(maxlen=STABILITY_FRAMES)

# =============================================================================
# STABILITY FUNCTION
# =============================================================================

def get_stable_detection(is_valid_now):
    """
    Uses rolling average to smooth out detection flickers.
    Returns True only if majority of recent frames show valid detection.
    """
    detection_buffer.append(1 if is_valid_now else 0)

    if len(detection_buffer) < STABILITY_FRAMES:
        return False  # Not enough data yet

    avg = sum(detection_buffer) / len(detection_buffer)
    return avg >= STABILITY_THRESHOLD

# =============================================================================
# APP CONTROL
# =============================================================================

def open_app(name, command):
    global current_app_name
    try:
        print(f"\n>>> OPENING: {name}")
        subprocess.Popen(f'start "" "{command}"', shell=True)
        current_app_name = name
        print(f"    SUCCESS!")
        return True
    except Exception as e:
        print(f"    ERROR: {e}")
        return False

def close_app(process_name):
    global current_app_name
    try:
        print(f"\n<<< CLOSING: {current_app_name}")
        subprocess.run(f'taskkill /IM "{process_name}" /F', shell=True,
                      capture_output=True)
        print(f"    CLOSED!")
        current_app_name = None
    except:
        pass

# =============================================================================
# REGISTRATION
# =============================================================================

def create_folder():
    if not os.path.exists(FACE_DB_FOLDER):
        os.makedirs(FACE_DB_FOLDER)

def register_face():
    print("\n" + "=" * 40)
    print("  FACE REGISTRATION")
    print("=" * 40)
    print("Press 'c' to capture | 'q' to quit\n")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam!")
        return False

    samples = []
    required = 30

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(100, 100))

        for (x, y, w, h) in faces:
            cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)

        cv2.putText(frame, f"Samples: {len(samples)}/{required}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.imshow("Registration", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('c'):
            if len(faces) != 1:
                print(f"Need 1 face! Detected: {len(faces)}")
                continue

            print("Capturing...")
            for _ in range(required):
                ret, frame = cap.read()
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(100, 100))
                if len(faces) == 1:
                    (x, y, w, h) = faces[0]
                    samples.append(cv2.resize(gray[y:y+h, x:x+w], (200, 200)))
                    if len(samples) == 1:
                        cv2.imwrite(REGISTERED_FACE_FILE, frame)
                    print(f"  Sample {len(samples)}/{required}")
                cv2.waitKey(50)
            if len(samples) >= required:
                break

        elif key == ord('q'):
            cap.release()
            cv2.destroyAllWindows()
            return False

    cap.release()
    cv2.destroyAllWindows()

    if len(samples) >= 10:
        print("Training model...")
        face_recognizer.train(samples, np.array([1] * len(samples)))
        face_recognizer.write(MODEL_FILE)
        print("Model saved!")
        return True
    return False

def load_model():
    if os.path.exists(MODEL_FILE):
        face_recognizer.read(MODEL_FILE)
        print("Model loaded!")
        return True
    return False

# =============================================================================
# MAIN DETECTION
# =============================================================================

def run_detection():
    global current_state, current_app_index, verification_start_time, detection_buffer

    print("\n" + "=" * 40)
    print("  DETECTION STARTED")
    print("=" * 40)
    print(f"Apps: {[a[0] for a in APPS_TO_OPEN]}")
    print("Press 'q' to quit\n")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam!")
        return

    current_state = State.IDLE
    current_app_index = 0
    detection_buffer.clear()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(100, 100))
        face_count = len(faces)
        now = time.time()

        # Check if current frame has valid single matched face
        frame_valid = False
        confidence = 999

        if face_count == 1:
            (x, y, w, h) = faces[0]
            face_roi = cv2.resize(gray[y:y+h, x:x+w], (200, 200))
            label, confidence = face_recognizer.predict(face_roi)
            frame_valid = confidence < CONFIDENCE_THRESHOLD

            color = (0, 255, 0) if frame_valid else (0, 0, 255)
            cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
            text = f"{'MATCH' if frame_valid else 'NO MATCH'} ({confidence:.0f})"
            cv2.putText(frame, text, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        else:
            for (x, y, w, h) in faces:
                cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 165, 255), 2)

        # Get stable detection (uses rolling average)
        stable_valid = get_stable_detection(frame_valid)

        # STATE MACHINE with stable detection
        if current_state == State.IDLE:
            if stable_valid:
                current_state = State.VERIFYING
                verification_start_time = now
                print(f"\n[STABLE] Face detected -> VERIFYING")

        elif current_state == State.VERIFYING:
            if not stable_valid:
                current_state = State.IDLE
                verification_start_time = None
                print(f"\n[STABLE] Face lost -> IDLE")
            else:
                elapsed = now - verification_start_time
                if elapsed >= VERIFICATION_TIME:
                    name, cmd, proc = APPS_TO_OPEN[current_app_index]
                    if open_app(name, cmd):
                        current_state = State.APP_OPEN

        elif current_state == State.APP_OPEN:
            if not stable_valid:
                name, cmd, proc = APPS_TO_OPEN[current_app_index]
                close_app(proc)
                current_app_index += 1

                if current_app_index >= len(APPS_TO_OPEN):
                    print("\n" + "=" * 40)
                    print("  ALL APPS DONE!")
                    print("=" * 40)
                    time.sleep(2)
                    break

                current_state = State.IDLE
                print(f"\n[NEXT] App {current_app_index + 1}: {APPS_TO_OPEN[current_app_index][0]}")

        # UI
        colors = {State.IDLE: (128, 128, 128), State.VERIFYING: (0, 255, 255), State.APP_OPEN: (0, 255, 0)}
        cv2.putText(frame, f"State: {current_state.value}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, colors[current_state], 2)
        cv2.putText(frame, f"Faces: {face_count} | Stable: {'YES' if stable_valid else 'NO'}",
                    (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Next: {APPS_TO_OPEN[current_app_index][0]} ({current_app_index+1}/{len(APPS_TO_OPEN)})",
                    (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 200, 100), 2)

        if current_state == State.VERIFYING:
            elapsed = now - verification_start_time
            bar_w = int(200 * min(elapsed / VERIFICATION_TIME, 1.0))
            cv2.rectangle(frame, (10, 110), (210, 130), (50, 50, 50), -1)
            cv2.rectangle(frame, (10, 110), (10 + bar_w, 130), (0, 255, 255), -1)

        cv2.imshow("Detection - 'q' to Quit", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            if current_state == State.APP_OPEN:
                close_app(APPS_TO_OPEN[current_app_index][2])
            break

    cap.release()
    cv2.destroyAllWindows()

# =============================================================================
# MAIN
# =============================================================================

def main():
    print("\n" + "=" * 40)
    print("  FACE AUTOMATION v4.0 (STABLE)")
    print("=" * 40)

    create_folder()

    if os.path.exists(MODEL_FILE):
        choice = input("\nUse existing face? (y/n): ").strip().lower()
        if choice == 'y':
            if not load_model():
                if not register_face():
                    return
        else:
            if not register_face():
                return
    else:
        if not register_face():
            return

    input("\nPress Enter to start...")
    run_detection()
    print("\nDone!")

if __name__ == "__main__":
    main()

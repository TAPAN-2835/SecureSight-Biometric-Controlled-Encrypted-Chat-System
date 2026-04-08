import cv2
import os
import time
import threading
import numpy as np
from enum import Enum
from collections import deque

class AuthState(Enum):
    UNAUTHENTICATED = "UNAUTHENTICATED"
    AUTHENTICATED = "AUTHENTICATED"
    LOCKED_MULTI_FACE = "LOCKED_MULTI_FACE"
    LOCKED_INTRUSION = "LOCKED_INTRUSION"
    LOCKED_NO_FACE = "LOCKED_NO_FACE"
    UNREGISTERED = "UNREGISTERED"

class FaceAuthenticator:
    def __init__(self, db_path="face_db"):
        self.db_path = db_path
        self.model_path = os.path.join(self.db_path, "face_model_v2.yml")
        
        # OpenCV Cascades
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        
        # Use Upper Body Cascade for more sensitive intrusion detection (shoulders/torso)
        self.upper_body_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_upperbody.xml")
        
        self.face_recognizer = cv2.face.LBPHFaceRecognizer_create()
        
        # State variables
        self.is_authenticated = False
        self.running = False
        self.current_state = AuthState.UNAUTHENTICATED
        self.lock_reason = ""
        
        # Performance & Security Parameters
        self.confidence_threshold = 75   
        self.frame_skip = 2             
        
        # INCREASED RESOLUTION for better background detection (0.5 instead of 0.25)
        self.resize_scale = 0.5        
        
        if not os.path.exists(self.db_path):
            os.makedirs(self.db_path)
            
        self.load_model()

    def is_registered(self):
        return os.path.exists(self.model_path)

    def register_face(self):
        print("\n" + "=" * 40)
        print("  FACE REGISTRATION (RESILIENT OPENCV)")
        print("=" * 40)
        
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW) or cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[ERROR] Could not open webcam.")
            return False

        positions = ["STAY NEUTRAL (Look Straight)", "TURN SLIGHTLY LEFT", "TURN SLIGHTLY RIGHT"]
        samples = []
        labels = []
        
        for pos in positions:
            print(f"\n---> ACTION: {pos}")
            print("Press 'c' to start capturing for this angle...")
            
            angle_samples = 0
            while angle_samples < 30:
                ret, frame = cap.read()
                if not ret: continue
                
                display_frame = frame.copy()
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(100, 100))
                
                for (x, y, w, h) in faces:
                    cv2.rectangle(display_frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                
                cv2.putText(display_frame, f"Mode: {pos}", (10, 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(display_frame, f"Samples: {angle_samples}/30", (10, 60), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                
                cv2.imshow("Registration", display_frame)
                
                key = cv2.waitKey(1) & 0xFF
                if key == ord('c') and len(faces) == 1:
                    print(f"Capturing samples for {pos}...")
                    while angle_samples < 30:
                        ret, frame = cap.read()
                        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                        faces = self.face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(100, 100))
                        
                        if len(faces) == 1:
                            (x, y, w, h) = faces[0]
                            roi = cv2.resize(gray[y:y+h, x:x+w], (200, 200))
                            samples.append(roi)
                            labels.append(1)
                            angle_samples += 1
                            print(f"  {angle_samples}/30", end="\r")
                        cv2.waitKey(50)
                elif key == ord('q'):
                    cap.release()
                    cv2.destroyAllWindows()
                    return False

        cap.release()
        cv2.destroyAllWindows()

        if len(samples) >= 90:
            self.face_recognizer.train(samples, np.array(labels))
            self.face_recognizer.write(self.model_path)
            return True
        return False

    def load_model(self):
        if self.is_registered():
            try:
                self.face_recognizer.read(self.model_path)
                return True
            except: return False
        return False

    def start_monitoring(self):
        if not self.load_model(): return
        self.running = True
        threading.Thread(target=self._monitor_loop, daemon=True).start()

    def stop_monitoring(self):
        self.running = False

    def _monitor_loop(self):
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW) or cv2.VideoCapture(0)
        iter_count = 0
        
        while self.running:
            ret, frame = cap.read()
            if not ret or frame is None: continue

            iter_count += 1
            if iter_count % self.frame_skip != 0:
                continue

            # RESILIENT DETECTION: Enhanced with Higher Res and Body Tracking
            small_gray = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (0,0), fx=self.resize_scale, fy=self.resize_scale)
            
            # 1. FACE DETECTION
            faces = self.face_cascade.detectMultiScale(small_gray, 1.1, 5, minSize=(30, 30))
            face_count = len(faces)

            # 2. UPPER BODY DETECTION (High Sensitivity for Background Intrusion)
            bodies = self.upper_body_cascade.detectMultiScale(small_gray, 1.1, 3, minSize=(50, 50))
            body_count = len(bodies)

            # SECURITY LOGIC: INTRUSION PRIORITY
            # Lock if body count is greater than 1, or multiple faces found.
            if body_count > 1:
                self.is_authenticated = False
                self.current_state = AuthState.LOCKED_INTRUSION
                self.lock_reason = "INTRUSION DETECTED (BODY IN BACKGROUND)"
            elif face_count > 1:
                self.is_authenticated = False
                self.current_state = AuthState.LOCKED_MULTI_FACE
                self.lock_reason = "SHOULDER SURFING DETECTED"
            elif face_count == 0:
                self.is_authenticated = False
                self.current_state = AuthState.LOCKED_NO_FACE
                self.lock_reason = "NO FACE DETECTED"
            else:
                # Exactly one face -> Identify
                (x, y, w, h) = faces[0]
                roi = cv2.resize(small_gray[y:y+h, x:x+w], (200, 200))
                label, confidence = self.face_recognizer.predict(roi)
                
                if confidence < self.confidence_threshold:
                    self.is_authenticated = True
                    self.current_state = AuthState.AUTHENTICATED
                    self.lock_reason = ""
                else:
                    self.is_authenticated = False
                    self.current_state = AuthState.UNAUTHENTICATED
                    self.lock_reason = "IDENTITY UNKNOWN"

            time.sleep(0.01)
        cap.release()

    def get_authentication_status(self):
        return self.is_authenticated, self.lock_reason

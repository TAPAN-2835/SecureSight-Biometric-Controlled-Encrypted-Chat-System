import * as faceapi from 'face-api.js';

// Using official remote models to bypass local git-lfs corruption
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

/**
 * TinyFaceDetector options.
 * inputSize 320 → better landmark accuracy than 224.
 * scoreThreshold 0.15 → much more sensitive; catches faces in varied lighting/angles.
 */
export const TINY_FACE_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.15,
});

/**
 * Load all necessary face detection and recognition models.
 */
export async function loadFaceModels() {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    console.log('✅ Face models loaded from:', MODEL_URL);
  } catch (err) {
    console.error('❌ Failed to load face detection modules:', err);
    throw err;
  }
}

/**
 * Start the webcam and wait until the video element has real dimensions
 * before resolving — prevents detection running on a blank frame.
 */
export async function startWebcam(videoElement: HTMLVideoElement): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        facingMode: 'user',
      },
    });
    videoElement.srcObject = stream;

    // Wait for the video to actually have pixel dimensions
    await new Promise<void>((resolve) => {
      if (videoElement.videoWidth > 0) {
        resolve();
        return;
      }
      const onMeta = () => {
        videoElement.removeEventListener('loadedmetadata', onMeta);
        resolve();
      };
      videoElement.addEventListener('loadedmetadata', onMeta);
    });

    // Extra 200 ms buffer so the first frame isn't black
    await new Promise((r) => setTimeout(r, 200));

    return stream;
  } catch (err) {
    console.error('Webcam access denied:', err);
    throw err;
  }
}

/**
 * Capture a 128-D face descriptor from the video element.
 * Returns null if no face is found in the current frame.
 */
export async function getFaceDescriptor(videoElement: HTMLVideoElement) {
  if (videoElement.videoWidth === 0) return null;

  const detection = await faceapi
    .detectSingleFace(videoElement, TINY_FACE_DETECTOR_OPTIONS)
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection ? detection.descriptor : null;
}

/**
 * Return all detected faces (used for multi-person / shoulder-surfing check).
 */
export async function detectFaces(videoElement: HTMLVideoElement) {
  if (videoElement.videoWidth === 0) return [];
  return faceapi.detectAllFaces(videoElement, TINY_FACE_DETECTOR_OPTIONS);
}

/**
 * Verify identity by comparing the live descriptor against stored encodings.
 *
 * Threshold tuning (face-api.js euclidean distance):
 *   0.00 → identical (100 %)
 *   0.40 → very confident match
 *   0.60 → acceptable match  ← UNLOCK threshold
 *   0.80 → probably different person
 *
 * Confidence score: linearly maps 0.0 → 100 %, 0.80 → 0 %
 * so that a 0.60 distance shows as ~25 % while a 0.40 shows ~50 %.
 * We use a softer scale (divide by 0.80) so newly-registered users
 * with slight expression changes still read a healthy percentage.
 */
export function verifyFaceMatchAll(
  currentDescriptor: Float32Array,
  storedDescriptors: number[][]
) {
  let minDistance = Infinity;

  for (const stored of storedDescriptors) {
    const dist = faceapi.euclideanDistance(currentDescriptor, new Float32Array(stored));
    if (dist < minDistance) minDistance = dist;
  }

  // Unlock if distance is within 0.60 (generous but not insecure)
  const MATCH_THRESHOLD = 0.60;
  const isMatch = minDistance <= MATCH_THRESHOLD;

  // Map distance to 0–100 % (0.0 → 100 %, 0.80 → 0 %)
  const confidenceScore = Math.max(
    0,
    Math.min(100, Math.round((1 - minDistance / 0.80) * 100))
  );

  return { isMatch, distance: minDistance, confidence: confidenceScore };
}

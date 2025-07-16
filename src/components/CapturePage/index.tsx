import styles from './styles.module.scss';
import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import type { CapturedImage } from '@/types';

interface Props {
  onComplete: (images: CapturedImage[]) => void;
}

type FaceDirection = 'front' | 'right' | 'left';

const CapturePage: React.FC<Props> = ({ onComplete }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'center' | 'right' | 'left' | 'complete'>('center');
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentDirection, setCurrentDirection] = useState<FaceDirection | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [stabilityCount, setStabilityCount] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const stableDirectionCountRef = useRef<number>(0);
  const lastDirectionRef = useRef<FaceDirection | null>(null);
  const consecutiveDetectionsRef = useRef<FaceDirection[]>([]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        // Use the correct model path for face-api.js
        const MODEL_URL = '/models';
        
        // Load only the models we need
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        
        console.log('Face-api models loaded successfully');
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading models:', err);
        // Fallback to CDN
        try {
          const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
          ]);
          console.log('Face-api models loaded from CDN');
          setIsLoading(false);
        } catch (cdnErr) {
          console.error('Error loading models from CDN:', cdnErr);
          setError('Failed to load face detection models. Please refresh the page.');
          setIsLoading(false);
        }
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            facingMode: 'user'
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError('Failed to access camera. Please allow camera permissions.');
      }
    };

    if (!isLoading) {
      initCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isLoading]);

  const determineFaceDirection = (landmarks: faceapi.FaceLandmarks68): FaceDirection => {
    const points = landmarks.positions;
    
    // More precise landmark points for direction detection
    const noseTip = points[30];           // Nose tip
    const leftEyeOuter = points[36];      // Left eye outer corner
    const rightEyeOuter = points[45];     // Right eye outer corner
    const leftEyeInner = points[39];      // Left eye inner corner
    const rightEyeInner = points[42];     // Right eye inner corner
    const leftMouthCorner = points[48];   // Left mouth corner
    const rightMouthCorner = points[54];  // Right mouth corner
    
    // Calculate eye centers
    const leftEyeCenter = {
      x: (leftEyeOuter.x + leftEyeInner.x) / 2,
      y: (leftEyeOuter.y + leftEyeInner.y) / 2
    };
    
    const rightEyeCenter = {
      x: (rightEyeOuter.x + rightEyeInner.x) / 2,
      y: (rightEyeOuter.y + rightEyeInner.y) / 2
    };
    
    // Calculate face center line
    const faceCenterX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
    const eyeDistance = Math.abs(rightEyeCenter.x - leftEyeCenter.x);
    
    // Calculate nose deviation from center
    const noseDeviation = (noseTip.x - faceCenterX) / eyeDistance;
    
    // Calculate mouth asymmetry
    const mouthCenterX = (leftMouthCorner.x + rightMouthCorner.x) / 2;
    const mouthDeviation = (mouthCenterX - faceCenterX) / eyeDistance;
    
    // Calculate eye visibility ratio
    const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
    const rightEyeWidth = Math.abs(rightEyeOuter.x - rightEyeInner.x);
    const eyeRatio = leftEyeWidth / rightEyeWidth;
    
    // Improved thresholds based on multiple features
    const FRONT_THRESHOLD = 0.1;
    const PROFILE_THRESHOLD = 0.2;
    
    // Direction determination with multiple criteria
    const avgDeviation = (noseDeviation + mouthDeviation) / 2;
    
    if (Math.abs(avgDeviation) < FRONT_THRESHOLD && eyeRatio > 0.8 && eyeRatio < 1.25) {
      return 'front';
    } else if (avgDeviation > PROFILE_THRESHOLD || eyeRatio > 1.4) {
      return 'right'; // Face turned right (our left when mirrored)
    } else if (avgDeviation < -PROFILE_THRESHOLD || eyeRatio < 0.6) {
      return 'left'; // Face turned left (our right when mirrored)
    }
    
    return 'front'; // Default to front
  };

  const updateStabilityCount = (direction: FaceDirection) => {
    // Track last 10 detections
    consecutiveDetectionsRef.current.push(direction);
    if (consecutiveDetectionsRef.current.length > 10) {
      consecutiveDetectionsRef.current.shift();
    }
    
    // Count how many of the last detections match the current direction
    const matchingDetections = consecutiveDetectionsRef.current.filter(d => d === direction).length;
    stableDirectionCountRef.current = matchingDetections;
    setStabilityCount(matchingDetections);
  };

  const captureImage = async (direction: FaceDirection) => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;

    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Could not get canvas context');
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw the mirrored video frame
      context.save();
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
      context.drawImage(video, 0, 0);
      context.restore();

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      const positionMap: Record<FaceDirection, 'center' | 'right' | 'left'> = {
        'front': 'center',
        'right': 'right',
        'left': 'left'
      };
      
      const newImage: CapturedImage = {
        dataUrl,
        position: positionMap[direction]
      };

      const updatedImages = [...capturedImages, newImage];
      setCapturedImages(updatedImages);

      // Move to next step
      if (currentStep === 'center') {
        setCurrentStep('right');
      } else if (currentStep === 'right') {
        setCurrentStep('left');
      } else if (currentStep === 'left') {
        setCurrentStep('complete');
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        onComplete(updatedImages);
      }

      // Reset counters
      stableDirectionCountRef.current = 0;
      consecutiveDetectionsRef.current = [];
      lastCaptureTimeRef.current = Date.now();
      setError(null);
      setStabilityCount(0);
      
    } catch (err) {
      console.error('Error capturing image:', err);
      setError('Failed to capture image. Please try again.');
    }
    
    setIsCapturing(false);
  };

  const detectFaces = async () => {
    if (!videoRef.current || !overlayCanvasRef.current || isCapturing) {
      animationFrameRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas.getContext('2d');

    if (!overlayCtx || video.readyState !== 4) {
      animationFrameRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    // Update canvas size to match video
    const videoRect = video.getBoundingClientRect();
    overlayCanvas.width = video.videoWidth;
    overlayCanvas.height = video.videoHeight;
    overlayCanvas.style.width = `${videoRect.width}px`;
    overlayCanvas.style.height = `${videoRect.height}px`;

    // Clear previous drawings
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    try {
      const detections = await faceapi.detectAllFaces(
        video, 
        new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 416, 
          scoreThreshold: 0.5 
        })
      ).withFaceLandmarks();

      // Apply mirroring to match video display
      overlayCtx.save();
      overlayCtx.scale(-1, 1);
      overlayCtx.translate(-overlayCanvas.width, 0);

      if (detections.length === 1) {
        const detection = detections[0];
        const { x, y, width, height } = detection.detection.box;
        
        // Determine face direction
        const direction = determineFaceDirection(detection.landmarks);
        setCurrentDirection(direction);
        updateStabilityCount(direction);
        
        // Check if this is the direction we're looking for
        const targetDirection = currentStep === 'center' ? 'front' : 
                              currentStep === 'right' ? 'right' : 'left';
        
        const isCorrectDirection = direction === targetDirection;
        const isStable = stableDirectionCountRef.current >= 8; // 8 out of 10 detections
        
        // Auto-capture logic
        const now = Date.now();
        const timeSinceLastCapture = now - lastCaptureTimeRef.current;
        const cooldownPassed = timeSinceLastCapture > 1500; // 1.5 second cooldown
        
        if (isCorrectDirection && isStable && cooldownPassed && currentStep !== 'complete') {
          captureImage(direction);
        }
        
        // Draw face bounding box
        overlayCtx.strokeStyle = isCorrectDirection && isStable ? '#00ff00' : '#ff9900';
        overlayCtx.lineWidth = 3;
        overlayCtx.strokeRect(x, y, width, height);
        
        // Draw confidence and direction info
        overlayCtx.fillStyle = isCorrectDirection && isStable ? '#00ff00' : '#ff9900';
        overlayCtx.font = 'bold 16px Arial';
        overlayCtx.strokeStyle = '#000000';
        overlayCtx.lineWidth = 3;
        overlayCtx.strokeText(`${Math.round(detection.detection.score * 100)}% - ${direction}`, x, y - 10);
        overlayCtx.fillText(`${Math.round(detection.detection.score * 100)}% - ${direction}`, x, y - 10);
        
        // Draw key landmarks
        overlayCtx.fillStyle = '#ffff00';
        const keyPoints = [30, 36, 45, 39, 42, 48, 54]; // nose, eyes, mouth corners
        keyPoints.forEach(pointIndex => {
          const point = detection.landmarks.positions[pointIndex];
          overlayCtx.fillRect(point.x - 2, point.y - 2, 4, 4);
        });
        
      } else {
        // Reset stability when no single face is detected
        stableDirectionCountRef.current = 0;
        consecutiveDetectionsRef.current = [];
        setCurrentDirection(null);
        setStabilityCount(0);
      }

      overlayCtx.restore();
      
      // Draw status text
      overlayCtx.fillStyle = '#ffffff';
      overlayCtx.font = 'bold 18px Arial';
      overlayCtx.strokeStyle = '#000000';
      overlayCtx.lineWidth = 2;
      
      let statusText = '';
      if (detections.length === 0) {
        statusText = 'No face detected';
        overlayCtx.fillStyle = '#ff0000';
      } else if (detections.length === 1) {
        const targetDirection = currentStep === 'center' ? 'front' : 
                              currentStep === 'right' ? 'right' : 'left';
        const isCorrect = currentDirection === targetDirection;
        const isStable = stableDirectionCountRef.current >= 8;
        
        if (isCorrect && isStable) {
          statusText = 'Perfect! Capturing...';
          overlayCtx.fillStyle = '#00ff00';
        } else if (isCorrect) {
          statusText = `Good! Hold steady... (${stableDirectionCountRef.current}/10)`;
          overlayCtx.fillStyle = '#ff9900';
        } else {
          statusText = `Turn ${targetDirection === 'front' ? 'forward' : targetDirection}`;
          overlayCtx.fillStyle = '#ff9900';
        }
      } else {
        statusText = 'Multiple faces detected - show only one face';
        overlayCtx.fillStyle = '#ff0000';
      }
      
      overlayCtx.strokeText(statusText, 10, 30);
      overlayCtx.fillText(statusText, 10, 30);

    } catch (err) {
      console.error('Detection error:', err);
      overlayCtx.restore();
    }

    // Continue detection loop
    animationFrameRef.current = requestAnimationFrame(detectFaces);
  };

  useEffect(() => {
    if (!isLoading && videoRef.current && currentStep !== 'complete') {
      const video = videoRef.current;
      
      const handleVideoReady = () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(detectFaces);
      };

      video.addEventListener('loadedmetadata', handleVideoReady);
      video.addEventListener('play', handleVideoReady);
      
      return () => {
        video.removeEventListener('loadedmetadata', handleVideoReady);
        video.removeEventListener('play', handleVideoReady);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [isLoading, currentStep, currentDirection]);

  const getInstructionText = () => {
    switch (currentStep) {
      case 'center':
        return 'Look straight at the camera and hold steady';
      case 'right':
        return 'Turn your head to the right and hold steady';
      case 'left':
        return 'Turn your head to the left and hold steady';
      case 'complete':
        return 'Capture complete!';
      default:
        return '';
    }
  };

  const getProgressText = () => {
    switch (currentStep) {
      case 'center':
        return 'Step 1 of 3: Front Position';
      case 'right':
        return 'Step 2 of 3: Right Position';
      case 'left':
        return 'Step 3 of 3: Left Position';
      case 'complete':
        return 'Complete!';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <div className={styles.LoadingContainer}>
        <h2 className={styles.LoadingTitle}>Loading Face Detection...</h2>
        <p className={styles.LoadingText}>Please wait while we load the face detection models...</p>
        <div className={styles.LoadingSpinner}></div>
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div className={styles.CompleteContainer}>
        <h2 className={styles.CompleteTitle}>Capture Complete!</h2>
        <p className={styles.CompleteText}>All 3 images captured successfully!</p>
      </div>
    );
  }

  return (
    <div className={styles.CaptureContainer}>
      <h2 className={styles.Title}>Face Capture</h2>
      
      <div className={styles.ProgressSection}>
        <p className={styles.ProgressText}>{getProgressText()}</p>
        <p className={styles.InstructionText}>{getInstructionText()}</p>
      </div>

      <div className={styles.VideoContainer}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={styles.Video}
        />
        
        <canvas
          ref={overlayCanvasRef}
          className={styles.OverlayCanvas}
        />
        
        <canvas
          ref={canvasRef}
          className={styles.HiddenCanvas}
        />
      </div>

      {error && (
        <div className={styles.ErrorContainer}>
          {error}
        </div>
      )}

      <div className={styles.StatusContainer}>
        <p className={styles.StatusText}>
          Current direction: {currentDirection || 'Unknown'}
        </p>
        <p className={styles.StatusText}>
          Stability: {stabilityCount}/10
        </p>
        <p className={styles.StatusText}>
          Target: {currentStep === 'center' ? 'front' : currentStep}
        </p>
      </div>

      <div className={styles.ProgressIndicator}>
        <div className={styles.StepIndicators}>
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`${styles.StepCircle} ${step <= capturedImages.length ? styles.Completed : ''}`}
            >
              {step}
            </div>
          ))}
        </div>
        <p className={styles.ImagesCount}>
          Images captured: {capturedImages.length}/3
        </p>
      </div>
    </div>
  );
};

export default CapturePage;
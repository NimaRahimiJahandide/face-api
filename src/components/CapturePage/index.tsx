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
  const consecutiveDetectionsRef = useRef<FaceDirection[]>([]);
  const isDetectionRunningRef = useRef<boolean>(false);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        
        console.log('Face-api models loaded successfully');
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading models:', err);
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
    
    // Key landmark points
    const noseTip = points[30];
    const noseBottom = points[33];
    const leftEyeOuter = points[36];
    const rightEyeOuter = points[45];
    const leftEyeInner = points[39];
    const rightEyeInner = points[42];
    const leftMouthCorner = points[48];
    const rightMouthCorner = points[54];
    const chinTip = points[8];
    
    // Calculate face measurements
    const eyeDistance = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
    const faceCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    
    // Multiple direction indicators
    const noseOffset = (noseTip.x - faceCenterX) / eyeDistance;
    const mouthCenterX = (leftMouthCorner.x + rightMouthCorner.x) / 2;
    const mouthOffset = (mouthCenterX - faceCenterX) / eyeDistance;
    
    // Eye visibility ratio (key for profile detection)
    const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
    const rightEyeWidth = Math.abs(rightEyeOuter.x - rightEyeInner.x);
    const eyeRatio = leftEyeWidth / rightEyeWidth;
    
    // Nose-chin alignment (another profile indicator)
    const noseToFaceCenter = Math.abs(noseTip.x - faceCenterX);
    const chinToFaceCenter = Math.abs(chinTip.x - faceCenterX);
    const faceSkew = (noseToFaceCenter + chinToFaceCenter) / eyeDistance;
    
    // Combined offset score
    const combinedOffset = (noseOffset + mouthOffset) / 2;
    
    // Debug logging
    console.log('Face metrics:', {
      noseOffset: noseOffset.toFixed(3),
      mouthOffset: mouthOffset.toFixed(3),
      eyeRatio: eyeRatio.toFixed(3),
      faceSkew: faceSkew.toFixed(3),
      combinedOffset: combinedOffset.toFixed(3)
    });
    
    // Improved thresholds based on multiple indicators
    const STRONG_PROFILE_THRESHOLD = 0.15;
    const MILD_PROFILE_THRESHOLD = 0.08;
    const EYE_RATIO_PROFILE_THRESHOLD = 0.7;
    const EYE_RATIO_REVERSE_THRESHOLD = 1.4;
    
    // Strong profile detection (multiple indicators agree)
    if (combinedOffset > STRONG_PROFILE_THRESHOLD || eyeRatio > EYE_RATIO_REVERSE_THRESHOLD) {
      return 'right';
    }
    
    if (combinedOffset < -STRONG_PROFILE_THRESHOLD || eyeRatio < EYE_RATIO_PROFILE_THRESHOLD) {
      return 'left';
    }
    
    // Mild profile detection (at least one strong indicator)
    if ((combinedOffset > MILD_PROFILE_THRESHOLD && eyeRatio > 1.2) || 
        (faceSkew > 0.12 && combinedOffset > 0.05)) {
      return 'right';
    }
    
    if ((combinedOffset < -MILD_PROFILE_THRESHOLD && eyeRatio < 0.8) || 
        (faceSkew > 0.12 && combinedOffset < -0.05)) {
      return 'left';
    }
    
    // Default to front if no profile indicators are strong enough
    return 'front';
  };

  const updateStabilityCount = (direction: FaceDirection) => {
    // Track last 12 detections for better stability
    consecutiveDetectionsRef.current.push(direction);
    if (consecutiveDetectionsRef.current.length > 12) {
      consecutiveDetectionsRef.current.shift();
    }
    
    // Count how many of the last detections match the current direction
    const matchingDetections = consecutiveDetectionsRef.current.filter(d => d === direction).length;
    setStabilityCount(matchingDetections);
    
    return matchingDetections;
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
    if (!videoRef.current || !overlayCanvasRef.current || isCapturing || isDetectionRunningRef.current) {
      animationFrameRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    isDetectionRunningRef.current = true;
    
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const overlayCtx = overlayCanvas.getContext('2d');

    if (!overlayCtx || video.readyState !== 4) {
      isDetectionRunningRef.current = false;
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
      // Use detectSingleFace for better performance and consistency
      const detection = await faceapi.detectSingleFace(
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

      if (detection) {
        const { x, y, width, height } = detection.detection.box;
        
        // Determine face direction
        const direction = determineFaceDirection(detection.landmarks);
        setCurrentDirection(direction);
        const stableCount = updateStabilityCount(direction);
        
        // Check if this is the direction we're looking for
        const targetDirection = currentStep === 'center' ? 'front' : 
                              currentStep === 'right' ? 'right' : 'left';
        
        const isCorrectDirection = direction === targetDirection;
        const isStable = stableCount >= 9; // 9 out of 12 detections
        
        // Auto-capture logic
        const now = Date.now();
        const timeSinceLastCapture = now - lastCaptureTimeRef.current;
        const cooldownPassed = timeSinceLastCapture > 1000; // 1 second cooldown
        
        if (isCorrectDirection && isStable && cooldownPassed && currentStep !== 'complete') {
          setTimeout(() => captureImage(direction), 100); // Small delay for stability
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
        const infoText = `${Math.round(detection.detection.score * 100)}% - ${direction}`;
        overlayCtx.strokeText(infoText, x, y - 10);
        overlayCtx.fillText(infoText, x, y - 10);
        
        // Draw key landmarks for debugging
        overlayCtx.fillStyle = '#ffff00';
        const keyPoints = [30, 33, 36, 45, 39, 42, 48, 54, 8]; // nose tip, nose bottom, eyes, mouth, chin
        keyPoints.forEach(pointIndex => {
          const point = detection.landmarks.positions[pointIndex];
          overlayCtx.fillRect(point.x - 2, point.y - 2, 4, 4);
        });
        
      } else {
        // Reset stability when no face is detected
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
      if (!detection) {
        statusText = 'No face detected';
        overlayCtx.fillStyle = '#ff0000';
      } else {
        const targetDirection = currentStep === 'center' ? 'front' : 
                              currentStep === 'right' ? 'right' : 'left';
        const isCorrect = currentDirection === targetDirection;
        const isStable = stabilityCount >= 9;
        
        if (isCorrect && isStable) {
          statusText = 'Perfect! Capturing...';
          overlayCtx.fillStyle = '#00ff00';
        } else if (isCorrect) {
          statusText = `Good! Hold steady... (${stabilityCount}/12)`;
          overlayCtx.fillStyle = '#ff9900';
        } else {
          statusText = `Turn ${targetDirection === 'front' ? 'forward' : targetDirection}`;
          overlayCtx.fillStyle = '#ff9900';
        }
      }
      
      overlayCtx.strokeText(statusText, 10, 30);
      overlayCtx.fillText(statusText, 10, 30);

    } catch (err) {
      console.error('Detection error:', err);
      overlayCtx.restore();
    }

    isDetectionRunningRef.current = false;
    
    // Continue detection loop only if not complete
    if (currentStep !== 'complete') {
      animationFrameRef.current = requestAnimationFrame(detectFaces);
    }
  };

  useEffect(() => {
    if (!isLoading && videoRef.current && currentStep !== 'complete') {
      const video = videoRef.current;
      
      const startDetection = () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        // Start detection with a small delay to ensure video is ready
        setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(detectFaces);
        }, 100);
      };

      // Start detection when video is ready
      if (video.readyState >= 2) {
        startDetection();
      } else {
        video.addEventListener('loadeddata', startDetection);
        video.addEventListener('canplay', startDetection);
      }
      
      return () => {
        video.removeEventListener('loadeddata', startDetection);
        video.removeEventListener('canplay', startDetection);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }
  }, [isLoading, currentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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
          Stability: {stabilityCount}/12
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
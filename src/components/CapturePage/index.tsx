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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const stableDirectionCountRef = useRef<number>(0);
  const lastDirectionRef = useRef<FaceDirection | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        console.log('Face-api models loaded successfully');
        setIsLoading(false);
      } catch (err) {
        console.error('Error loading models:', err);
        setError('Failed to load face detection models. Please check your internet connection.');
        setIsLoading(false);
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
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [isLoading]);

  const determineFaceDirection = (landmarks: faceapi.FaceLandmarks68): FaceDirection => {
    const points = landmarks.positions;
    
    // Key facial landmarks for direction detection
    const noseTip = points[30];        // Nose tip
    const leftEye = points[36];        // Left eye outer corner
    const rightEye = points[45];       // Right eye outer corner
    const leftMouth = points[48];      // Left mouth corner
    const rightMouth = points[54];     // Right mouth corner
    const chinCenter = points[8];      // Chin center
    
    // Calculate face center
    const faceCenter = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2
    };
    
    // Calculate nose offset from face center
    const noseOffsetX = noseTip.x - faceCenter.x;
    
    // Calculate eye distance to determine face width
    const eyeDistance = Math.abs(rightEye.x - leftEye.x);
    
    // Calculate mouth corners visibility
    const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);
    
    // Normalized nose offset (relative to eye distance)
    const normalizedNoseOffset = noseOffsetX / eyeDistance;
    
    // Calculate asymmetry in facial features
    const leftSideVisible = Math.abs(leftEye.x - leftMouth.x);
    const rightSideVisible = Math.abs(rightEye.x - rightMouth.x);
    const sideAsymmetry = (rightSideVisible - leftSideVisible) / eyeDistance;
    
    // Thresholds for direction detection
    const FRONT_THRESHOLD = 0.15;
    const PROFILE_THRESHOLD = 0.25;
    
    // Direction determination logic
    if (Math.abs(normalizedNoseOffset) < FRONT_THRESHOLD && Math.abs(sideAsymmetry) < 0.1) {
      return 'front';
    } else if (normalizedNoseOffset > PROFILE_THRESHOLD || sideAsymmetry > 0.15) {
      return 'right'; // Face turned to their right (our left)
    } else if (normalizedNoseOffset < -PROFILE_THRESHOLD || sideAsymmetry < -0.15) {
      return 'left'; // Face turned to their left (our right)
    }
    
    return 'front'; // Default to front if uncertain
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
      context.drawImage(video, 0, 0);

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

      // Reset stability counter
      stableDirectionCountRef.current = 0;
      lastCaptureTimeRef.current = Date.now();
      setError(null);
    } catch (err) {
      console.error('Error capturing image:', err);
      setError('Failed to capture image. Please try again.');
    }
    
    setIsCapturing(false);
  };

  useEffect(() => {
    const startDetection = () => {
      if (!videoRef.current || !overlayCanvasRef.current) return;

      const video = videoRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      const overlayCtx = overlayCanvas.getContext('2d');

      if (!overlayCtx) return;

      const detectFaces = async () => {
        if (video.readyState === 4 && !isCapturing) {
          const rect = video.getBoundingClientRect();
          overlayCanvas.width = video.videoWidth;
          overlayCanvas.height = video.videoHeight;
          overlayCanvas.style.width = `${rect.width}px`;
          overlayCanvas.style.height = `${rect.height}px`;

          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          try {
            const detections = await faceapi.detectAllFaces(
              video, 
              new faceapi.TinyFaceDetectorOptions({ 
                inputSize: 416, 
                scoreThreshold: 0.5 
              })
            ).withFaceLandmarks();

            overlayCtx.save();
            overlayCtx.scale(-1, 1);
            overlayCtx.translate(-overlayCanvas.width, 0);

            if (detections.length === 1) {
              const detection = detections[0];
              const { x, y, width, height } = detection.detection.box;
              
              // Determine face direction
              const direction = determineFaceDirection(detection.landmarks);
              setCurrentDirection(direction);
              
              // Check if this is the direction we're looking for
              const targetDirection = currentStep === 'center' ? 'front' : 
                                    currentStep === 'right' ? 'right' : 'left';
              
              const isCorrectDirection = direction === targetDirection;
              
              // Stability check - only capture if direction is stable
              if (direction === lastDirectionRef.current) {
                stableDirectionCountRef.current++;
              } else {
                stableDirectionCountRef.current = 0;
                lastDirectionRef.current = direction;
              }
              
              // Auto-capture logic
              const now = Date.now();
              const timeSinceLastCapture = now - lastCaptureTimeRef.current;
              const isStable = stableDirectionCountRef.current >= 10; // 10 consecutive detections
              const cooldownPassed = timeSinceLastCapture > 2000; // 2 second cooldown
              
              if (isCorrectDirection && isStable && cooldownPassed && currentStep !== 'complete') {
                captureImage(direction);
              }
              
              // Draw face box with color based on correctness
              overlayCtx.strokeStyle = isCorrectDirection && isStable ? '#00ff00' : '#ff9900';
              overlayCtx.lineWidth = 3;
              overlayCtx.strokeRect(x, y, width, height);
              
              // Draw confidence and direction
              overlayCtx.fillStyle = isCorrectDirection && isStable ? '#00ff00' : '#ff9900';
              overlayCtx.font = '16px Arial';
              overlayCtx.fillText(
                `${Math.round(detection.detection.score * 100)}% - ${direction}`,
                x,
                y - 10
              );
              
              // Draw landmarks
              overlayCtx.fillStyle = '#ffff00';
              detection.landmarks.positions.forEach((point) => {
                overlayCtx.fillRect(point.x - 1, point.y - 1, 2, 2);
              });
              
            } else {
              // Reset stability when no single face is detected
              stableDirectionCountRef.current = 0;
              lastDirectionRef.current = null;
              setCurrentDirection(null);
            }

            overlayCtx.restore();
            
            // Status text
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
              const isStable = stableDirectionCountRef.current >= 10;
              
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
              statusText = 'Multiple faces detected';
              overlayCtx.fillStyle = '#ff0000';
            }
            
            overlayCtx.strokeText(statusText, 10, 30);
            overlayCtx.fillText(statusText, 10, 30);

          } catch (err) {
            console.error('Detection error:', err);
            overlayCtx.restore();
          }
        }
      };

      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }

      detectionIntervalRef.current = setInterval(detectFaces, 100);
    };

    const video = videoRef.current;
    if (video && !isLoading) {
      video.addEventListener('loadedmetadata', startDetection);
      video.addEventListener('play', startDetection);
      
      return () => {
        video.removeEventListener('loadedmetadata', startDetection);
        video.removeEventListener('play', startDetection);
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
        }
      };
    }
  }, [isLoading, currentStep, capturedImages, isCapturing, currentDirection]);

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
          Stability: {stableDirectionCountRef.current}/10
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
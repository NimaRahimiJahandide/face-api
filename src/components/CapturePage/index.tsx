import styles from './styles.module.scss';
import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import type { CapturedImage } from '@/types';

interface Props {
  onComplete: (images: CapturedImage[]) => void;
}

const CapturePage: React.FC<Props> = ({ onComplete }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'center' | 'right' | 'left' | 'complete'>('center');
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const startDetection = () => {
      if (!videoRef.current || !overlayCanvasRef.current) return;

      const video = videoRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      const overlayCtx = overlayCanvas.getContext('2d');

      if (!overlayCtx) return;

      const detectFaces = async () => {
        if (video.readyState === 4) {
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

            detections.forEach((detection) => {
              const { x, y, width, height } = detection.detection.box;
              
              overlayCtx.strokeStyle = detections.length === 1 ? '#00ff00' : '#ff0000';
              overlayCtx.lineWidth = 3;
              overlayCtx.strokeRect(x, y, width, height);
              
              overlayCtx.fillStyle = detections.length === 1 ? '#00ff00' : '#ff0000';
              overlayCtx.font = '16px Arial';
              overlayCtx.fillText(
                `${Math.round(detection.detection.score * 100)}%`,
                x,
                y - 10
              );

              if (detection.landmarks) {
                overlayCtx.fillStyle = '#ffff00';
                detection.landmarks.positions.forEach((point) => {
                  overlayCtx.fillRect(point.x - 1, point.y - 1, 2, 2);
                });
              }
            });

            overlayCtx.restore();
            
            overlayCtx.fillStyle = '#ffffff';
            overlayCtx.font = 'bold 18px Arial';
            overlayCtx.strokeStyle = '#000000';
            overlayCtx.lineWidth = 2;
            
            let statusText = '';
            if (detections.length === 0) {
              statusText = 'No face detected';
              overlayCtx.fillStyle = '#ff0000';
            } else if (detections.length === 1) {
              statusText = 'Face detected - Ready to capture';
              overlayCtx.fillStyle = '#00ff00';
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
  }, [isLoading]);

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);
    
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

      const detections = await faceapi.detectAllFaces(
        video, 
        new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 416, 
          scoreThreshold: 0.5 
        })
      )
      .withFaceLandmarks()
      .withFaceDescriptors();

      if (detections.length === 0) {
        setError('No face detected. Please position your face clearly in front of the camera.');
        setIsProcessing(false);
        return;
      }

      if (detections.length > 1) {
        setError('Multiple faces detected. Please ensure only one face is visible.');
        setIsProcessing(false);
        return;
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      const newImage: CapturedImage = {
        dataUrl,
        position: currentStep as 'center' | 'right' | 'left'
      };

      const updatedImages = [...capturedImages, newImage];
      setCapturedImages(updatedImages);

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

      setError(null);
    } catch (err) {
      console.error('Error capturing image:', err);
      setError('Failed to capture image. Please try again.');
    }
    
    setIsProcessing(false);
  };

  const getInstructionText = () => {
    switch (currentStep) {
      case 'center':
        return 'Look straight at the camera and click capture';
      case 'right':
        return 'Turn your head slightly to the right and click capture';
      case 'left':
        return 'Turn your head slightly to the left and click capture';
      case 'complete':
        return 'Capture complete!';
      default:
        return '';
    }
  };

  const getProgressText = () => {
    switch (currentStep) {
      case 'center':
        return 'Step 1 of 3: Center Position';
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
        <p className={styles.CompleteText}>Processing your images...</p>
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

      <div className={styles.ButtonContainer}>
        <button
          onClick={captureImage}
          disabled={isProcessing}
          className={`${styles.CaptureButton} ${isProcessing ? styles.Processing : ''}`}
          type="button"
        >
          {isProcessing ? 'Processing...' : 'Capture'}
        </button>
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
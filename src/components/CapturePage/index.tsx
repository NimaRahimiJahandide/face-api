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

  // Load face-api models from CDN
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

  // Initialize camera
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

  // Cleanup on unmount
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

  // Start real-time face detection when video starts playing
  useEffect(() => {
    const startDetection = () => {
      if (!videoRef.current || !overlayCanvasRef.current) return;

      const video = videoRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      const overlayCtx = overlayCanvas.getContext('2d');

      if (!overlayCtx) return;

      const detectFaces = async () => {
        if (video.readyState === 4) {
          // Set overlay canvas size to match video display size
          const rect = video.getBoundingClientRect();
          overlayCanvas.width = video.videoWidth;
          overlayCanvas.height = video.videoHeight;
          overlayCanvas.style.width = `${rect.width}px`;
          overlayCanvas.style.height = `${rect.height}px`;

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

            // Save context state
            overlayCtx.save();
            
            // Apply horizontal flip for mirrored display of detection elements
            overlayCtx.scale(-1, 1);
            overlayCtx.translate(-overlayCanvas.width, 0);

            // Draw bounding boxes and landmarks
            detections.forEach((detection) => {
              const { x, y, width, height } = detection.detection.box;
              
              // Draw bounding box
              overlayCtx.strokeStyle = detections.length === 1 ? '#00ff00' : '#ff0000';
              overlayCtx.lineWidth = 3;
              overlayCtx.strokeRect(x, y, width, height);
              
              // Draw confidence score
              overlayCtx.fillStyle = detections.length === 1 ? '#00ff00' : '#ff0000';
              overlayCtx.font = '16px Arial';
              overlayCtx.fillText(
                `${Math.round(detection.detection.score * 100)}%`,
                x,
                y - 10
              );

              // Draw face landmarks (optional)
              if (detection.landmarks) {
                overlayCtx.fillStyle = '#ffff00';
                detection.landmarks.positions.forEach((point) => {
                  overlayCtx.fillRect(point.x - 1, point.y - 1, 2, 2);
                });
              }
            });

            // Restore context state for text
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
            // Restore context state in case of error
            overlayCtx.restore();
          }
        }
      };

      // Clear any existing interval
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }

      // Start detection interval
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

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas WITHOUT mirror effect for saving
      context.drawImage(video, 0, 0);

      // Detect face with better options
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

      // Get image data URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      // Add captured image
      const newImage: CapturedImage = {
        dataUrl,
        position: currentStep as 'center' | 'right' | 'left'
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
        // Stop camera
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        // Call onComplete with all images
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
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <h2>Loading Face Detection...</h2>
        <p>Please wait while we load the face detection models...</p>
        <div style={{ 
          width: '50px', 
          height: '50px', 
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 2s linear infinite',
          margin: '20px auto'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <h2>Capture Complete!</h2>
        <p>Processing your images...</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <h2>Face Capture</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{getProgressText()}</p>
        <p style={{ fontSize: '16px', color: '#666' }}>{getInstructionText()}</p>
      </div>

      <div style={{ marginBottom: '20px', position: 'relative', display: 'inline-block' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            maxWidth: '400px',
            border: '2px solid #ddd',
            borderRadius: '8px',
            transform: 'scaleX(-1)', // Mirror effect only for display
            display: 'block'
          }}
        />
        
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            borderRadius: '8px'
          }}
        />
        
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <div style={{ 
          color: 'red', 
          marginBottom: '20px',
          padding: '10px',
          backgroundColor: '#ffebee',
          borderRadius: '4px',
          border: '1px solid #ffcdd2'
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={captureImage}
          disabled={isProcessing}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: isProcessing ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.3s',
          }}
        >
          {isProcessing ? 'Processing...' : 'Capture'}
        </button>
      </div>

      <div style={{ marginTop: '20px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '10px',
          marginBottom: '10px'
        }}>
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: step <= capturedImages.length ? '#007bff' : '#ddd',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              {step}
            </div>
          ))}
        </div>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Images captured: {capturedImages.length}/3
        </p>
      </div>
    </div>
  );
};

export default CapturePage;
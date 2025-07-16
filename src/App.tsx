import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';

// Types
interface CapturedImage {
  dataUrl: string;
  position: 'center' | 'right' | 'left';
}

// Main App Component
const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'instructions' | 'capture' | 'preview'>('instructions');
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);

  // Initialize Telegram WebApp if available
  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  }, []);

  const handleStartCapture = () => {
    setCurrentPage('capture');
  };

  const handleCaptureComplete = (images: CapturedImage[]) => {
    setCapturedImages(images);
    setCurrentPage('preview');
  };

  const handleNext = () => {
    // In a real app, this would navigate to the next step
    console.log('Next button clicked');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      {currentPage === 'instructions' && (
        <InstructionsPage onStart={handleStartCapture} />
      )}
      {currentPage === 'capture' && (
        <CapturePage onComplete={handleCaptureComplete} />
      )}
      {currentPage === 'preview' && (
        <PreviewPage images={capturedImages} onNext={handleNext} />
      )}
    </div>
  );
};

// Instructions Page Component
const InstructionsPage: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  return (
    <div>
      <h1>Face Capture Instructions</h1>
      <div style={{ marginBottom: '20px' }}>
        <p>Please prepare for face capture:</p>
        <ul>
          <li>Make sure you're in a well-lit area</li>
          <li>Position your face clearly in front of the camera</li>
          <li>We'll take 3 photos: center, right, and left positions</li>
          <li>Follow the on-screen instructions during capture</li>
        </ul>
      </div>
      <button 
        onClick={onStart}
        style={{ 
          padding: '10px 20px', 
          fontSize: '16px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Start Face Capture
      </button>
    </div>
  );
};

// Capture Page Component
const CapturePage: React.FC<{ onComplete: (images: CapturedImage[]) => void }> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'center' | 'right' | 'left'>('center');
  const [faceDetected, setFaceDetected] = useState(false);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [instruction, setInstruction] = useState('Loading face detection...');
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stepInstructions = {
    center: 'Look straight at the camera',
    right: 'Turn your head to the right',
    left: 'Turn your head to the left'
  };

  // Initialize face-api.js and webcam
  useEffect(() => {
    const initializeFaceAPI = async () => {
      try {
        // Load face-api.js models from CDN
        await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model');
        await faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@latest/model');
        
        // Start webcam
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setIsLoading(false);
            setInstruction(stepInstructions[currentStep]);
            startFaceDetection();
          };
        }
      } catch (error) {
        console.error('Error initializing face detection:', error);
        setInstruction('Error: Could not access camera or load face detection');
      }
    };

    initializeFaceAPI();

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      // Stop webcam
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Start face detection
  const startFaceDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    detectionIntervalRef.current = setInterval(async () => {
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        try {
          const detections = await faceapi.detectAllFaces(
            videoRef.current, 
            new faceapi.TinyFaceDetectorOptions()
          ).withFaceLandmarks();

          setFaceDetected(detections.length > 0);
        } catch (error) {
          console.error('Face detection error:', error);
        }
      }
    }, 100);
  };

  // Capture photo
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current && faceDetected) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        
        const newImage: CapturedImage = {
          dataUrl,
          position: currentStep
        };
        
        const updatedImages = [...capturedImages, newImage];
        setCapturedImages(updatedImages);
        
        // Move to next step
        if (currentStep === 'center') {
          setCurrentStep('right');
          setInstruction(stepInstructions.right);
          setFaceDetected(false);
        } else if (currentStep === 'right') {
          setCurrentStep('left');
          setInstruction(stepInstructions.left);
          setFaceDetected(false);
        } else {
          // All photos captured
          if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
          }
          onComplete(updatedImages);
        }
      }
    }
  };

  if (isLoading) {
    return (
      <div>
        <h2>Initializing Camera...</h2>
        <p>Please allow camera access when prompted.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Face Capture</h2>
      <div style={{ marginBottom: '20px' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          style={{ 
            width: '100%', 
            maxWidth: '400px', 
            border: '2px solid #ddd',
            borderRadius: '8px'
          }}
        />
        <canvas 
          ref={canvasRef} 
          style={{ display: 'none' }} 
        />
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Step {currentStep === 'center' ? '1' : currentStep === 'right' ? '2' : '3'} of 3</h3>
        <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{instruction}</p>
        <p style={{ color: faceDetected ? 'green' : 'red' }}>
          {faceDetected ? '✓ Face detected' : '✗ No face detected'}
        </p>
      </div>
      
      <button
        onClick={capturePhoto}
        disabled={!faceDetected}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: faceDetected ? '#28a745' : '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: faceDetected ? 'pointer' : 'not-allowed'
        }}
      >
        Capture Photo
      </button>
      
      <div style={{ marginTop: '20px' }}>
        <p>Captured: {capturedImages.length} of 3 photos</p>
      </div>
    </div>
  );
};

// Preview Page Component
const PreviewPage: React.FC<{ images: CapturedImage[]; onNext: () => void }> = ({ images, onNext }) => {
  return (
    <div>
      <h2>Captured Images</h2>
      <div style={{ marginBottom: '20px' }}>
        {images.map((image, index) => (
          <div key={index} style={{ marginBottom: '20px' }}>
            <h3>Position: {image.position}</h3>
            <img 
              src={image.dataUrl} 
              alt={`Face ${image.position}`}
              style={{ 
                width: '100%', 
                maxWidth: '300px',
                border: '2px solid #ddd',
                borderRadius: '8px'
              }}
            />
          </div>
        ))}
      </div>
      
      <button
        onClick={onNext}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Next
      </button>
    </div>
  );
};

// Add Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
        };
      };
    };
  }
}

export default App;
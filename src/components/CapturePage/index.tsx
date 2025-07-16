
import styles from "./styles.module.scss";
import React, { useState, useEffect, useRef } from "react";
import * as faceapi from "face-api.js";

interface CapturePageProps {
  onComplete: CaptureCompleteHandler;
}

const CapturePage: React.FC<CapturePageProps> = ({ onComplete }) => {
  // State management with precise typing
  const [isLoading, setIsLoading]: [boolean, SetBoolean] = useState<boolean>(true);
  const [currentStep, setCurrentStep]: [CaptureStep, SetCaptureStep] = useState<CaptureStep>("center");
  const [capturedImages, setCapturedImages]: [CapturedImage[], SetCapturedImages] = useState<CapturedImage[]>([]);
  const [error, setError]: [string | null, SetStringOrNull] = useState<string | null>(null);
  const [currentDirection, setCurrentDirection]: [FaceDirection | null, SetFaceDirection] = useState<FaceDirection | null>(null);
  const [isCapturing, setIsCapturing]: [boolean, SetBoolean] = useState<boolean>(false);
  const [stabilityCount, setStabilityCount]: [number, SetNumber] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage]: [string, SetString] = useState<string>("");
  const [feedbackType, setFeedbackType]: [FeedbackType, SetFeedbackType] = useState<FeedbackType>("instruction");

  // Refs with precise typing
  const videoRef: VideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef: CanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef: CanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef: MediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef: AnimationFrameRef = useRef<number | null>(null);
  const lastCaptureTimeRef: React.RefObject<number> = useRef<number>(0);
  const consecutiveDetectionsRef: React.RefObject<FaceDirection[]> = useRef<FaceDirection[]>([]);
  const isDetectionRunningRef: React.RefObject<boolean> = useRef<boolean>(false);

  // Face detection configuration
  const detectionConfig: FaceDetectionConfig = {
    inputSize: 416,
    scoreThreshold: 0.5,
    stabilityThreshold: 9,
    cooldownDuration: 1000,
    maxDetections: 12,
  };

  useEffect(() => {
    const loadModels = async (): Promise<void> => {
      try {
        const MODEL_URL: string = "/models";

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);

        console.log("Face-api models loaded successfully");
        setIsLoading(false);
      } catch (err: unknown) {
        console.error("Error loading models:", err);
        try {
          const CDN_URL: string = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model";
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
          ]);
          console.log("Face-api models loaded from CDN");
          setIsLoading(false);
        } catch (cdnErr: unknown) {
          console.error("Error loading models from CDN:", cdnErr);
          setError("Failed to load face detection models. Please refresh the page.");
          setIsLoading(false);
        }
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    const initCamera = async (): Promise<void> => {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
        };

        const stream: MediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (err: unknown) {
        console.error("Error accessing camera:", err);
        setError("Failed to access camera. Please allow camera permissions.");
      }
    };

    if (!isLoading) {
      initCamera();
    }

    return (): void => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        streamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isLoading]);

  const determineFaceDirection = (landmarks: FaceApiLandmarks): DirectionDeterminationResult => {
    const points: FaceApiPoint[] = landmarks.positions;

    // Key landmark points with precise indexing
    const noseTip: FaceApiPoint = points[30];
    const noseBottom: FaceApiPoint = points[33];
    const leftEyeOuter: FaceApiPoint = points[36];
    const rightEyeOuter: FaceApiPoint = points[45];
    const leftEyeInner: FaceApiPoint = points[39];
    const rightEyeInner: FaceApiPoint = points[42];
    const leftMouthCorner: FaceApiPoint = points[48];
    const rightMouthCorner: FaceApiPoint = points[54];
    const chinTip: FaceApiPoint = points[8];

    // Calculate face measurements
    const eyeDistance: number = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
    const faceCenterX: number = (leftEyeOuter.x + rightEyeOuter.x) / 2;

    // Multiple direction indicators
    const noseOffset: number = (noseTip.x - faceCenterX) / eyeDistance;
    const mouthCenterX: number = (leftMouthCorner.x + rightMouthCorner.x) / 2;
    const mouthOffset: number = (mouthCenterX - faceCenterX) / eyeDistance;

    // Eye visibility ratio (key for profile detection)
    const leftEyeWidth: number = Math.abs(leftEyeOuter.x - leftEyeInner.x);
    const rightEyeWidth: number = Math.abs(rightEyeOuter.x - rightEyeInner.x);
    const eyeRatio: number = leftEyeWidth / rightEyeWidth;

    // Nose-chin alignment (another profile indicator)
    const noseToFaceCenter: number = Math.abs(noseTip.x - faceCenterX);
    const chinToFaceCenter: number = Math.abs(chinTip.x - faceCenterX);
    const faceSkew: number = (noseToFaceCenter + chinToFaceCenter) / eyeDistance;

    // Combined offset score
    const combinedOffset: number = (noseOffset + mouthOffset) / 2;

    // Improved thresholds based on multiple indicators
    const STRONG_PROFILE_THRESHOLD: number = 0.15;
    const MILD_PROFILE_THRESHOLD: number = 0.08;
    const EYE_RATIO_PROFILE_THRESHOLD: number = 0.7;
    const EYE_RATIO_REVERSE_THRESHOLD: number = 1.4;

    let direction: FaceDirection = "front";
    let confidence: number = 0;

    // REVERSED LOGIC: Since video is mirrored, we need to flip the left/right detection
    if (combinedOffset > STRONG_PROFILE_THRESHOLD || eyeRatio > EYE_RATIO_REVERSE_THRESHOLD) {
      direction = "left";
      confidence = Math.max(combinedOffset / STRONG_PROFILE_THRESHOLD, eyeRatio / EYE_RATIO_REVERSE_THRESHOLD);
    } else if (combinedOffset < -STRONG_PROFILE_THRESHOLD || eyeRatio < EYE_RATIO_PROFILE_THRESHOLD) {
      direction = "right";
      confidence = Math.max(Math.abs(combinedOffset) / STRONG_PROFILE_THRESHOLD, (1 - eyeRatio) / (1 - EYE_RATIO_PROFILE_THRESHOLD));
    } else if ((combinedOffset > MILD_PROFILE_THRESHOLD && eyeRatio > 1.2) || (faceSkew > 0.12 && combinedOffset > 0.05)) {
      direction = "left";
      confidence = Math.min(combinedOffset / MILD_PROFILE_THRESHOLD, eyeRatio / 1.2);
    } else if ((combinedOffset < -MILD_PROFILE_THRESHOLD && eyeRatio < 0.8) || (faceSkew > 0.12 && combinedOffset < -0.05)) {
      direction = "right";
      confidence = Math.min(Math.abs(combinedOffset) / MILD_PROFILE_THRESHOLD, (1 - eyeRatio) / (1 - 0.8));
    } else {
      direction = "front";
      confidence = 1 - Math.abs(combinedOffset) / MILD_PROFILE_THRESHOLD;
    }

    return {
      direction,
      confidence: Math.max(0, Math.min(1, confidence)),
      metrics: {
        noseOffset,
        mouthOffset,
        eyeRatio,
        faceSkew,
        combinedOffset,
      },
    };
  };

  const updateStabilityCount = (direction: FaceDirection): number => {
    // Track last detections for better stability
    if (consecutiveDetectionsRef.current) {
      consecutiveDetectionsRef.current.push(direction);
      if (consecutiveDetectionsRef.current.length > detectionConfig.maxDetections) {
        consecutiveDetectionsRef.current.shift();
      }

      // Count how many of the last detections match the current direction
      const matchingDetections: number = consecutiveDetectionsRef.current.filter(
        (d: FaceDirection) => d === direction
      ).length;
      setStabilityCount(matchingDetections);

      return matchingDetections;
    }
    return 0;
  };

  const captureImage = async (direction: FaceDirection): Promise<void> => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;

    setIsCapturing(true);
    setFeedbackMessage("Capturing image...");
    setFeedbackType("success");

    try {
      const video: VideoElement = videoRef.current;
      const canvas: CanvasElement = canvasRef.current;
      const context: CanvasContext2D = canvas.getContext("2d");

      if (!context || !video) {
        throw new Error("Could not get canvas context or video element");
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the mirrored video frame
      context.save();
      context.scale(-1, 1);
      context.translate(-canvas.width, 0);
      context.drawImage(video, 0, 0);
      context.restore();

      const dataUrl: string = canvas.toDataURL("image/jpeg", 0.8);

      const positionMap: DirectionMapping = {
        front: "center",
        right: "right",
        left: "left",
      };

      const newImage: CapturedImage = {
        dataUrl,
        position: positionMap[direction],
      };

      const updatedImages: CapturedImage[] = [...capturedImages, newImage];
      setCapturedImages(updatedImages);

      // Move to next step
      if (currentStep === "center") {
        setCurrentStep("right");
        setFeedbackMessage("Great! Now turn your head to the right");
        setFeedbackType("instruction");
      } else if (currentStep === "right") {
        setCurrentStep("left");
        setFeedbackMessage("Perfect! Now turn your head to the left");
        setFeedbackType("instruction");
      } else if (currentStep === "left") {
        setCurrentStep("complete");
        setFeedbackMessage("All done! Processing...");
        setFeedbackType("success");
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        }
        onComplete(updatedImages);
      }

      // Reset counters
      if (consecutiveDetectionsRef.current) {
        consecutiveDetectionsRef.current = [];
      }
      if (lastCaptureTimeRef.current !== undefined) {
        lastCaptureTimeRef.current = Date.now();
      }
      setError(null);
      setStabilityCount(0);
    } catch (err: unknown) {
      console.error("Error capturing image:", err);
      setError("Failed to capture image. Please try again.");
      setFeedbackMessage("Error capturing image. Please try again.");
      setFeedbackType("error");
    }

    setIsCapturing(false);
  };

  const detectFaces = async (): Promise<void> => {
    if (
      !videoRef.current ||
      !overlayCanvasRef.current ||
      isCapturing ||
      (isDetectionRunningRef.current && isDetectionRunningRef.current)
    ) {
      animationFrameRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    if (isDetectionRunningRef.current !== undefined) {
      isDetectionRunningRef.current = true;
    }

    const video: VideoElement = videoRef.current;
    const overlayCanvas: CanvasElement = overlayCanvasRef.current;
    const overlayCtx: CanvasContext2D = overlayCanvas.getContext("2d");

    if (!overlayCtx || !video || video.readyState !== 4) {
      if (isDetectionRunningRef.current !== undefined) {
        isDetectionRunningRef.current = false;
      }
      animationFrameRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    // Update canvas size to match video
    const videoRect: DOMRect = video.getBoundingClientRect();
    overlayCanvas.width = video.videoWidth;
    overlayCanvas.height = video.videoHeight;
    overlayCanvas.style.width = `${videoRect.width}px`;
    overlayCanvas.style.height = `${videoRect.height}px`;

    // Clear previous drawings
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    try {
      // Use detectSingleFace for better performance and consistency
      const detection: FaceApiDetectionResult | undefined = await faceapi
        .detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: detectionConfig.inputSize,
            scoreThreshold: detectionConfig.scoreThreshold,
          })
        )
        .withFaceLandmarks();

      // Apply mirroring to match video display
      overlayCtx.save();
      overlayCtx.scale(-1, 1);
      overlayCtx.translate(-overlayCanvas.width, 0);

      // Determine what direction we're expecting
      const targetDirection: FaceDirection =
        currentStep === "center" ? "front" : currentStep === "right" ? "right" : "left";

      if (detection) {
        const { x, y, width, height }: FaceApiBox = detection.detection.box;

        // Determine face direction
        const directionResult: DirectionDeterminationResult = determineFaceDirection(detection.landmarks);
        const direction: FaceDirection = directionResult.direction;
        setCurrentDirection(direction);
        const stableCount: number = updateStabilityCount(direction);

        // Check if this is the direction we're looking for
        const isCorrectDirection: boolean = direction === targetDirection;
        const isStable: boolean = stableCount >= detectionConfig.stabilityThreshold;

        // Auto-capture logic
        const now: number = Date.now();
        const timeSinceLastCapture: number = now - (lastCaptureTimeRef.current || 0);
        const cooldownPassed: boolean = timeSinceLastCapture > detectionConfig.cooldownDuration;

        if (isCorrectDirection && isStable && cooldownPassed && currentStep !== "complete") {
          setTimeout(() => captureImage(direction), 100); // Small delay for stability
        }

        // Draw face bounding box
        overlayCtx.strokeStyle = isCorrectDirection && isStable ? "#00ff00" : "#ff9900";
        overlayCtx.lineWidth = 3;
        overlayCtx.strokeRect(x, y, width, height);

        // Draw confidence and direction info
        overlayCtx.fillStyle = isCorrectDirection && isStable ? "#00ff00" : "#ff9900";
        overlayCtx.font = "bold 16px Arial";
        overlayCtx.strokeStyle = "#000000";
        overlayCtx.lineWidth = 3;
        const infoText: string = `${Math.round(detection.detection.score * 100)}% - ${direction}`;
        overlayCtx.strokeText(infoText, x, y - 10);
        overlayCtx.fillText(infoText, x, y - 10);

        // Draw key landmarks for debugging
        overlayCtx.fillStyle = "#ffff00";
        const keyPoints: number[] = [30, 33, 36, 45, 39, 42, 48, 54, 8]; // nose tip, nose bottom, eyes, mouth, chin
        keyPoints.forEach((pointIndex: number) => {
          const point: FaceApiPoint = detection.landmarks.positions[pointIndex];
          overlayCtx.fillRect(point.x - 2, point.y - 2, 4, 4);
        });
      } else {
        // Reset stability when no face is detected
        if (consecutiveDetectionsRef.current) {
          consecutiveDetectionsRef.current = [];
        }
        setCurrentDirection(null);
        setStabilityCount(0);
      }

      overlayCtx.restore();
    } catch (err: unknown) {
      console.error("Detection error:", err);
      overlayCtx.restore();
      setFeedbackMessage("Detection error. Please try again.");
      setFeedbackType("error");
    }

    if (isDetectionRunningRef.current !== undefined) {
      isDetectionRunningRef.current = false;
    }

    // Continue detection loop only if not complete
    if (currentStep !== "complete") {
      animationFrameRef.current = requestAnimationFrame(detectFaces);
    }
  };

  useEffect(() => {
    if (!isLoading && videoRef.current && currentStep !== "complete") {
      const video: VideoElement = videoRef.current;

      const startDetection = (): void => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        // Start detection with a small delay to ensure video is ready
        setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(detectFaces);
        }, 100);
      };

      // Start detection when video is ready
      if (video && video.readyState >= 2) {
        startDetection();
      } else if (video) {
        video.addEventListener("loadeddata", startDetection);
        video.addEventListener("canplay", startDetection);
      }

      return (): void => {
        if (video) {
          video.removeEventListener("loadeddata", startDetection);
          video.removeEventListener("canplay", startDetection);
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }
  }, [isLoading, currentStep]);

  // Initialize feedback message based on current step
  useEffect(() => {
    if (currentStep === "center") {
      setFeedbackMessage("Look straight at the camera");
      setFeedbackType("instruction");
    } else if (currentStep === "right") {
      setFeedbackMessage("Turn your head to the right");
      setFeedbackType("instruction");
    } else if (currentStep === "left") {
      setFeedbackMessage("Turn your head to the left");
      setFeedbackType("instruction");
    }
  }, [currentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const getInstructionText = (): string => {
    switch (currentStep) {
      case "center":
        return "Look straight at the camera and hold steady";
      case "right":
        return "Turn your head to the right and hold steady";
      case "left":
        return "Turn your head to the left and hold steady";
      case "complete":
        return "Capture complete!";
      default:
        return "";
    }
  };

  const getProgressText = (): string => {
    switch (currentStep) {
      case "center":
        return "Step 1 of 3: Front Position";
      case "right":
        return "Step 2 of 3: Right Position";
      case "left":
        return "Step 3 of 3: Left Position";
      case "complete":
        return "Complete!";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <div className={styles.LoadingContainer}>
        <h2 className={styles.LoadingTitle}>Loading Face Detection...</h2>
        <p className={styles.LoadingText}>
          Please wait while we load the face detection models...
        </p>
        <div className={styles.LoadingSpinner}></div>
      </div>
    );
  }

  if (currentStep === "complete") {
    return (
      <div className={styles.CompleteContainer}>
        <h2 className={styles.CompleteTitle}>Capture Complete!</h2>
        <p className={styles.CompleteText}>
          All 3 images captured successfully!
        </p>
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

      {/* Main Feedback Message */}
      <div className={`${styles.FeedbackContainer} ${styles[feedbackType]}`}>
        <p className={styles.FeedbackMessage}>{feedbackMessage}</p>
      </div>

      <div className={styles.VideoContainer}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={styles.Video}
        />

        <canvas ref={overlayCanvasRef} className={styles.OverlayCanvas} />

        <canvas ref={canvasRef} className={styles.HiddenCanvas} />
      </div>

      {error && <div className={styles.ErrorContainer}>{error}</div>}

      <div className={styles.ProgressIndicator}>
        <div className={styles.StepIndicators}>
          {[1, 2, 3].map((step) => (
            <div
              key={step}
              className={`${styles.StepCircle} ${
                step <= capturedImages.length ? styles.Completed : ""
              }`}
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

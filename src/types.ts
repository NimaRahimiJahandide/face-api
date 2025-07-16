import { Infer, object, string, number, boolean, union, literal, array, nullable, optional } from 'superstruct';

// Existing type with validation
export const CapturedImage = object({
  dataUrl: string(),
  position: union([literal('center'), literal('right'), literal('left')]),
});

// Face detection related types
export const FaceDirection = union([
  literal('front'),
  literal('right'),
  literal('left')
]);

// Face-api.js specific types
export const FaceApiPoint = object({
  x: number(),
  y: number(),
});

export const FaceApiBox = object({
  x: number(),
  y: number(),
  width: number(),
  height: number(),
});

export const FaceApiDetection = object({
  box: FaceApiBox,
  score: number(),
});

export const FaceApiLandmarks = object({
  positions: array(FaceApiPoint),
});

export const FaceApiDetectionResult = object({
  detection: FaceApiDetection,
  landmarks: FaceApiLandmarks,
});

export const CaptureStep = union([
  literal('center'),
  literal('right'),
  literal('left'),
  literal('complete')
]);

export const FeedbackType = union([
  literal('instruction'),
  literal('success'),
  literal('error')
]);

export const PageState = union([
  literal('instructions'),
  literal('capture'),
  literal('preview')
]);

// Component Props Types
export const CapturePageProps = object({
  onComplete: optional(object({})), // Will be refined as function type in global declarations
});

export const InstructionsPageProps = object({
  onStart: optional(object({})), // Will be refined as function type in global declarations
});

export const PreviewPageProps = object({
  images: array(CapturedImage),
  onNext: optional(object({})), // Will be refined as function type in global declarations
});

// Camera constraints
export const CameraConstraints = object({
  video: object({
    width: object({
      ideal: number(),
    }),
    height: object({
      ideal: number(),
    }),
    facingMode: literal('user'),
  }),
});

// Face detection options
export const FaceDetectionOptions = object({
  inputSize: number(),
  scoreThreshold: number(),
});

// Error state
export const ErrorState = object({
  message: string(),
  type: union([literal('camera'), literal('detection'), literal('model')]),
});

// Canvas 2D context state
export const CanvasRenderingContext2DState = object({
  fillStyle: string(),
  strokeStyle: string(),
  lineWidth: number(),
  font: string(),
});

// Video element ready state
export const VideoReadyState = union([
  literal(0), // HAVE_NOTHING
  literal(1), // HAVE_METADATA
  literal(2), // HAVE_CURRENT_DATA
  literal(3), // HAVE_FUTURE_DATA
  literal(4), // HAVE_ENOUGH_DATA
]);

// Media stream constraints
export const MediaStreamConstraints = object({
  video: union([
    boolean(),
    object({
      width: optional(object({
        ideal: number(),
      })),
      height: optional(object({
        ideal: number(),
      })),
      facingMode: optional(string()),
    }),
  ]),
  audio: optional(boolean()),
});

// Browser APIs
export const MediaDevicesApi = object({
  getUserMedia: optional(object({})), // Function type
});

export const NavigatorApi = object({
  mediaDevices: optional(MediaDevicesApi),
});

// Face detection configuration
export const FaceDetectionConfig = object({
  inputSize: number(),
  scoreThreshold: number(),
  stabilityThreshold: number(),
  cooldownDuration: number(),
  maxDetections: number(),
});

// Direction mapping
export const DirectionMapping = object({
  front: literal('center'),
  right: literal('right'),
  left: literal('left'),
});

// Stability tracking
export const StabilityTracker = object({
  detections: array(FaceDirection),
  maxLength: number(),
});

// Timing information
export const TimingInfo = object({
  lastCapture: number(),
  cooldownDuration: number(),
});

// Global type declarations
declare global {
  type CapturedImage = Infer<typeof CapturedImage>;
  type FaceDirection = Infer<typeof FaceDirection>;
  type FaceApiPoint = Infer<typeof FaceApiPoint>;
  type FaceApiBox = Infer<typeof FaceApiBox>;
  type FaceApiDetection = Infer<typeof FaceApiDetection>;
  type FaceApiLandmarks = Infer<typeof FaceApiLandmarks>;
  type FaceApiDetectionResult = Infer<typeof FaceApiDetectionResult>;
  type CaptureStep = Infer<typeof CaptureStep>;
  type FeedbackType = Infer<typeof FeedbackType>;
  type PageState = Infer<typeof PageState>;
  type CameraConstraints = Infer<typeof CameraConstraints>;
  type FaceDetectionOptions = Infer<typeof FaceDetectionOptions>;
  type ErrorState = Infer<typeof ErrorState>;
  type CanvasRenderingContext2DState = Infer<typeof CanvasRenderingContext2DState>;
  type VideoReadyState = Infer<typeof VideoReadyState>;
  type MediaStreamConstraints = Infer<typeof MediaStreamConstraints>;
  type MediaDevicesApi = Infer<typeof MediaDevicesApi>;
  type NavigatorApi = Infer<typeof NavigatorApi>;
  type FaceDetectionConfig = Infer<typeof FaceDetectionConfig>;
  type DirectionMapping = Infer<typeof DirectionMapping>;
  type StabilityTracker = Infer<typeof StabilityTracker>;
  type TimingInfo = Infer<typeof TimingInfo>;
  
  // Function types that can't be easily validated with superstruct
  type CaptureCompleteHandler = (images: CapturedImage[]) => void;
  type StartCaptureHandler = () => void;
  type NextHandler = () => void;
  type VoidHandler = () => void;
  
  // React-specific types
  type VideoRef = React.RefObject<HTMLVideoElement>;
  type CanvasRef = React.RefObject<HTMLCanvasElement>;
  type MediaStreamRef = React.RefObject<MediaStream | null>;
  type AnimationFrameRef = React.RefObject<number | null>;
  
  // State setters with precise types
  type SetBoolean = React.Dispatch<React.SetStateAction<boolean>>;
  type SetString = React.Dispatch<React.SetStateAction<string>>;
  type SetStringOrNull = React.Dispatch<React.SetStateAction<string | null>>;
  type SetNumber = React.Dispatch<React.SetStateAction<number>>;
  type SetCaptureStep = React.Dispatch<React.SetStateAction<CaptureStep>>;
  type SetFeedbackType = React.Dispatch<React.SetStateAction<FeedbackType>>;
  type SetFaceDirection = React.Dispatch<React.SetStateAction<FaceDirection | null>>;
  type SetCapturedImages = React.Dispatch<React.SetStateAction<CapturedImage[]>>;
  type SetPageState = React.Dispatch<React.SetStateAction<PageState>>;
  
  // Canvas context types
  type CanvasContext2D = CanvasRenderingContext2D | null;
  type CanvasElement = HTMLCanvasElement | null;
  type VideoElement = HTMLVideoElement | null;
  
  // Face-api.js specific method types
  type FaceApiDetector = {
    detectSingleFace: (
      input: HTMLVideoElement,
      options: FaceDetectionOptions
    ) => Promise<FaceApiDetectionResult | undefined>;
    withFaceLandmarks: () => Promise<FaceApiDetectionResult | undefined>;
  };
  
  // Direction determination result
  type DirectionDeterminationResult = {
    direction: FaceDirection;
    confidence: number;
    metrics: {
      noseOffset: number;
      mouthOffset: number;
      eyeRatio: number;
      faceSkew: number;
      combinedOffset: number;
    };
  };
  
  // Capture process state
  type CaptureProcessState = {
    isCapturing: boolean;
    stabilityCount: number;
    currentDirection: FaceDirection | null;
    error: string | null;
    feedbackMessage: string;
    feedbackType: FeedbackType;
  };
  
  // Detection loop state
  type DetectionLoopState = {
    isRunning: boolean;
    lastDetectionTime: number;
    frameCount: number;
  };
}
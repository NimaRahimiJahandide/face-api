import { Infer, object, string, number, boolean, union, literal, array, nullable } from 'superstruct';

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

export const FaceDetectionResult = object({
  detection: object({
    box: object({
      x: number(),
      y: number(),
      width: number(),
      height: number(),
    }),
    score: number(),
  }),
  landmarks: object({
    positions: array(object({
      x: number(),
      y: number(),
    })),
  }),
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
  onComplete: object({}), // Function type - will be refined below
});

export const InstructionsPageProps = object({
  onStart: object({}), // Function type - will be refined below
});

export const PreviewPageProps = object({
  images: array(CapturedImage),
  onNext: object({}), // Function type - will be refined below
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

// Global type declarations
declare global {
  type CapturedImage = Infer<typeof CapturedImage>;
  type FaceDirection = Infer<typeof FaceDirection>;
  type FaceDetectionResult = Infer<typeof FaceDetectionResult>;
  type CaptureStep = Infer<typeof CaptureStep>;
  type FeedbackType = Infer<typeof FeedbackType>;
  type PageState = Infer<typeof PageState>;
  type CameraConstraints = Infer<typeof CameraConstraints>;
  type FaceDetectionOptions = Infer<typeof FaceDetectionOptions>;
  type ErrorState = Infer<typeof ErrorState>;
  
  // Function types that can't be easily validated with superstruct
  type CaptureCompleteHandler = (images: CapturedImage[]) => void;
  type StartCaptureHandler = () => void;
  type NextHandler = () => void;
  type VoidHandler = () => void;
  
  // Face-api.js types (since they're not properly typed)
  type FaceApiDetection = {
    detection: {
      box: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      score: number;
    };
    landmarks: {
      positions: Array<{
        x: number;
        y: number;
      }>;
    };
  };
  
  // Canvas and video element refs
  type VideoRef = React.RefObject<HTMLVideoElement>;
  type CanvasRef = React.RefObject<HTMLCanvasElement>;
  
  // State setters
  type SetBoolean = React.Dispatch<React.SetStateAction<boolean>>;
  type SetString = React.Dispatch<React.SetStateAction<string>>;
  type SetNumber = React.Dispatch<React.SetStateAction<number>>;
  type SetCaptureStep = React.Dispatch<React.SetStateAction<CaptureStep>>;
  type SetFeedbackType = React.Dispatch<React.SetStateAction<FeedbackType>>;
  type SetFaceDirection = React.Dispatch<React.SetStateAction<FaceDirection | null>>;
  type SetCapturedImages = React.Dispatch<React.SetStateAction<CapturedImage[]>>;
  type SetPageState = React.Dispatch<React.SetStateAction<PageState>>;
}
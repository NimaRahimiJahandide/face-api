import React, { useEffect, useState } from 'react';
import InstructionsPage from './components/InstructionsPage';
import CapturePage from './components/CapturePage';
import PreviewPage from './components/PreviewPage';
import { CapturedImage } from './types'; // یا از CapturePage هم می‌تونی ایمپورت کنی

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

export default App;

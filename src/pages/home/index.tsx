import styles from './index.module.scss';
import { useEffect, useState } from 'react';
import InstructionsPage from '@/components/InstructionsPage';
import CapturePage from '@/components/CapturePage';
import PreviewPage from '@/components/PreviewPage';
import type { CapturedImage } from '@/types';

const Home = () => {
  const [currentPage, setCurrentPage] = useState<'instructions' | 'capture' | 'preview'>('instructions');
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);

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
    <div className={styles.AppContainer}>
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

export default Home;
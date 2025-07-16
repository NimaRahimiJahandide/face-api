import styles from './index.module.scss';
import { useEffect, useState } from 'react';
import InstructionsPage from '@/components/InstructionsPage';
import CapturePage from '@/components/CapturePage';
import PreviewPage from '@/components/PreviewPage';

const Home: React.FC = () => {
  const [currentPage, setCurrentPage]: [PageState, SetPageState] = useState<PageState>('instructions');
  const [capturedImages, setCapturedImages]: [CapturedImage[], SetCapturedImages] = useState<CapturedImage[]>([]);

  useEffect((): void => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  }, []);

  const handleStartCapture: StartCaptureHandler = (): void => {
    setCurrentPage('capture');
  };

  const handleCaptureComplete: CaptureCompleteHandler = (images: CapturedImage[]): void => {
    setCapturedImages(images);
    setCurrentPage('preview');
  };

  const handleNext: NextHandler = (): void => {
    setCurrentPage('instructions');
    setCapturedImages([]);
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
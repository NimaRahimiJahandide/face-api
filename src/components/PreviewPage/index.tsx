import styles from './styles.module.scss';
import React from 'react';
import type { CapturedImage } from '@/types';

interface Props {
  images: CapturedImage[];
  onNext: () => void;
}

const PreviewPage: React.FC<Props> = ({ images, onNext }) => {
  return (
    <div className={styles.PreviewContainer}>
      <h2 className={styles.Title}>Captured Images</h2>
      <div className={styles.ImagesGrid}>
        {images.map((image, index) => (
          <div key={index} className={styles.ImageWrapper}>
            <h3 className={styles.ImageTitle}>Position: {image.position}</h3>
            <img
              src={image.dataUrl}
              alt={`Face ${image.position}`}
              className={styles.Image}
            />
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className={styles.NextButton}
        type="button"
      >
        Next
      </button>
    </div>
  );
};

export default PreviewPage;
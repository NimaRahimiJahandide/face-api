import styles from './styles.module.scss';
import React from 'react';

interface Props {
  images: CapturedImage[];
  onNext: NextHandler;
}

const PreviewPage: React.FC<Props> = ({ images, onNext }) => {
  const handleNext = (): void => {
    onNext();
  };

  return (
    <div className={styles.PreviewContainer}>
      <h2 className={styles.Title}>Captured Images</h2>
      <div className={styles.ImagesGrid}>
        {images.map((image: CapturedImage, index: number) => (
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
        onClick={handleNext}
        className={styles.NextButton}
        type="button"
      >
        Finish
      </button>
    </div>
  );
};

export default PreviewPage;
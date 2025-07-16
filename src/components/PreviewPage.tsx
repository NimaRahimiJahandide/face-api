import React from 'react';
import { CapturedImage } from '../types';

interface Props {
  images: CapturedImage[];
  onNext: () => void;
}

const PreviewPage: React.FC<Props> = ({ images, onNext }) => {
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
                borderRadius: '8px',
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
          cursor: 'pointer',
        }}
      >
        Next
      </button>
    </div>
  );
};

export default PreviewPage;

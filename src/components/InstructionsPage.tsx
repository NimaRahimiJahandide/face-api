import React from 'react';
interface Props {
  onStart: () => void;
}

const InstructionsPage: React.FC<Props> = ({ onStart }) => {
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
          cursor: 'pointer',
        }}
      >
        Start Face Capture
      </button>
    </div>
  );
};

export default InstructionsPage;

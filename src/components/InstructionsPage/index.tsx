import styles from './styles.module.scss';
import React from 'react';

interface Props {
  onStart: () => void;
}

const InstructionsPage: React.FC<Props> = ({ onStart }) => {
  return (
    <div className={styles.InstructionsContainer}>
      <h1 className={styles.Title}>Face Capture Instructions</h1>
      <div className={styles.Content}>
        <p className={styles.Description}>Please prepare for face capture:</p>
        <ul className={styles.InstructionsList}>
          <li className={styles.ListItem}>Make sure you're in a well-lit area</li>
          <li className={styles.ListItem}>Position your face clearly in front of the camera</li>
          <li className={styles.ListItem}>We'll take 3 photos: center, right, and left positions</li>
          <li className={styles.ListItem}>Follow the on-screen instructions during capture</li>
        </ul>
      </div>
      <button
        onClick={onStart}
        className={styles.StartButton}
        type="button"
      >
        Start Face Capture
      </button>
    </div>
  );
};

export default InstructionsPage;
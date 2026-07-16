import React from 'react';
export default function ExportModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1C2029', padding: 24, borderRadius: 8 }}>
        <h3>Export Video</h3>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
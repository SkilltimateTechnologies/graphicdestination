import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';

export default function ExportModal({ onClose }) {
  const { objects, camera } = useEditorStore();
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectData: { objects, camera, duration: 5000 } 
        })
      });
      const data = await res.json();

      if (data.downloadUrl) {
        // For local testing, create a download link
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = 'graphic-destination-export.mp4';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setDownloadUrl(data.downloadUrl);
      }
    } catch (e) {
      alert('Export failed. Check console.');
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: '#1C2029', padding: 32, borderRadius: 12, width: 420, color: '#E9EBF2' }}>
        <h3 style={{ marginTop: 0 }}>Export Video</h3>
        
        {!downloadUrl ? (
          <button 
            onClick={handleExport} 
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: '14px 0', 
              background: '#FFB224', 
              color: '#1A1405', 
              border: 'none', 
              borderRadius: 8, 
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer'
            }}
          >
            {loading ? 'Rendering video...' : 'Export MP4'}
          </button>
        ) : (
          <div style={{ color: '#6EE7B7', textAlign: 'center' }}>
            Video exported successfully!
          </div>
        )}

        <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: 10 }}>
          Close
        </button>
      </div>
    </div>
  );
}
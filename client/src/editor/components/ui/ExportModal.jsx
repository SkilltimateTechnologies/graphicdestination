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
        body: JSON.stringify({ projectData: { objects, camera, duration: 5000 } })
      });
      const data = await res.json();
      if (data.downloadUrl) setDownloadUrl(data.downloadUrl);
    } catch (e) {
      alert('Export failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#1C2029', padding: 32, borderRadius: 12, width: 400 }}>
        <h3>Export Video</h3>
        {!downloadUrl ? (
          <button onClick={handleExport} disabled={loading} style={{ width: '100%', padding: 12, background: '#FFB224', color: '#1A1405', border: 'none', borderRadius: 8, fontWeight: 700 }}>
            {loading ? 'Rendering...' : 'Export MP4'}
          </button>
        ) : (
          <a href={downloadUrl} download style={{ color: '#6EE7B7' }}>Download Video</a>
        )}
        <button onClick={onClose} style={{ marginTop: 16, width: '100%' }}>Close</button>
      </div>
    </div>
  );
}
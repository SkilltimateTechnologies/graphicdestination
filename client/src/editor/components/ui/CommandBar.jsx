import React, { useState } from 'react';
import ExportModal from './ExportModal';

export default function CommandBar() {
  const [showExport, setShowExport] = useState(false);

  return (
    <div style={{ padding: 8, background: '#16181F', display: 'flex', gap: 8 }}>
      <button onClick={() => setShowExport(true)}>Export Video</button>
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}
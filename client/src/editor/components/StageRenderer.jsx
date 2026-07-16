import React from 'react';
import { useEditorStore } from '../store/useEditorStore';

export default function StageRenderer() {
  const { objects } = useEditorStore();

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0c12' }}>
      {objects.map(obj => {
        const p = obj.props || {};
        if (obj.type === 'shape') {
          return <div key={obj.id} style={{
            position: 'absolute', left: p.x || 100, top: p.y || 100,
            width: p.w || 120, height: p.h || 120,
            background: p.fill || '#FFB224', borderRadius: 8,
            transform: 'translate(-50%, -50%)'
          }} />;
        }
        if (obj.type === 'text') {
          return <div key={obj.id} style={{
            position: 'absolute', left: p.x || 100, top: p.y || 100,
            color: p.fill || '#fff', fontSize: p.fontSize || 32, fontWeight: 700,
            transform: 'translate(-50%, -50%)'
          }}>{p.text || 'Text Layer'}</div>;
        }
        return null;
      })}
    </div>
  );
}
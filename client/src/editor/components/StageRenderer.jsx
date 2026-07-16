import React from 'react';
import { useEditorStore } from '../store/useEditorStore';

export default function StageRenderer() {
  const { objects } = useEditorStore();

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%', 
      background: '#111', 
      overflow: 'hidden' 
    }}>
      {objects.map((obj) => {
        const { x = 100, y = 100, w = 120, h = 120, fill = '#FFB224' } = obj.props || {};

        if (obj.type === 'shape') {
          return (
            <div key={obj.id} style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              backgroundColor: fill,
              borderRadius: 8,
              transform: 'translate(-50%, -50%)'
            }} />
          );
        }

        if (obj.type === 'text') {
          return (
            <div key={obj.id} style={{
              position: 'absolute',
              left: x,
              top: y,
              color: fill || '#fff',
              fontSize: 32,
              fontWeight: 700,
              transform: 'translate(-50%, -50%)'
            }}>
              {obj.props?.text || 'Text'}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
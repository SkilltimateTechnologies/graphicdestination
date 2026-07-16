import React from 'react';
import Stage from './Stage';
import Timeline from './Timeline';
import Inspector from './Inspector';

export default function EditorLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 10, background: '#1C2029' }}>Graphic Destination - Editor</div>
      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ flex: 1, background: '#16181F' }}><Stage /></div>
        <div style={{ width: 280, background: '#1C2029', borderLeft: '1px solid #2A2E3A' }}><Inspector /></div>
      </div>
      <div style={{ height: 120, background: '#1C2029', borderTop: '1px solid #2A2E3A' }}><Timeline /></div>
    </div>
  );
}
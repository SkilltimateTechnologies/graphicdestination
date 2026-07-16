import React from 'react';
import Stage from './Stage';
import Timeline from './Timeline';
import Inspector from './Inspector';
import CommandBar from './ui/CommandBar';
import ToolRail from './ui/ToolRail';

export default function EditorLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0F1116', color: '#E9EBF2' }}>
      <CommandBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ToolRail />
        <div style={{ flex: 1 }}><Stage /></div>
        <div style={{ width: 280, borderLeft: '1px solid #2A2E3A' }}><Inspector /></div>
      </div>
      <div style={{ height: 110, borderTop: '1px solid #2A2E3A' }}><Timeline /></div>
    </div>
  );
}
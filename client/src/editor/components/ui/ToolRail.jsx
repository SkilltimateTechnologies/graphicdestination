import React from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { getEnabledWidgets } from '../registry/widgetRegistry';

export default function ToolRail() {
  const { addObject } = useEditorStore();
  const widgets = getEnabledWidgets();

  return (
    <div style={{ padding: 12, background: '#1C2029', width: 60 }}>
      {widgets.map(w => (
        <button key={w.id} onClick={() => addObject(w.id)} style={{ display: 'block', width: '100%', marginBottom: 8 }}>
          {w.icon} {w.name}
        </button>
      ))}
    </div>
  );
}
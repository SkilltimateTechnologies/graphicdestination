export const WIDGETS = [
  { id: 'shape', name: 'Shape', icon: '◆', enabled: true, order: 1, group: 'Core' },
  { id: 'text', name: 'Text', icon: 'T', enabled: true, order: 2, group: 'Core' },
  { id: 'audio', name: 'Audio', icon: '♫', enabled: true, order: 3, group: 'Media' }
];

export function getEnabledWidgets() {
  return WIDGETS.filter(w => w.enabled).sort((a, b) => a.order - b.order);
}
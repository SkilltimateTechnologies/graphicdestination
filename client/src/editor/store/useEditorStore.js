import { create } from 'zustand';

export const useEditorStore = create((set) => ({
  objects: [],
  selIds: [],
  time: 0,
  playing: false,
  camera: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, zoom: 1 },

  addObject: (type, props = {}) => set((state) => ({
    objects: [...state.objects, {
      id: 'obj_' + Date.now(),
      type,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      props: { x: 640, y: 360, ...props }
    }]
  })),

  setSelIds: (ids) => set({ selIds: ids }),
  updateCamera: (patch) => set((state) => ({ camera: { ...state.camera, ...patch } }))
}));
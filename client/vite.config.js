import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      /* ts-ebml (WebM duration repair, see src/export/exportVideo.js) pulls in
         the "ebml" package, whose package.json "browser" field points at an
         IIFE build with NO module exports — bundlers that honor browser
         fields then hand ts-ebml an empty module and its tools break at
         runtime. Pin ebml to its real ESM build for browser bundles. */
      ebml: 'ebml/lib/ebml.esm.js',
    },
  },
})

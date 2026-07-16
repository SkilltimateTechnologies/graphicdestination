import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div style={{ padding: 60, textAlign: 'center', background: '#0F1116', color: '#E9EBF2', minHeight: '100vh' }}>
      <h1>Graphic Destination</h1>
      <p>Professional motion graphics in the browser</p>
      <Link to="/editor" style={{ color: '#FFB224' }}>Open Editor</Link>
    </div>
  );
}
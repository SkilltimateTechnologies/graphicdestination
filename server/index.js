import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '50mb' }));

// Serve React frontend
const distPath = path.join(__dirname, '../client/dist');
app.use(express.static(distPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Video Export (basic)
app.post('/api/export', async (req, res) => {
  res.json({ success: true, message: 'Export endpoint ready', downloadUrl: '/placeholder.mp4' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
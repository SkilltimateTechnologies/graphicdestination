import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '50mb' }));

// Serve built frontend
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Basic API routes
app.get('/api/health', (req, res) => res.json({ ok: true }));

// TODO: Add /api/export for video rendering

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
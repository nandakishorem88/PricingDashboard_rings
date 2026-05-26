import express from 'express';
import cors from 'cors';
import { getPool } from './db.js';
import execRoute from './routes/exec.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/exec', execRoute);

const PORT = parseInt(process.env.EXEC_PORT || '4101', 10);
(async () => {
  try { await getPool('jsr'); }
  catch (e) { console.error('[exec] DB connect failed at boot:', e.message); }
  app.listen(PORT, () => console.log(`[exec] listening on http://localhost:${PORT}`));
})();

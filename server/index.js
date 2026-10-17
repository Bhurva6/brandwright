// Local dev entry — Vercel uses api/index.js -> server/app.js instead.
import app from './app.js';
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`\n  Brandwright server → http://localhost:${PORT}\n`));

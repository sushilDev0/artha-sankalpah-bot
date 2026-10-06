import './config/dns.js';
import * as dotenv from 'dotenv';
dotenv.config();
import http from 'node:http';
import { connectDB } from './config/db.js';
import { connectToWhatsapp } from './whatsapp.js';

const port = Number(process.env.PORT) || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(req.url === '/health' ? 'ok' : 'Artha Sankalpah is running');
}).listen(port, () => console.log(`🩺 Health server on :${port}`));

await connectDB();
await connectToWhatsapp();
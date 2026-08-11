import './config/dns.js';
import * as dotenv from 'dotenv';
dotenv.config();
import { connectDB } from './config/db.js';
import { connectToWhatsapp } from './whatsapp.js';

connectDB();
connectToWhatsapp();
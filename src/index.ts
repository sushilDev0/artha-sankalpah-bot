import './config/dns';
import { connectDB } from './config/db';
import { connectToWhatsapp } from './whatsapp';
import * as dotenv from 'dotenv';

dotenv.config();
connectDB();
connectToWhatsapp();
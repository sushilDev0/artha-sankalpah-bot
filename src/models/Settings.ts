import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  weeklyTime: { type: String, default: null },   // "21:00" 24hr format
  lastWeeklySent: { type: Date, default: null },
  
});

export const Settings = mongoose.model('Settings', SettingsSchema);
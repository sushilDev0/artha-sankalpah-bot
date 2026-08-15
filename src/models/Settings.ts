import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
  chatId: { 
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  weeklyTime: { 
    type: String,
    default: "21:00",
    validate: {
      validator: (v: string) => /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v),
      message: (props: any) => `${props.value} is not a valid time format! Use HH:MM (24hr)`
    }
  },
  
  lastWeeklySent: { 
    type: Date, 
    default: null 
  },
  
  
  weeklyReportEnabled: {
    type: Boolean,
    default: true
  }
  
}, {
  timestamps: true  // Add createdAt & updatedAt for tracking
});

// Now this index works correctly
SettingsSchema.index({ weeklyTime: 1, weeklyReportEnabled: 1 });

export const Settings = mongoose.model('Settings', SettingsSchema);
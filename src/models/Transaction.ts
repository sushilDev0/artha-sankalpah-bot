import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  // 🔑 Link to WhatsApp user
  chatId: { 
    type: String, 
    required: [true, 'chatId is required'],
    index: true,
    validate: {
      validator: (v: string) => v.includes('@s.whatsapp.net'),
      message: 'Invalid WhatsApp JID format'
    }
  },
  
  // 💰 Amount with strict validation
  amount: { 
    type: Number, 
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be at least 0.01'],
    max: [999999999, 'Amount cannot exceed 99,99,99,999']
  },
  
  // 📂 Category
  category: { 
    type: String, 
    required: [true, 'Category is required'],
    trim: true,
    lowercase: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  
  // 📝 Optional description
  description: { 
    type: String, 
    default: "",
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  
  // 📊 Income or Expense
  type: { 
    type: String, 
    enum: {
      values: ['income', 'expense'],
      message: '{VALUE} is not valid. Use "income" or "expense"'
    },
    default: 'expense',
    index: true
  },
  
  // 📅 Transaction date
  date: { 
    type: Date, 
    default: Date.now,
    index: true
  },

  // 🏷️ Optional tags for filtering
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }]

}, { 
  timestamps: true,  // ✅ createdAt & updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 📊 Compound indexes for fast queries
TransactionSchema.index({ chatId: 1, date: -1 });                    // Recent transactions
TransactionSchema.index({ chatId: 1, type: 1, date: -1 });          // Income/expense history
TransactionSchema.index({ chatId: 1, category: 1, date: -1 });      // Category spending

// 💡 Virtual for formatted amount (used in messages)
TransactionSchema.virtual('formattedAmount').get(function() {
  const prefix = this.type === 'income' ? '+' : '-';
  return `${prefix}₹${this.amount.toLocaleString('en-IN')}`;
});

// 🕒 Virtual for formatted date (IST timezone)
TransactionSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
});

// 📋 Static method for recent transactions
TransactionSchema.statics.getRecent = function(chatId: string, limit = 5) {
  return this.find({ chatId })
    .sort({ date: -1 })
    .limit(limit)
    .lean();  // Faster reads with .lean()
};

// 📊 Static method for today's summary
TransactionSchema.statics.getTodayStats = async function(chatId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await this.aggregate([
    {
      $match: {
        chatId,
        date: { $gte: today, $lt: tomorrow }
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const income = result.find((r: any) => r._id === 'income')?.total || 0;
  const expense = result.find((r: any) => r._id === 'expense')?.total || 0;

  return {
    income,
    expense,
    balance: income - expense,
    transactionCount: result.reduce((sum: number, r: any) => sum + r.count, 0)
  };
};

export const Transaction = mongoose.model('Transaction', TransactionSchema);
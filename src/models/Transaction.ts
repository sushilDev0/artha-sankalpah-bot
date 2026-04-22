import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    category: {
        type: String,
        required: true,
        index: true,
        lowercase: true
    },
    description: { type: String, trim: true },
    type: {
        String,
        enum: ['income', 'expense'],
        default: 'expense'
    },
    timeStamp: { type: Date, default: Date.now }
});

export const Transaction = mongoose.model('Transaction', TransactionSchema);
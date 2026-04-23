import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true
    },
    category: {
        type: String, 
        required: true
    },
    description: {
        type: String,
        default: ""
    },
    type: {
        type: String,
        enum: ['income', 'expense'], 
        default: 'expense'
    },
    date: {
        type: Date,
        default: Date.now
    }
});

export const Transaction = mongoose.model('Transaction', TransactionSchema);
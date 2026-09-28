const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/supportdesk';
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    console.log('MongoDB connection error: ' + err.message);
    process.exit(1);
  }
}

module.exports = connectDB;

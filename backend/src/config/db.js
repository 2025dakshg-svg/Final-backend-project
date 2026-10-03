const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb+srv://2025dakshg_db_user:CYAhQ8szu58A1GR9@hospitalmgmt.jscgsxa.mongodb.net/supportdesk?retryWrites=true&w=majority';

async function connectDB() {
  const uri = process.env.MONGO_URI || ATLAS_URI;

  if (!uri) {
    console.error('=================================================================');
    console.error('CONFIGURATION ERROR: MONGO_URI is missing in Render Environment!');
    console.error('Render cloud instances do not have a local MongoDB daemon.');
    console.error('Please go to: Render Dashboard -> Environment -> Add Environment Variable');
    console.error('Key: MONGO_URI');
    console.error('Value: mongodb+srv://<user>:<password>@<cluster>.mongodb.net/supportdesk');
    console.error('=================================================================');
    process.exit(1);
  }

  try {
    const masked = uri.replace(/\/\/[^@]+@/, '//***:***@');
    console.log('Connecting to MongoDB: ' + masked);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error: ' + err.message);
    if (err.message.includes('whitelist') || err.message.includes('Could not connect')) {
      console.error('HINT: Check MongoDB Atlas Network Access. Add 0.0.0.0/0 to allow cloud connections.');
    }
    process.exit(1);
  }
}

module.exports = connectDB;

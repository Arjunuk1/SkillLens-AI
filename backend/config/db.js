const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('⚠️  MONGO_URI is not set. API routes that need the database will return 503.');
    return null;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅  MongoDB connected: ${conn.connection.host}`);

    // Log when connection drops so you can catch Atlas hiccups early
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected — attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅  MongoDB reconnected');
    });

  } catch (error) {
    console.error(`❌  MongoDB connection error: ${error.message}`);
    console.warn('⚠️  Backend is still running. Fix MongoDB access, then restart the backend.');
    return null;
  }
};

module.exports = connectDB;

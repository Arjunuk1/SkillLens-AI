const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options silence deprecation warnings in Mongoose 6+
      // (Mongoose 7+ ignores them but they don't hurt)
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
    // Exit process so PM2 / nodemon restarts cleanly
    process.exit(1);
  }
};

module.exports = connectDB;

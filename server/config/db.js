const mongoose = require('mongoose');

function sanitizeMongoUri(uri) {
  if (!uri) return uri;
  const protoEnd = uri.indexOf('://');
  if (protoEnd === -1) return uri;
  const prefix = uri.substring(0, protoEnd + 3);
  const remainder = uri.substring(protoEnd + 3);
  
  const pathStart = remainder.indexOf('/');
  const authAndHost = pathStart !== -1 ? remainder.substring(0, pathStart) : remainder;
  const pathAndQuery = pathStart !== -1 ? remainder.substring(pathStart) : '';
  
  const lastAt = authAndHost.lastIndexOf('@');
  if (lastAt === -1) return uri;
  
  const userPass = authAndHost.substring(0, lastAt);
  const host = authAndHost.substring(lastAt + 1);
  
  const colonIdx = userPass.indexOf(':');
  if (colonIdx === -1) return uri;
  
  const user = userPass.substring(0, colonIdx);
  const rawPass = userPass.substring(colonIdx + 1);
  
  let cleanPass = rawPass;
  try { cleanPass = decodeURIComponent(rawPass); } catch (e) {}
  const encodedPass = encodeURIComponent(cleanPass);
  
  return prefix + user + ':' + encodedPass + '@' + host + pathAndQuery;
}

const connectDB = async () => {
  try {
    const rawUri = process.env.MONGO_URI || '';
    const cleanUri = sanitizeMongoUri(rawUri);
    const isCosmos = cleanUri.includes('cosmos.azure.com');

    const conn = await mongoose.connect(cleanUri, {
      tls: true,
      tlsAllowInvalidCertificates: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 60000,
      maxPoolSize: 20,
      minPoolSize: 2,
      retryWrites: !isCosmos,  // Cosmos DB Serverless does not support retryWrites
      retryReads: true,
      heartbeatFrequencyMS: 10000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected — driver will auto-reconnect');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

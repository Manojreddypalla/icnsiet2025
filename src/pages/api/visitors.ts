import type { APIRoute } from 'astro';
import { MongoClient, ObjectId } from 'mongodb';

// MongoDB connection string from environment variables
const MONGODB_URI = import.meta.env.MONGO_URI;

// Add detailed logging
console.log('Environment variables:', {
  MONGO_URI: MONGODB_URI ? 'Present' : 'Missing',
  NODE_ENV: import.meta.env.MODE,
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD
});

if (!MONGODB_URI) {
  console.error('MongoDB URI is not configured in environment variables');
}

let client: MongoClient | null = null;

async function getMongoClient() {
  if (!MONGODB_URI) {
    throw new Error('MongoDB connection string is not defined in environment variables');
  }
  
  if (!client) {
    console.log('Creating new MongoDB client connection');
    client = new MongoClient(MONGODB_URI);
  }
  return client;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    // Check for MongoDB URI first
    if (!MONGODB_URI) {
      console.error('MongoDB URI is not configured');
      return new Response(JSON.stringify({ 
        error: 'Database connection not configured',
        totalVisits: 0,
        activeUsers: 0
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const clientId = request.headers.get('x-client-id') || crypto.randomUUID();
    const shouldUpdateTotal = request.headers.get('x-update-total') === 'true';
    console.log('Processing request for client:', clientId, 'Update total:', shouldUpdateTotal);
    
    const mongoClient = await getMongoClient();
    console.log('Connected to MongoDB client');
    
    const db = mongoClient.db('visitor-counter');
    console.log('Using database: visitor-counter');
    
    // Update or create visitor document
    const now = Date.now();
    const inactiveThreshold = 2 * 60 * 1000; // 2 minutes
    
    // Update active users
    const activeUserResult = await db.collection('activeUsers').updateOne(
      { clientId },
      { 
        $set: { 
          lastActive: now,
          clientId,
          firstSeen: { $setOnInsert: now }
        }
      },
      { upsert: true }
    );
    console.log('Active user update result:', activeUserResult);
    
    // Cleanup inactive users
    const cleanupResult = await db.collection('activeUsers').deleteMany({
      lastActive: { $lt: now - inactiveThreshold }
    });
    console.log('Cleanup result:', cleanupResult);
    
    // Only increment total visits if requested
    if (shouldUpdateTotal) {
      const visitResult = await db.collection('stats').updateOne(
        { _id: new ObjectId('000000000000000000000000') },
        { 
          $inc: { count: 1 },
          $setOnInsert: { lastUpdated: now }
        },
        { upsert: true }
      );
      console.log('Visit update result:', visitResult);
    }
    
    // Get current stats
    const [activeUsersCount, visitsDoc] = await Promise.all([
      db.collection('activeUsers').countDocuments(),
      db.collection('stats').findOne({ _id: new ObjectId('000000000000000000000000') })
    ]);
    
    const totalVisits = visitsDoc?.count || 0;
    console.log('Current stats:', { totalVisits, activeUsers: activeUsersCount });
    
    return new Response(JSON.stringify({
      totalVisits,
      activeUsers: activeUsersCount,
      clientId
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal Server Error',
      totalVisits: 0,
      activeUsers: 0
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}; 
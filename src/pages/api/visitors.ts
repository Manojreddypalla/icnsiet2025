import type { APIRoute } from 'astro';
import { MongoClient, ObjectId } from 'mongodb';

// MongoDB connection string from environment variables
const MONGODB_URI = import.meta.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error('MongoDB connection string is not defined in environment variables');
}

let client: MongoClient | null = null;

async function getMongoClient() {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
  }
  return client;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const clientId = request.headers.get('x-client-id') || crypto.randomUUID();
    const mongoClient = await getMongoClient();
    const db = mongoClient.db('visitor-counter');
    
    // Update or create visitor document
    const now = Date.now();
    const inactiveThreshold = 2 * 60 * 1000; // 2 minutes
    
    // Update active users
    await db.collection('activeUsers').updateOne(
      { clientId },
      { 
        $set: { 
          lastActive: now,
          clientId
        }
      },
      { upsert: true }
    );
    
    // Cleanup inactive users
    await db.collection('activeUsers').deleteMany({
      lastActive: { $lt: now - inactiveThreshold }
    });
    
    // Increment total visits
    await db.collection('stats').updateOne(
      { _id: new ObjectId('000000000000000000000000') }, // Using a fixed ObjectId for the stats document
      { $inc: { count: 1 } },
      { upsert: true }
    );
    
    // Get current stats
    const [activeUsersCount, visitsDoc] = await Promise.all([
      db.collection('activeUsers').countDocuments(),
      db.collection('stats').findOne({ _id: new ObjectId('000000000000000000000000') })
    ]);
    
    const totalVisits = visitsDoc?.count || 0;
    
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
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}; 
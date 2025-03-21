import type { APIRoute } from 'astro';

// In-memory storage (in production, use a database)
let totalVisits = 0;
interface ActiveUser {
  lastActive: number;
  clientId: string;
}
const activeUsers = new Map<string, ActiveUser>();

// Remove inactive users (those who haven't been active for 2 minutes)
function cleanupInactiveUsers() {
  const now = Date.now();
  const inactiveThreshold = 2 * 60 * 1000; // 2 minutes

  for (const [clientId, user] of activeUsers.entries()) {
    if (now - user.lastActive > inactiveThreshold) {
      activeUsers.delete(clientId);
    }
  }
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const clientId = request.headers.get('x-client-id') || crypto.randomUUID();
    
    // Update or add active user
    activeUsers.set(clientId, {
      lastActive: Date.now(),
      clientId
    });
    
    // Increment total visits
    totalVisits++;
    
    // Cleanup inactive users before sending response
    cleanupInactiveUsers();
    
    return new Response(JSON.stringify({
      totalVisits,
      activeUsers: activeUsers.size,
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
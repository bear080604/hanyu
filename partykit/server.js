/**
 * PartyKit Real-time WebSocket Server for Hanyu Arena
 * Runs on Cloudflare Edge (Durable Objects) with Zero Cold Start.
 * 
 * Handles:
 * - Room isolation by game PIN (each PIN is an isolated room instance)
 * - Sub-20ms WebSocket message broadcasting for Quizizz/Kahoot-style gameplay
 * - Automatic connection tracking & room cleanup
 */

export default class ArenaServer {
  constructor(room) {
    this.room = room;
  }

  /**
   * Called when a new player or host connects via WebSocket
   */
  onConnect(conn, ctx) {
    console.log(`⚡ [PartyKit] Connection ${conn.id} joined room PIN: ${this.room.id}`);
    
    // Send immediate confirmation to client
    conn.send(JSON.stringify({
      type: 'pk_ack',
      connId: conn.id,
      pin: this.room.id,
      serverTime: Date.now()
    }));
  }

  /**
   * Called when a client sends a message over WebSocket
   */
  onMessage(message, sender) {
    try {
      // Broadcast to everyone in the room (Host + Players)
      this.room.broadcast(message);
    } catch (err) {
      console.error('❌ [PartyKit] Broadcast error:', err);
    }
  }

  /**
   * Called when a client disconnects
   */
  onClose(conn) {
    console.log(`🔌 [PartyKit] Connection ${conn.id} left room PIN: ${this.room.id}`);
  }

  /**
   * Called on HTTP requests to this room (e.g. Health checks or status queries)
   */
  async onRequest(req) {
    const connections = [...this.room.getConnections()].length;
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'hanyu-arena-partykit',
      pin: this.room.id,
      activeConnections: connections,
      time: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

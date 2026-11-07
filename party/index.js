/**
 * ⚡ PartyKit Edge Server for Free Study Material Collaborative Study Pods
 * Runs on Cloudflare Edge (Durable Objects) with 0.0% Render Server Load
 * 
 * Deploy via CLI:
 *   npx partykit deploy
 */
import { onConnect } from "y-partykit";

export default {
  async onConnect(conn, room) {
    return onConnect(conn, room, {
      persist: true, // Persists canvas drawings and notes to Cloudflare storage
    });
  },
};

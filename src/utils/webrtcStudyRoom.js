/**
 * Yjs + WebRTC Peer-to-Peer Group Study Engine
 * 100% Royalty-Free & P2P • 0.0% Render Server Load • Instant DataChannels
 */
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export class WebrtcStudyRoom {
  /**
   * @param {string} roomName (e.g. noteId or study room code)
   * @param {object} currentUser ({ name, id })
   */
  constructor(roomName, currentUser = {}) {
    this.roomName = `fsm-study-${roomName}`;
    this.ydoc = new Y.Doc();

    // Collaborative Shared Types
    this.sharedHighlights = this.ydoc.getArray('highlights');
    this.sharedChat = this.ydoc.getArray('chat');
    this.sharedStrokes = this.ydoc.getArray('canvas_strokes');
    this.sharedState = this.ydoc.getMap('state'); // e.g. currentPage, scrollRatio, leaderId

    // Public Free WebRTC Signaling & STUN
    this.provider = new WebrtcProvider(this.roomName, this.ydoc, {
      signaling: [
        'wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com'
      ],
      password: null,
      awareness: this.ydoc.awareness,
      maxConns: 20,
      filterBcConns: true,
      peerOpts: {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      },
    });

    // Set user awareness (avatar name / color)
    const randomColor = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24'][Math.floor(Math.random() * 5)];
    this.provider.awareness.setLocalStateField('user', {
      name: currentUser.name || `Scholar-${Math.floor(Math.random() * 1000)}`,
      color: randomColor,
      activePage: 1,
    });
  }

  /**
   * Listens for connected peers count changes
   * @param {function} callback (peerCount, peersList)
   */
  onPeersChange(callback) {
    this.provider.awareness.on('change', () => {
      const states = Array.from(this.provider.awareness.getStates().values());
      const peers = states.filter((s) => s.user).map((s) => s.user);
      callback(peers.length, peers);
    });
  }

  /**
   * Syncs active page across all peers in the study room
   * @param {number} page 
   */
  setPage(page) {
    this.sharedState.set('currentPage', page);
    const localUser = this.provider.awareness.getLocalState()?.user || {};
    this.provider.awareness.setLocalStateField('user', { ...localUser, activePage: page });
  }

  /**
   * Subscribes to leader page changes
   * @param {function} callback (page)
   */
  onPageSync(callback) {
    this.sharedState.observe(() => {
      const page = this.sharedState.get('currentPage');
      if (page) callback(page);
    });
  }

  /**
   * Broadcasts synchronized vertical scroll ratio (0.0 to 1.0)
   * @param {number} ratio 
   */
  setScrollRatio(ratio) {
    this.sharedState.set('scrollRatio', ratio);
  }

  /**
   * Subscribes to synchronized scroll ratio updates
   * @param {function} callback (ratio)
   */
  onScrollSync(callback) {
    this.sharedState.observe(() => {
      const ratio = this.sharedState.get('scrollRatio');
      if (typeof ratio === 'number') callback(ratio);
    });
  }

  /**
   * Adds an HTML5 canvas drawing stroke
   * @param {object} stroke { points: [{x, y}, ...], color, width, mode: 'pen'|'highlighter'|'eraser' }
   */
  addStroke(stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    this.sharedStrokes.push([stroke]);
  }

  /**
   * Clears all canvas strokes across all peers
   */
  clearStrokes() {
    if (!this.sharedStrokes || !this.ydoc) return;
    this.ydoc.transact(() => {
      const len = this.sharedStrokes.length;
      if (len > 0) {
        this.sharedStrokes.delete(0, len);
      }
    });
  }

  /**
   * Subscribes to shared canvas strokes updates
   * @param {function} callback (strokesArray)
   */
  onStrokesChange(callback) {
    this.sharedStrokes.observe(() => {
      callback(this.sharedStrokes.toArray());
    });
  }

  /**
   * Adds a highlighted phrase shared in real-time
   * @param {object} highlight { page, text, color, author }
   */
  addHighlight(highlight) {
    this.sharedHighlights.push([highlight]);
  }

  /**
   * Subscribes to shared highlights updates
   * @param {function} callback (highlightsArray)
   */
  onHighlightsChange(callback) {
    this.sharedHighlights.observe(() => {
      callback(this.sharedHighlights.toArray());
    });
  }

  /**
   * Sends a peer-to-peer chat message
   * @param {string} text 
   * @param {string} author 
   */
  sendChatMessage(text, author) {
    if (!text || !text.trim()) return;
    this.sharedChat.push([{
      id: Date.now() + Math.random().toString(36).substring(2, 6),
      text: text.trim(),
      author: author || 'Scholar',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }]);
  }

  /**
   * Subscribes to peer-to-peer chat updates
   * @param {function} callback (messagesArray)
   */
  onChatChange(callback) {
    this.sharedChat.observe(() => {
      callback(this.sharedChat.toArray());
    });
  }

  /**
   * Leaves room and disconnects WebRTC DataChannels
   */
  destroy() {
    try {
      this.provider.disconnect();
      this.provider.destroy();
      this.ydoc.destroy();
    } catch (_) {}
  }
}


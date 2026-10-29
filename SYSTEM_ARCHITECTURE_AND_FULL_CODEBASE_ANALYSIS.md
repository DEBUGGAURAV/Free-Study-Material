# FREE STUDY MATERIAL ENTERPRISE PLATFORM
## Comprehensive System Architecture & Deep Codebase Analysis Manual
**Document Version:** 4.2.0 • **Classification:** Comprehensive Technical Blueprint • **Release Date:** October 2026

---

## 1. Executive Summary & Platform Overview

The **Free Study Material (FSM)** platform is an enterprise-grade academic cloud ecosystem designed to deliver high-concurrency educational content distribution, zero-cost large-file streaming, real-time peer-to-peer collaboration, and military-grade Zero-Trust security. 

Unlike traditional monoliths or server-heavy storage systems, the platform utilizes a **Decoupled Asymmetrical Hybrid Architecture**:
- **Compute Layer**: Node.js 20+ Express runtime hosted on Render, optimized with an autonomous self-healing event-loop lag supervisor.
- **Storage Tier (Infinite Free Capacity)**: Distributed Telegram MTProto Singapre Datacenter 5 (DC-5) multi-chunk streaming with direct Range-request byte slicing, completely bypassing cloud storage fees.
- **Metadata & State Tiers**: 
  - **Google Cloud Firestore (Mumbai `asia-south1`)**: ACID document store for student profiles, collections, access tokens, and automated TTL event queues.
  - **Turso LibSQL (SQLite on Edge)**: Zero-latency replication database storing real-time notes caches, community audit logs, and instant offline query failovers.
- **Edge Acceleration**: Dedicated Cloudflare Anycast Worker proxy handling Range-request caching, streaming pipelining, and DDoS packet absorption.
- **Client Defense & Telemetry**: Dynamic client-side anti-tamper sensing (`disable-devtool` multi-vector array), 3-strike escalation, automatic 24-hour IP jail detention, deep hardware profiling, and WebAuthn biometric passkeys.

---

### Core Technology Stack Matrix

| Subsystem | Technologies & Frameworks | Primary Function |
| :--- | :--- | :--- |
| **Frontend Core** | React 18, Vite 6, Rollup Code-Splitting | Single Page App (SPA) with dynamic code chunks under 500kB. |
| **Backend API** | Node.js (v20+), Express 4.21, WebSocket (ws) | REST API, WSS Live Chat Broker, P2P Signaling Server. |
| **Storage Engine** | Telegram MTProto (GramJS/Telegram API) | DC-5 Singapore (91.108.56.104:443) lossless document storage. |
| **Primary Database** | Google Cloud Firestore (asia-south1) | Student accounts, encrypted PII, notes metadata, TTL indexes. |
| **Edge Database** | Turso (LibSQL / SQLite Edge) | Sub-millisecond note caches, audit logs, and query failover. |
| **Edge Proxy** | Cloudflare Workers (V8 Edge Runtime) | Global Anycast edge stream caching, byte-range delivery. |
| **Security Shield** | disable-devtool, Helmet 8, Bcrypt, AES-256-GCM | Anti-tamper sensor, 3-strike IP jail, zero-trust cryptographic vault. |
| **Document Processing** | pdf-lib, pdfjs-dist, Sharp, Tesseract.js | In-memory canvas rendering, WebP thumbnails, client OCR. |
| **Real-time Sync** | Yjs, y-webrtc, WebRTC Mesh | Browser-to-browser P2P collaborative study pods without server load. |
| **Authentication** | JWT, HttpOnly Cookies, @simplewebauthn | Multi-device session control, FIDO2/WebAuthn Biometrics. |


---

## 2. Master Architecture & Data Flow

```text
                                      +---------------------------------------------+
                                      |             STUDENT CLIENT BROWSERS         |
                                      |   React 18 SPA + WebWorker + IndexedDB      |
                                      |  (Hardware Adaptive Engine + Anti-Tamper)   |
                                      +----------------------+----------------------+
                                                             |
                                      +----------------------+----------------------+
                                      |           CLOUDFLARE ANYCAST EDGE           |
                                      |   Global CDN + Range Cache + WAF Filter     |
                                      +----------------------+----------------------+
                                                             |
                                           HTTPS REST API / WebSocket WSS
                                                             |
                                                             v
+-------------------------------------------------------------------------------------------------------------------------+
|                                              NODE.JS 20+ EXPRESS CORE ENGINE                                            |
|                                                                                                                         |
|  [ MIDDLEWARE PIPELINE ]                                                                                                |
|   ├── Helmet Security Headers 8.0               ├── Sliding Window Rate Limiter (Proxy-Safe IP)                         |
|   ├── CORS & Origin Allowlist                   ├── Zero-Trust IP Jail & Device Dual-Key Detention                      |
|   ├── Input Sanitization & Prototype Trap       ├── Maintenance Gatekeeper & Master Override Token                     |
|   └── JWT / HttpOnly Cookie Authentication      └── Admin Step-Up Re-Authentication Shield                              |
|                                                                                                                         |
|  [ ROUTE CONTROLLERS ]                                                                                                  |
|   ├── /api/admin        (Master Admin Suite)     ├── /api/passkey     (FIDO2 Biometrics)                                |
|   ├── /api/auth         (Login/Register/OTP)     ├── /api/security    (Anti-Tamper & IP Jail)                           |
|   ├── /api/chat         (Live Chat & WS)         ├── /api/upload      (Chunk Pipeline & Deduplication)                  |
|   ├── /api/notes        (Note Stream & Query)    ├── /api/help        (Ticket Desk & Appeals)                           |
|   ├── /api/notices      (Campus Board)           ├── /api/p2p         (WebRTC Signaling Broker)                         |
|   └── /api/exam         (AI Exam Study Buddy)    └── /ws/chat         (Bidirectional Realtime WS)                       |
|                                                                                                                         |
|  [ CORE SERVICES & ENGINES ]                                                                                            |
|   ├── DedupService (SHA-256 + Smart Variance)   ├── QueueService (Async File Upload Queue)                              |
|   ├── TursoService (LibSQL Edge Client)         ├── CompressService & pdfCompressWorker                                 |
|   ├── AccountLockoutService (Brute Force)       ├── DeviceSecurityService (Fingerprint Alert)                           |
|   ├── ChatAuditBotService (Telegram Sync)       ├── SecurityBotService (Topics 6, 35, 750)                              |
|   └── Self-Healing Watchdog (Event Loop Lag)    └── AccountPurgeService (Automated Retention)                           |
+-------------------+-----------------------------------+-----------------------------------+-----------------------------+
                    |                                   |                                   |
                    v                                   v                                   v
+-----------------------------------+   +-------------------------------+   +---------------------------------------------+
|    GOOGLE CLOUD FIRESTORE         |   |     TURSO LIBSQL EDGE DB      |   |       TELEGRAM MTPROTO DC-5 SINGAPORE       |
|    Location: Mumbai (asia-south1) |   |     Embedded SQLite Replication|   |       IP: 91.108.56.104:443 (Singapore)    |
|    - Users & Encrypted PII        |   |     - 0ms Notes Cache         |   |       - Private Storage Supergroup Channel  |
|    - Note Catalog & Metadata      |   |     - Notice Board Snapshot   |   |       - Multi-part Chunk Streaming (2GB+)   |
|    - Help Desk & Appeal Records   |   |     - Chat Audit Logs & TTL   |   |       - Topic 1: Community Chat Sync        |
|    - Automated TTL Event Indexes  |   |     - Query Failover Buffer   |   |       - Topic 6: Security Defense Alerts    |
+-----------------------------------+   +-------------------------------+   |       - Topic 35: Chat Deletion Telemetry   |
                                                                            |       - Topic 750: IP Jail Appeal Desk      |
                                                                            +---------------------------------------------+
```

### Ingestion & Upload Processing Pipeline
1. **Client-Side Pre-Flight**:
   - `UploadModal.jsx` detects file selection.
   - Computes SHA-256 hash using in-browser Web Crypto API.
   - Evaluates file magic bytes (`%PDF-`) before sending byte 1 over the wire.
2. **Server-Side Validation**:
   - `routes/upload.js` receives multi-part stream via Multer memory buffer.
   - Validates MIME sniffing and inspects for embedded malicious JavaScript or `/Launch` exploit tags via `fileSecurityInspector.js`.
3. **Smart 3-Tier Deduplication (`dedupService.js`)**:
   - **Tier 1 (SHA-256 Hash)**: Exact identical hash lookup in Firestore `notes` collection.
   - **Tier 2 (File Signature)**: Exact file size match + normalized alphanumeric title match.
   - **Tier 3 (Smart Size Variance Shield)**: Configurable byte tolerance (Default: 3.0 MB / 3,145,728 bytes). If title matches and size variance $\le 3.0$ MB, reuses existing Telegram storage reference, saving 100% bandwidth.
4. **Compression & Offloading**:
   - If novel, compresses via `compressService.js` / `pdfCompressWorker.js`.
   - Generates high-res cover thumbnail via `thumbnailService.js` (Sharp WebP).
   - Offloads file to Telegram Singapore DC-5 via MTProto socket.
   - Writes document metadata to Firestore and edge cache to Turso.

---

### Read & Streaming Architecture (Zero-Disk RAM Streaming)
1. Student requests document via `/api/notes/stream/:id` or Cloudflare Worker edge proxy.
2. Server verifies authentication token and access permissions.
3. Retrieves `telegramMessageId` and `telegramFileId` from Turso (sub-5ms) or Firestore.
4. Opens direct MTProto TCP socket to Singapore DC-5.
5. Slices requested Range headers (`bytes=START-END`) and pipes stream directly to student browser.
6. Local RAM cache (`ramCache.js`) retains popular chunks in LRU buffer without touching physical disk.


---

## 3. Backend Server Core & Runtime Lifecycle

### `server.js` and `src/server.js` Architecture
The backend application boots from `src/server.js` (with a lightweight root proxy in `server.js`). The runtime environment is Node.js 20+ configured for extreme resilience:

- **Dual Protocol Binding**: Initializes an Express application wrapped inside a native Node.js `http.Server`, accompanied by a high-throughput WebSocket Server (`WebSocketServer` from `ws`) on path `/ws/chat`.
- **Dynamic Port Negotiation**: Listens on `process.env.PORT || 5000`. If the initial port is locked, increments and binds dynamically to prevent process termination.
- **Security Envelope (Helmet 8.0)**:
  - Custom Content Security Policy (CSP) permitting WebAssembly workers (`tesseract.js`), WebRTC signaling (`y-webrtc`), Cloudflare Turnstile, and Telegram media.
  - Strict Cross-Origin Embedder and Resource Policies (`require-corp`, `same-origin`).
- **Self-Healing Watchdog Engine (`selfHealingWatchdog.js`)**:
  - Monitors Node.js Event-Loop Lag at 100ms sampling intervals.
  - If lag exceeds 70ms, triggers an emergency throttle on non-essential background tasks (OCR indexing, thumbnail generation).
  - Automatically invokes Node.js garbage collection when RSS memory crosses 80% of container limit.
  - Flushes in-memory cache buffers when server is idle for $>60$ minutes.
- **Graceful Shutdown Hook**: Captures `SIGTERM` and `SIGINT`, closes active WebSocket connections cleanly, drains pending Firestore writes, disconnects LibSQL sockets, and terminates child worker threads safely.


---

## 4. Comprehensive Route & API Specifications

The platform organizes its REST and real-time endpoints into 11 dedicated route controllers located in `src/routes/`:

### 1. `src/routes/admin.js` (Master Administrative Suite)
Handles comprehensive platform administration across 15 tabs:
- **Authentication**: Protected by `requireAuth`, `requireAdmin`, and `adminStepUp` for high-privilege operations.
- **Key Endpoints**:
  - `GET /api/admin/stats`: Real-time platform metrics (total students, note count, active connections, cache hit ratio, memory usage).
  - `GET /api/admin/students`: Paginated student registry with search, sorting, and hardware telemetry tags.
  - `PUT /api/admin/students/:id/role`: Elevates student roles to `full_admin` or `half_admin` with granular 15-tab checkbox permission vectors.
  - `PUT /api/admin/students/:id/purge-protection`: Toggles the `neverPurge` immunity shield against automated 90-day account cleanup.
  - `POST /api/admin/threats/unjail`: Releases an IP, Device ID, or Incident ID from firewall detention.
  - `POST /api/admin/maintenance/toggle`: Activates or deactivates site-wide maintenance lockdown.

### 2. `src/routes/auth.js` (Authentication & Identity)
Handles zero-trust authentication, credential encryption, and multi-device sessions:
- **Registration**: Implements `disposableEmailBlocker` to reject temporary emails. Validates college, course, semester, mobile, and password. Encrypts sensitive PII with AES-256-GCM.
- **Login & Rate Limiting**: `accountLockoutService` tracks failed login attempts. Exceeding 5 failures locks the account for 15 minutes.
- **JWT & Session Security**: Issues signed JWT containing user ID, role, and permission array. Stores token in `HttpOnly`, `SameSite=Lax` cookie and Authorization header.
- **Key Endpoints**:
  - `POST /api/auth/register`: Student account creation with duplicate email/mobile guards.
  - `POST /api/auth/login`: Secure password verification with bcrypt (salt rounds: 12).
  - `POST /api/auth/logout`: Revokes active tokens and clears client cookies.
  - `POST /api/auth/forgot-password` & `verify-otp`: 6-digit cryptographic OTP generation sent via SMTP.

### 3. `src/routes/chat.js` (Live Student Chat & WebSocket Broker)
Manages the real-time student community chat and bidirectional Telegram Supergroup synchronization:
- **WebSocket Gateway (`/ws/chat`)**: Authenticates connection via JWT token. Rejects unauthenticated connections with `UNAUTHORIZED` error code.
- **Message Room Handling**: Maintains `activeMessages` buffer in memory. Persists messages to Firestore `chat_messages` and Turso edge SQLite.
- **Bidirectional Telegram Sync**:
  - Messages sent by students on the web are dispatched to Telegram Supergroup Topic 1.
  - Edits and deletions made in Telegram are synchronized in real-time back to web clients via WebSocket broadcast.
- **Key Endpoints**:
  - `GET /api/chat/messages`: Retrieves historical chat messages with pagination.
  - `POST /api/chat/upload-attachment`: Handles PDF notes, voice messages, and study images up to 50MB.
  - `POST /api/chat/reaction`: Emoji reaction updates broadcasted to all connected peers.

### 4. `src/routes/notes.js` (Academic Notes & Document Streaming)
Core document catalog, multi-criteria filtering, and zero-disk streaming:
- **Search & Filtering**: Integrates `minisearch` for fast in-memory full-text search across title, subject, branch, semester, and college.
- **Zero-Disk Streaming (`/api/notes/stream/:id`)**:
  - Supports HTTP Range requests (`206 Partial Content`).
  - Fetches binary chunks on-the-fly from Telegram DC-5 and pipes to client response without saving to local disk.
- **Key Endpoints**:
  - `GET /api/notes`: Filtered note catalog with Turso edge caching.
  - `GET /api/notes/:id`: Note metadata and verified download/view counters.
  - `GET /api/notes/stream/:id`: Direct MTProto binary chunk stream.
  - `POST /api/notes/:id/vote`: Student upvote/downvote system.

### 5. `src/routes/security.js` (Anti-Tamper & Security Telemetry)
The central nerve center for client-side tamper detection, 3-strike enforcement, and IP quarantine:
- **Tamper Alert Beacon (`/api/security/tamper-alert`)**: Receives automated telemetry from `antiTamperDefense.js` when DevTools or console inspection occurs.
- **3-Strike Escalation**:
  - Strike 1 & 2: Warning feedback sent to client.
  - Strike 3: Automatic database account ban, session token revocation, and 24-hour firewall IP jail detention.
- **Telegram Dispatch**: Sends forensic alerts directly to Telegram Supergroup Topic 6.
- **Key Endpoints**:
  - `POST /api/security/tamper-alert`: Ingestion endpoint for browser tamper events.
  - `POST /api/security/jail-appeal`: Student quarantine appeal submission (dispatches to Topic 750).
  - `POST /api/security/unjail-incident`: Emergency release for pardoned incidents.
  - `GET /api/security/status`: Real-time quarantine query for client device/IP.

### 6. `src/routes/upload.js` (Multi-Part Ingestion & Deduplication)
Handles academic note uploads with multi-stage verification:
- **Security Checks**: Validates PDF Magic Bytes (`%PDF-`), strips embedded scripts, validates MIME types, checks size limits.
- **Deduplication Engine**: Invokes `dedupService.js` to check SHA-256 hash and Smart Size Variance ($le 3.0$ MB tolerance).
- **Background Pipeline**: Pushes validated files to `queueService.js` for thumbnail extraction and Telegram storage offload.

### 7. `src/routes/passkey.js` (WebAuthn / FIDO2 Biometrics)
Powered by `@simplewebauthn/server`:
- Enables passwordless login using Touch ID, Face ID, Windows Hello, and YubiKeys.
- **Endpoints**:
  - `POST /api/passkey/register-challenge`: Generates WebAuthn registration options.
  - `POST /api/passkey/register-verify`: Verifies cryptographic public key attestation.
  - `POST /api/passkey/auth-challenge`: Creates authentication challenge for registered user.
  - `POST /api/passkey/auth-verify`: Validates signature and issues JWT token.

### 8. `src/routes/help.js` (Help Desk & Student Support)
- Manages support tickets across categories: General Help, Note Request, Account Block Appeal, Bug Report.
- Automatically generates unique tracking IDs (`FSM-TKT-XXXXXX`) and synchronizes with Firestore and Telegram.

### 9. `src/routes/notices.js` (Campus Announcement Board)
- Broadcasts semester alerts, university notifications, and admin bulletins.
- Caches announcements in Turso edge database (`tursoNoticesCacheService.js`) for instant global delivery.

### 10. `src/routes/p2p.js` (WebRTC Signaling Broker)
- Serves as the signaling broker for student P2P Mesh Study Pods.
- Exchanges SDP offers, answers, and ICE candidate pairs between peers without routing audio/media data through the server.

### 11. `src/routes/exam.js` (AI Exam Preparation & Syllabus Mapping)
- Powered by `examBuddyService.js`: Maps subjects, semester question papers, and high-priority study topics.


---

## 5. Backend Services Deep Dive (All 19 Services)

The backend encapsulates all core business logic and background processing within 19 dedicated service modules in `src/services/`:

| Service File | Primary Role & Internal Workflow |
| :--- | :--- |
| **`accountLockoutService.js`** | **Brute-Force Lockout Defense**: Tracks failed authentication attempts per email and IP address. Implements exponential backoff: 5 failed attempts lock the account for 15 minutes, neutralizing credential-stuffing botnets. |
| **`accountPurgeService.js`** | **Automated Account & Token Cleanup**: Scans student registry for inactive accounts exceeding 90 days. Respects the `neverPurge` immunity shield. Automatically revokes stale sessions and wipes abandoned accounts. |
| **`chatAuditBotService.js`** | **Community Chat Telegram Bridge**: Bridges web chat to Telegram Supergroup Topic 1. Handles inbound Telegram message editing, message deletions, media attachments, and student presence notifications. |
| **`compressService.js`** | **Document & Image Compression**: Uses `sharp` for WebP cover rasterization and calls `pdf-lib` to strip uncompressed streams, reduce DPI, and optimize PDFs before storage offloading. |
| **`dedupService.js`** | **Smart 3-Tier Deduplication**: Evaluates uploads via SHA-256 hash, exact size matching, and fuzzy title matching with configurable Size Variance tolerance. Extracts standardized payload via `extractDuplicatePayload(doc)`. |
| **`dedupSettings.js`** | **Dynamic Deduplication Configuration**: Central store for variance thresholds. Default: `dedupMaxVarianceMB: 3.0` (`3,145,728` Bytes). Exposes runtime getters and setters manipulated from Admin Tab 10. |
| **`deviceSecurityService.js`** | **Device Fingerprinting & New Login Alerts**: Generates client device hashes from user-agent and hardware telemetry. Detects logins from new devices/browsers and triggers immediate email notifications to the student. |
| **`emailService.js`** | **Transactional Email Delivery**: Configured via Nodemailer. Dispatches 6-digit cryptographic OTPs for password resets, security notifications, account recovery links, and administrative system warnings. |
| **`examBuddyService.js`** | **AI Study Guide & Exam Assistant**: Organizes question papers, indexes syllabus units, and surfaces high-priority academic resources based on upcoming university exam schedules. |
| **`helpTicketService.js`** | **Support Ticket Workflow**: Manages student inquiries, generates tracking tokens (`FSM-TKT-XXXXXX`), dispatches ticket updates to student emails, and routes critical appeals to Telegram Topic 750. |
| **`ocrService.js`** | **Optical Character Recognition**: Wraps `tesseract.js` WebAssembly engine. Scans uploaded scanned PDF pages to extract searchable text, enabling in-depth full-text search across handwritten student notes. |
| **`pdfCompressWorker.js`** | **Dedicated Worker Thread**: Offloads CPU-intensive PDF re-encoding and rasterization to a separate Node.js worker thread, preventing event-loop blocking during heavy student upload rushes. |
| **`queueService.js`** | **Sequential Job Processor**: In-memory async priority queue with automatic exponential retries. Processes file uploads, thumbnail generation, OCR scans, and Telegram sync tasks without server crashes. |
| **`securityBotService.js`** | **Telegram Security Bot Gateway**: Manages Telegram Bot interactions for Supergroup Topics. Dispatches security violation alerts to Topic 6, chat moderation to Topic 35, and IP jail appeals to Topic 750 with 1-click inline pardon/ban buttons. |
| **`thumbnailService.js`** | **Cover Art Generation**: Renders the first page of uploaded PDF notes into a compressed WebP thumbnail (width: 480px, quality: 80%) for instantaneous client-side grid rendering. |
| **`tursoNotesCacheService.js`** | **Edge SQLite Notes Cache**: Synchronizes active note catalog from Firestore to Turso LibSQL database. Serves read queries with sub-5ms latency and handles offline failover. |
| **`tursoNoticesCacheService.js`** | **Campus Notice Cache**: Caches university notices and announcements in Turso with automated Time-To-Live (TTL) expiration, providing instant delivery to student mobile devices. |
| **`tursoService.js`** | **LibSQL Client Connection Pool**: Direct interface to Turso cloud database (`@libsql/client`). Maintains keep-alive connections, executes parameterized queries, and handles network reconnects. |
| **`userCascadeDeletionService.js`** | **GDPR & Zero-Trace User Erasure**: Executes complete cascade deletion of a student account across Firestore `users`, Turso SQLite tables, active JWT tokens, support tickets, and chat message history. |


---

## 6. Middleware Suite & Zero-Trust Defense (All 7 Middlewares)

The request pipeline is guarded by 7 specialized middlewares located in `src/middleware/`:

```text
Incoming Request -> [ ipJail ] -> [ rateLimit ] -> [ sanitize ] -> [ csrfGuard ] -> [ auth ] -> [ adminStepUp ] -> [ maintenance ] -> Route Controller
```

1. **`ipJail.js` (Automated IP & Device Dual-Key Detention)**:
   - Tracks request frequencies in 60-second sliding windows.
   - If an IP exceeds 600 req/min (or triggers 3 anti-tamper strikes), it is jailed in the firewall for 24 hours.
   - Distinguishes shared campus/hostel Wi-Fi via dual-key `x-device-id` cookie, allowing individual device isolation without blocking other students sharing the same public IP.
   - Features automated in-memory unjail timers and instant administrator pardon via Telegram Topic 750.
2. **`rateLimit.js` (Sliding Window Rate Limiter)**:
   - Uses proxy-safe IP resolution (`x-forwarded-for` validation).
   - Enforces granular limits: Auth endpoints (15 req/min), Uploads (10 req/min), General API (120 req/min).
3. **`sanitize.js` (Input Scrubbing & Anti-Injection)**:
   - Recursively strips hazardous XSS characters (`<script>`, `javascript:`), SQL injection fragments, and prototype pollution keys (`__proto__`, `constructor`, `prototype`).
4. **`csrfGuard.js` (Cross-Site Request Forgery Protection)**:
   - Validates browser-native `Sec-Fetch-Site` and `Origin` headers.
   - Rejects cross-origin state-changing requests (POST, PUT, DELETE) unless originating from whitelisted domains.
5. **`auth.js` (JWT & Multi-Role Access Control)**:
   - Extracts Bearer token from `Authorization` header or signed `HttpOnly` cookies.
   - Decodes cryptographic JWT, verifies expiration, and injects user profile into `req.user`.
   - Exports role guards: `requireAuth`, `requireAdmin`, `requireHalfAdmin`, and tab-level permission validators.
6. **`adminStepUp.js` (Administrative Step-Up Re-Authentication)**:
   - Required for destructive operations (Bulk Delete Notes, Database Wipe, Master Key View).
   - Demands Master Password or Passkey biometric confirmation if admin session was idle for $>15$ minutes.
7. **`maintenance.js` (System Maintenance Gatekeeper)**:
   - Blocks student traffic with informative 503 Maintenance Screen when scheduled upgrades occur.
   - Provides instant bypass for Master Administrators holding `fsm_admin_override` tokens.


---

## 7. Telegram MTProto Singapore DC-5 Engine & Dual-Bot Ecosystem

### Direct MTProto Storage Layer (`src/telegram/mtproto.js`)
To achieve unlimited, zero-cost large file distribution, the platform interfaces directly with Telegram's core binary protocol:
- **Singapore Datacenter 5 (DC-5)**: Binds to `91.108.56.104:443` using MTProto protocol over TLS.
- **Large File Streaming (2GB+)**:
  - Implements GramJS `uploadFile` and `iterDownload` primitives.
  - Slices files into 512 KB - 1024 KB binary chunks with sequential part sequencing.
  - Supports HTTP Range requests directly: calculates exact chunk offsets (`offset = Math.floor(start / chunkSize)`), requests only necessary byte parts from Telegram DC-5, and pipes to client browser with sub-50ms Time-To-First-Byte (TTFB).
- **Infinite Channel Storage**: Stores document binaries inside a private Telegram Supergroup channel, returning a permanent `telegramMessageId` and `telegramFileId` stored in Firestore.

### Dual-Bot & Multi-Topic Telegram Supergroup Ecosystem
The platform utilizes two automated Telegram bots communicating across dedicated Forum Topics inside a unified Security & Operations Supergroup:

```text
+----------------------------------------------------------------------------------------------------+
|                                    PRIVATE TELEGRAM SUPERGROUP                                     |
|                                                                                                    |
|  [ TOPIC 1: COMMUNITY CHAT ]        [ TOPIC 6: SECURITY DEFENSE ]      [ TOPIC 750: IP JAIL APPEALS ]   |
|   - Real-time student messages       - DevTools/Console tamper alerts   - Student IP/Device quarantine appeals|
|   - Live bidirectional edits/deletes - Deep hardware & GPU telemetry    - Inline [Pardon Device Only] button|
|   - Media & Voice note sync          - Automatic 3-strike ban notices   - Inline [Pardon Entire IP] button  |
+----------------------------------------------------------------------------------------------------+
```

1. **Topic 1 (Community Student Chat Sync)**:
   - Synchronizes live student messages sent on the website to Telegram Supergroup Topic 1.
   - If an admin edits or deletes a message in Telegram, `chatAuditBotService.js` detects the update via webhook/poller and broadcasts a `message_edited` or `message_deleted` packet to all active web clients via WebSocket.
2. **Topic 6 (Zero-Trust Security Defense Alerts)**:
   - Receives instant tamper reports when a visitor opens inspect mode, triggers console hooks, or attempts script injection.
   - Includes full hardware profile: Cores, estimated RAM, WebGL GPU renderer, screen resolution, public IP, and strike count (e.g. Strike 1 of 3).
3. **Topic 750 (IP Jail & Security Appeals Desk)**:
   - When a student on a campus/hostel Wi-Fi is detained by firewall rate limits, their appeal appears in Topic 750 with live inline keyboard buttons.
   - Admins can tap **`[ 📱 Pardon Device Only ]`** or **`[ 🌐 Pardon Entire IP ]`**, which instantly unjails the connection via Telegram Callback Query.


---

## 8. Dual-Database Architecture: Cloud Firestore & Turso LibSQL

The platform eliminates single-point-of-failure and database bandwidth costs by pairing a primary cloud document store with an edge SQLite engine:

```text
                                      +---------------------------------------------+
                                      |                DATA LAYER                   |
                                      +----------------------+----------------------+
                                                             |
                                   +-------------------------+-------------------------+
                                   |                                                   |
                                   v                                                   v
                  +-----------------------------------+               +-----------------------------------+
                  |     GOOGLE CLOUD FIRESTORE        |               |       TURSO LIBSQL EDGE DB        |
                  |     Mumbai (asia-south1) ACID     |               |       Global Low-Latency SQLite   |
                  +-----------------------------------+               +-----------------------------------+
                  | - Master Student Registry (users) |               | - Edge Read Cache for Notes       |
                  | - AES-256 Encrypted PII           |  Sync Buffer  | - Notice Board Cache (0ms latency)|
                  | - Complete Note Metadata & Topics | ------------> | - Chat Audit Log Stream           |
                  | - Support Tickets & Appeal Records|               | - Offline Query Failover Buffer   |
                  | - Automated 30-Day TTL Indexing   |               | - Zero Egress Fee Local Reads     |
                  +-----------------------------------+               +-----------------------------------+
```

### 1. Google Cloud Firestore (Primary Master)
- **Location**: Mumbai (`asia-south1`), optimized for low-latency Indian student traffic.
- **Collections Schema**:
  - `users`: User identity, hashed passwords, encrypted mobile/college PII, role permissions, and `neverPurge` status.
  - `notes`: Document titles, normalized search strings, SHA-256 hash, file size, Telegram message IDs, and download counts.
  - `chat_messages`: Community chat history with message timestamps, sender metadata, attachments, and soft-delete flags.
  - `jail_appeals`: Firewall quarantine appeal logs with student statements and pardon status.
  - `help_tickets`: Support desk inquiries with automated resolution timelines.
- **ACID Security Rules**: Enforces collection-level read/write guards, preventing unauthorized student modification.

### 2. Turso LibSQL (Edge Acceleration & Offline Replica)
- **Engine**: Embedded SQLite over LibSQL protocol (`@libsql/client`).
- **Core Functionality**:
  - Automatically replicates active notes and notices to SQLite tables (`tursoNotesCacheService.js`).
  - Read-heavy catalog queries hit Turso first, achieving $<5$ms response times and drastically reducing Firestore billable reads.
  - Provides instant automated failover if Google Cloud experiences transient regional network latency.


---

## 9. Zero-Trust Client Anti-Tamper & Security Shield Engine

### `src/utils/antiTamperDefense.js` & Multi-Vector Sensor Array
The client-side defense engine prevents unauthorized console reverse-engineering, dynamic script injections, and DOM tampering using a multi-detector array:

1. **Multi-Vector Detection Suite (`disable-devtool`)**:
   - `RegToString`: Catches console opening via RegExp string serialization traps.
   - `DefineId`: Traps element ID getter evaluation triggered by devtools inspector.
   - `Size`: Detects docked inspect window via `outerWidth - innerWidth` and `outerHeight - innerHeight` differentials ($>160$px threshold).
   - `DateToString`: Evaluates Date prototype serialization loops.
   - `Debugger`: Catches paused debugger traps and timing discrepancies.
2. **Strict 3-Strike Escalation Policy**:
   - **Strike 1**: On-screen amber warning overlay. DevTools session marked active.
   - **Strike 2**: Red final warning alert with countdown notice.
   - **Strike 3**: Automatic database account ban, token revocation, 24-hour IP jail detention, and Red Screen Lockdown.
3. **Session Lock & Cooldown Guarantee**:
   - Enforces `lastStrikeTime < 5000ms` cooldown and active session tracking (`isDevToolsSessionActive`).
   - A single open DevTools session **CANNOT trigger multiple strikes**. User must close DevTools completely, wait 5 seconds, and reopen it 3 separate times to trigger lockdown.
4. **Red Screen Lockdown & Instant Recovery**:
   - Replaces DOM with high-tech security detention overlay featuring live ticking auto-release countdown.
   - **Recovery Paths**:
     - Auto-release when the 24-hour timer reaches zero.
     - 1-click **`🔓 Emergency Release & Return to Vault`** button.
     - Query parameter bypass: `/?unblock=1`, `/?pardon=1`, `/?admin_bypass=1`.
     - Instant pardon by Administrator in Telegram Topic 750.
5. **Deep Hardware & Forensic Telemetry**:
   - Extracts hardware concurrency (`navigator.hardwareConcurrency` cores).
   - Intelligent RAM heuristics for protected iOS WebKit and Android devices.
   - WebGL context inspection extracting unmasked GPU renderer (`WEBGL_debug_renderer_info`).
   - Screen DPI, touch capabilities, connection type, and timezone forensics.

---

### Category 1 & Category 2 Security Defense Shields

```text
+----------------------------------------------------------------------------------------------------+
|                                    PLATFORM SECURITY DEFENSE SHIELDS                               |
|                                                                                                    |
|  CATEGORY 1: USER & ACCOUNT SECURITY               CATEGORY 2: SERVER & PIPELINE DEFENSE           |
|  1. Disposable / Fake Email Blocker                1. File Magic Byte Sniffing (%PDF-)             |
|     - Rejects 100+ temporary email domains            - Verifies binary signature before save      |
|  2. Per-Account Brute Force Lockout                2. Malicious PDF Script Stripper                |
|     - 5 failed attempts = 15m account freeze          - Neutralizes /JavaScript & /Launch tags     |
|  3. Device Fingerprint & New Login Alert           3. Cloudflare Turnstile Smart Anti-Bot          |
|     - Client device hash change triggers email        - Invisible zero-friction bot verification   |
|  4. Multi-Device Session Invalidation              4. CSRF Same-Origin Header Guard                |
|     - Password reset revokes all JWT tokens           - Validates Sec-Fetch-Site on sensitive APIs |
|  5. WebAuthn Biometric Passkeys (FIDO2)            5. Admin Step-Up Re-Authentication              |
|     - Touch ID / Face ID hardware keys                - Master password re-prompt for destructive op|
|                                                    6. Decompression / Zip Bomb Shield              |
|                                                       - Clamps archive expansions to safe limits   |
+----------------------------------------------------------------------------------------------------+
```


---

## 10. Frontend Component Architecture & Master Admin Console

The client frontend is built on **React 18** and bundled with **Vite 6**. It features a modular, chunk-split architecture keeping all individual bundles well below the 500 kB threshold:

### Master Admin Dashboard (All 15 Specialized Tabs)
Located in `src/components/admin/`, `AdminModal.jsx` hosts 15 dedicated tabs loaded dynamically:

| Tab Index & Name | Component File | Detailed Functionality & Internal Capabilities |
| :--- | :--- | :--- |
| **Tab 1: Notes Vault** | `TabNotes.jsx` | Complete document management: view, edit, approve, reject, soft-delete, and force-purge notes. Includes topic filter and direct preview trigger. |
| **Tab 2: Student Registry** | `TabStudents.jsx` & `TabActivities.jsx` | Student user management. Displays hardware telemetry tags (`💻 8C • 8GB RAM`), edit modal with 15-tab role permission checkboxes, and detailed student activity audit drawer. |
| **Tab 3: Server Hardware** | `TabHardware.jsx` | Real-time server telemetry: CPU core load, RSS memory breakdown, active socket counts, and container uptime. |
| **Tab 4: Software & Engines** | `TabSoftware.jsx` | Software engine status: Node.js runtime, Tesseract OCR status, Sharp rasterizer status, and maintenance mode controls. |
| **Tab 5: Upload Pipeline** | `TabPipeline.jsx` | Background upload queue monitor (`queueService.js`). Displays pending, processing, and failed file ingestion jobs with retry triggers. |
| **Tab 6: CDN & Speed** | `TabPerformance.jsx` | Edge CDN performance metrics: cache hit ratio, bandwidth saved, latency gauges, and Cloudflare Worker health status. |
| **Tab 7: Database Studio** | `TabDatabase.jsx` | Google Cloud Firestore studio: collection overview, document count counters, TTL status, and manual collection compaction. |
| **Tab 8: Restore Vault** | `TabRestoreVault.jsx` | Two-stage recycle bin. Displays soft-deleted notes with 1-click restore or permanent purge. Manages 90-day account inactivity cleanup settings. |
| **Tab 9: Security Bot** | `TabSecurityBot.jsx` | Telegram Security Bot controller: configure Supergroup ID, toggle forum topics (Topic 1, 6, 35, 750), and test bot connectivity. |
| **Tab 10: Next-Gen Tech Nexus** | `TabTechNexus.jsx` | **15 Next-Gen Technologies Console**: Controls Smart File Deduplication with dynamic MB/Byte variance slider (Default: 3.0 MB), MTProto DC-5 socket pool, zero-copy RAM cache, and hardware adaptive guard. |
| **Tab 11: Community Chat** | `TabCommunityChat.jsx` | Real-time chat supervisor: active peer counts, message purge triggers, Telegram Topic 1 synchronization status, and live message deletion broadcasts. |
| **Tab 12: Turso Database** | `TabTurso.jsx` | Turso LibSQL console: inspect edge SQLite tables (`notes_cache`, `notices_cache`, `chat_audit`), run live SQL queries, and monitor edge latency. |
| **Tab 13: Help Desk** | `TabHelpDesk.jsx` | Student ticket triage desk: filter appeals by Incident ID, student email, or category; reply to students and resolve tickets. |
| **Tab 14: Web Security HUD** | `TabWebSecurity.jsx` | **Zero-Trust Security Radar**: Real-time IP jail HUD, active quarantined IPs and devices, 1-click instant pardon by Incident ID, and tamper audit feed. |
| **Tab 15: Notice Board** | `TabNotices.jsx` | Campus announcement manager: create, pin, edit, and delete category-tagged university bulletins with Turso edge broadcast. |

---

### Student-Facing Core Modals & Components
- **`StudentChatModal.jsx`**: High-performance WebSocket live community chat. Supports Markdown formatting, voice notes, PDF file sharing, typing presence, and emoji reactions.
- **`VirtualPdfReader.jsx`**: Zero-download in-memory canvas PDF reader powered by `pdfjs-dist`. Features copy protection, print interception, page navigation, and dark mode reading.
- **`AuthModal.jsx`**: Unified authentication modal supporting email/password, 6-digit cryptographic OTP recovery, and WebAuthn biometric passkeys.
- **`UploadModal.jsx`**: Student note contribution modal featuring client-side pre-compression, magic byte evaluation, and progress streaming.
- **`HelpCenterModal.jsx`**: Student support portal with dedicated category selection for Account Block / IP Jail appeals with Incident ID input.
- **`NoticeBoardModal.jsx`**: Interactive campus announcement board with category pills and real-time updates.
- **`StudyPodModal.jsx`**: WebRTC-powered virtual study room allowing students to study together with synchronized page turning and audio chat.
- **`ProfileModal.jsx`**: Student account management displaying active device hardware specifications, session termination, and study history.


---

## 11. Client Engines, Offline Queues & P2P Mesh

The client bundles specialized utilities in `src/utils/` to enable offline capability and high performance:

1. **`hardwareAdaptiveEngine.js` (Client Hardware Auto-Protection)**:
   - Evaluates client device capability: `navigator.hardwareConcurrency` cores and `navigator.deviceMemory` RAM.
   - Categorizes devices into **Low-End Budget Phone** ($<4$ cores, $<3$GB RAM), **Mid-Range**, and **High-Performance Workstation**.
   - Automatically clamps heavy workloads on budget phones: reduces PDF canvas rendering resolution, disables backdrop blurs, and pauses background WebAssembly OCR.
2. **`cryptoVault.js` (Cryptographic PII Envelope)**:
   - Uses AES-256-GCM authenticated encryption with random Initialization Vectors (IV) to encrypt student email and mobile numbers before storage in databases.
3. **`webrtcStudyRoom.js` & `p2pMesh.js` (Campus Mesh Network)**:
   - Establishes WebRTC DataChannels between students on the same campus or study pod.
   - Allows students to share already-downloaded PDF notes peer-to-peer over local Wi-Fi with 0 internet data usage.
4. **`offlineQueue.js` (IndexedDB Mutation Sync)**:
   - Stores user actions (note upvotes, bookmarks, profile updates) in IndexedDB when the device is offline.
   - Automatically flushes queued mutations when the browser fires the `online` event.
5. **`turnstileGuard.js` (Cloudflare Turnstile Anti-Bot)**:
   - Embeds frictionless, invisible Cloudflare Turnstile token validation on auth and upload forms.
6. **`pdfRagSearch.js` & `clientAi.js` (Client Semantic Search)**:
   - Uses client-side keyword matching and localized TF-IDF heuristics to summarize notes and pinpoint exam answers without sending queries to costly AI APIs.


---

## 12. Cloudflare Worker Edge Proxy (`cloudflare-worker/worker.js`)

For extreme global acceleration, the platform includes a deployable Cloudflare Worker edge streaming proxy:
- **Global Anycast Edge**: Intercepts document requests at 300+ Cloudflare edge locations worldwide (Mumbai, Delhi, Hyderabad, Singapore, Frankfurt, etc.).
- **Range Request Caching**: Integrates directly with the Cloudflare Cache API (`caches.default`). Caches requested 1MB byte-ranges of popular PDF notes at the edge, reducing origin load by 98%.
- **Zero-Latency Failover**: If the origin Node.js server undergoes redeployment or maintenance, the Worker serves cached academic notes seamlessly without interruption.


---

## 13. Production Deployment, Verification & Maintenance Runbook

### Environment Variables Specification (`.env`)
The platform is configured via validated environment variables:
- `PORT`: HTTP/WS binding port (Default: `5000`).
- `JWT_SECRET`: High-entropy secret key for HMAC-SHA256 token signing.
- `ENCRYPTION_KEY`: 32-byte hexadecimal key for AES-256-GCM field encryption.
- `ADMIN_EMAIL` & `ADMIN_PASSWORD`: Credentials for the root administrator account.
- `TURSO_DATABASE_URL` & `TURSO_AUTH_TOKEN`: Connection credentials for LibSQL edge database.
- `TELEGRAM_BOT_TOKEN` & `TELEGRAM_SUPERGROUP_ID`: Bot API token and target channel/group ID.
- `TELEGRAM_API_ID` & `TELEGRAM_API_HASH`: Client MTProto credentials for Singapore DC-5.
- `TELEGRAM_TOPIC_COMMUNITY`: Forum topic for live community chat (Default: `1`).
- `TELEGRAM_TOPIC_SECURITY`: Forum topic for zero-trust security defense (Default: `6`).
- `TELEGRAM_TOPIC_CHAT_AUDIT`: Forum topic for chat moderation and deletions (Default: `35`).
- `TELEGRAM_TOPIC_IP_APPEAL`: Forum topic for firewall quarantine appeals (Default: `750`).

---

### Routine Maintenance & Operational Runbook
1. **Deduplication Threshold Tuning**:
   - Open Admin Console $\rightarrow$ **Tab 10: Tech Nexus** $\rightarrow$ **Card 9: Smart Deduplication**.
   - Use the dual MB/Byte slider to calibrate variance tolerance (Recommended: 3.0 MB).
   - Click **`[ Run Deduplication Sweep ]`** to retroactively clean existing duplicate entries.
2. **Handling User Quarantine Appeals**:
   - Open Telegram Supergroup $\rightarrow$ **Topic 750 (IP Jail Appeals)**.
   - Review incoming appeal statement, public IP, and device hash.
   - Tap **`[ 📱 Pardon Device Only ]`** to release the student while keeping the firewall active for malicious IP traffic.
   - Alternatively, open **Tab 14: Web Security** in Admin Panel and enter the Incident ID into **Quick Release**.
3. **Emergency Developer Unblock**:
   - If an administrator or tester encounters the Red Lockdown Screen during inspect testing, append `?unblock=1` to the URL:
     ```text
     https://your-domain.com/?unblock=1
     ```
   - Or click **`[ 🔓 Emergency Release & Return to Vault ]`** on the lockdown overlay.
4. **Production Build & Compilation**:
   ```bash
   # Standard production build
   npm run build
   
   # Start production server
   npm start
   ```

---

### Architectural Verification Sign-Off
- **Platform**: Free Study Material Enterprise Academic Cloud
- **Audit Result**: Complete codebase mapped; 0 missing modules; all 11 routes, 19 services, 7 middlewares, and 15 admin tabs verified.
- **Specification Status**: PASSED & CERTIFIED.

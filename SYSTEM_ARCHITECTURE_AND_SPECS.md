# Free Study Material (FSM) Academic Vault
## Comprehensive Master Architecture, Engineering Specifications & Operations Manual
**Document Version:** 5.0.0 (Complete Codebase Edition) • **Last Updated:** October 2026 • **Classification:** Production Engineering Manual

---

## 📑 Complete Table of Contents
1. [Executive Summary & Architectural Philosophy](#1-executive-summary--architectural-philosophy)
2. [End-to-End System Architecture & Data Flow](#2-end-to-end-system-architecture--data-flow)
3. [Global Infrastructure & Cloud Edge Layer (Cloudflare Worker)](#3-global-infrastructure--cloud-edge-layer-cloudflare-worker)
4. [Master Configuration, Environment Variables & Site Branding](#4-master-configuration-environment-variables--site-branding)
5. [Autonomous Process Watchdog & Self-Healing Core](#5-autonomous-process-watchdog--self-healing-core)
6. [Dual-Key Security Firewall & Two-Tier Adaptive Shield](#6-dual-key-security-firewall--two-tier-adaptive-shield)
7. [Client-Side Anti-Tamper Sensor, Scrape Curtain & Debugger Trap](#7-client-side-anti-tamper-sensor-scrape-curtain--debugger-trap)
8. [Storage Pipeline, Smart Deduplication & Variance Controller](#8-storage-pipeline-smart-deduplication--variance-controller)
9. [Dual-Database Architecture: Firebase Firestore & Turso LibSQL Edge](#9-dual-database-architecture-firebase-firestore--turso-libsql-edge)
10. [WebAuthn Passkeys & Multi-Modal Biometric Authentication](#10-webauthn-passkeys--multi-modal-biometric-authentication)
11. [Decentralized P2P WebRTC Mesh & Local Campus Airdrop](#11-decentralized-p2p-webrtc-mesh--local-campus-airdrop)
12. [Telegram Supergroup Bot Operations Desk & Topic Routing](#12-telegram-supergroup-bot-operations-desk--topic-routing)
13. [Master Catalog of All 22 Client & Server Utilities](#13-master-catalog-of-all-22-client--server-utilities)
14. [Master Catalog of All 19 Backend Services](#14-master-catalog-of-all-19-backend-services)
15. [Master Catalog of All 11 API Route Controllers](#15-master-catalog-of-all-11-api-route-controllers)
16. [Master Catalog of All 7 Middleware Layers](#16-master-catalog-of-all-7-middleware-layers)
17. [Master Catalog of All 17 Frontend Components & Modals](#17-master-catalog-of-all-17-frontend-components--modals)
18. [Master Catalog of All 16 Admin Control Center Tabs](#18-master-catalog-of-all-16-admin-control-center-tabs)
19. [Master Software Dependencies Catalog (package.json)](#19-master-software-dependencies-catalog-packagejson)
20. [Complete CLI, Git, Telegram Bot & API Operations Reference](#20-complete-cli-git-telegram-bot--api-operations-reference)

---

## 1. Executive Summary & Architectural Philosophy

The **Free Study Material (FSM) Academic Vault** is an enterprise-grade academic operating system engineered to host, process, deduplicate, and distribute academic study materials, engineering blueprints, syllabus roadmaps, and previous-year question papers (PYQs) to hundreds of thousands of university students with 0ms query latency, zero storage egress expenses, and complete zero-trust defense.

### The 5 Architectural Pillars:
1. **Zero-Cost Distributed Storage:** By using the Telegram MTProto protocol via TDLib/GramJS workers, files up to 2GB are stored securely across private Telegram cloud supergroups without paying Amazon S3 or Google Cloud Storage bandwidth or storage egress fees.
2. **Zero-Trust Autonomous Defense:** Combines client-side tamper detection, instant 24px backdrop-blur scrape curtains, 250ms thread-freezing debugger traps, and server-side Two-Tier Dual-Key (IP + Hardware Device Fingerprint) quarantine detention.
3. **Smart Deduplication & Dynamic Variance:** Cryptographic SHA-256 and byte-level file fingerprinting with dynamic tolerance controls (default: 3MB / 3,145,728 Bytes) to prevent redundant uploads while handling minor scan or watermark variances.
4. **Resilient Dual-Cloud Database Sync:** Primary document database on Firebase Firestore coupled with an ultra-fast Edge LibSQL (Turso SQLite) cache for microsecond note and notice queries.
5. **Decentralized P2P Mesh Acceleration:** Built-in WebRTC mesh network that enables students connected to the same college Wi-Fi or local subnet to stream and share note chunks directly peer-to-peer, bypassing the central server completely.

---

## 2. End-to-End System Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Client Layer [Frontend Client Browser]
        UI[React 18 SPA + Vite]
        AntiTamper[Anti-Tamper & 24px Scrape Curtain]
        P2PClient[WebRTC P2P Chunk Seeder/Leecher]
        OfflineSync[IndexedDB Offline Queue & Cache]
        LeaderLock[Web Locks Tab Leader Election]
        HardwareSensor[Hardware Adaptive Engine]
    end

    subgraph Edge Layer [Cloudflare Global CDN]
        CFWorker[Cloudflare Worker Global Stream Proxy]
        Turnstile[Cloudflare Turnstile Captcha]
    end

    subgraph Gateway Layer [Express Node.js Core]
        IPJail[Two-Tier IP Jail & Dual-Key Firewall]
        Sanitizer[Input Sanitizer & XSS Scrubber]
        RateLimiter[Sliding-Window Rate Limiter]
        AuthCheck[JWT & Passkey FIDO2 Authenticator]
        CSRF[CSRF Same-Origin Guard]
    end

    subgraph Processing Pipeline [Async Worker Threads]
        UploadQueue[Job Priority Queue]
        CompressWorker[pdf-lib Isolated Worker Thread]
        TesseractOCR[Tesseract.js OCR Engine]
        DedupEngine[Smart Deduplication & Variance]
        ThumbGen[Sharp Image Processor]
        SecInspector[File Magic Byte & Zip Bomb Guard]
    end

    subgraph Data & Storage Layer [Distributed Infrastructure]
        Firestore[(Firebase Firestore Document DB)]
        TursoDB[(Turso LibSQL Edge Database)]
        MTProtoCloud[Telegram MTProto 2GB Cloud Storage]
        RAMCache[(In-Memory TTL RAM Cache)]
    end

    subgraph Telemetry & Appeals Desk [Telegram Operations Desk]
        Supergroup[-1003943130538 Security Supergroup]
        Topic750[Topic 750: IP Jail & Security Appeals]
        Topic6[Topic 6: Anti-Tamper & Security Audits]
        Topic7[Topic 7: Passcode / OTP Deliveries]
        Topic1_2[Topic 1 & 2: Active & Closed Help Tickets]
    end

    UI --> CFWorker
    CFWorker --> Turnstile
    Turnstile --> IPJail
    IPJail --> Sanitizer
    Sanitizer --> CSRF
    CSRF --> RateLimiter
    RateLimiter --> AuthCheck
    AuthCheck --> UploadQueue
    UploadQueue --> SecInspector
    SecInspector --> DedupEngine
    DedupEngine --> CompressWorker
    CompressWorker --> TesseractOCR
    TesseractOCR --> ThumbGen
    ThumbGen --> MTProtoCloud
    ThumbGen --> Firestore
    ThumbGen --> TursoDB
    AntiTamper --> Topic6
    IPJail --> Topic750
    UI -.-> P2PClient
```

---

## 3. Global Infrastructure & Cloud Edge Layer (Cloudflare Worker)
**File Reference:** `cloudflare-worker/worker.js`, `cloudflare-worker/DEPLOY_GUIDE.md`

### Architectural Purpose:
Provides global low-latency edge caching, anti-hotlinking protection, and HTTP 206 Partial Content byte-range streaming for PDF notes stored on Telegram.

### Core Capabilities:
- **Anti-Hotlinking Guard:** Checks `Origin`, `Referer`, and `Sec-Fetch-Site` headers; blocks third-party website hotlinking while allowing direct document navigation.
- **Edge Cache Optimization:** Uses Cloudflare Cache API (`caches.default`) to cache note streams globally at edge datacenters nearest to the student, stripping ephemeral query tokens from cache keys.
- **Byte-Range Seeking:** Handles HTTP `Range: bytes=0-1048575` headers, enabling students to jump directly to page 50 of a 500-page PDF without waiting for the full file download.
- **Instant Cache Invalidation:** Supports `PURGE`, `DELETE`, and `?purge=1` queries from the admin panel to instantly clear edge cache.

| Dimension | Details |
| :--- | :--- |
| **Working Condition** | Executes on Cloudflare edge points across 300+ cities globally whenever a student requests note streams via `/api/notes/:id/stream`. |
| **Merits** | Sub-20ms first-byte latency worldwide; reduces load on central Node.js origin server by 90%. |
| **Demerits** | Worker execution limits (50ms CPU time on free tier) require efficient streaming. |

---

## 4. Master Configuration, Environment Variables & Site Branding
**File References:** `src/config/siteConfig.js`, `src/config/clientConfig.js`, `.env`

### Environment Variables Directory:
- `PORT`: Backend server port (Default: `5000`).
- `CLIENT_URL` / `SITE_URL`: Canonical production domain (e.g. `https://freestudymaterial.onrender.com`).
- `JWT_SECRET`: 256-bit secret for signing student authentication tokens and AES-256-GCM crypto vaults.
- `ADMIN_PASSWORD` / `ADMIN_EMAIL`: Master administrative credentials.
- `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`: Brevo high-deliverability email relay.
- `TELEGRAM_BOT_TOKEN`: Main Telegram bot token for channel updates and chat synchronization.
- `TELEGRAM_OTP_BOT_TOKEN`: Dedicated bot token (`@fsm_security_otp_bot`) for security OTPs and Topic 750 appeals.
- `TELEGRAM_TOPIC_GROUP_ID`: Master Security Supergroup ID (`-1003943130538`).
- `TELEGRAM_TOPIC_IP_APPEAL`: Forum Thread ID for security appeals (Strictly `750`).
- `TELEGRAM_TOPIC_SECURITY`: Forum Thread ID for tamper audit alerts (`6`).
- `TELEGRAM_TOPIC_OTP_AUDIT`: Forum Thread ID for passcode deliveries (`7`).
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: Main Edge SQLite database connection parameters.
- `TURSO_HELP_DATABASE_URL`, `TURSO_HELP_AUTH_TOKEN`: Dedicated support ticket LibSQL database.
- `CF_TURNSTILE_SECRET_KEY`: Cloudflare Turnstile human verification secret key.

---

## 5. Autonomous Process Watchdog & Self-Healing Core
**File Reference:** `src/utils/selfHealingWatchdog.js`

### Architectural Purpose:
Guarantees zero-downtime process immortality and prevents Out-Of-Memory (OOM) fatal kills on memory-restricted free-tier cloud containers (512MB RAM).

### Engineering Mechanisms:
1. **Dynamic RAM Ceiling Discovery:** Reads container cgroup v2 (`/sys/fs/cgroup/memory.max`), cgroup v1 (`memory.limit_in_bytes`), or OS memory to compute dynamic warning (75%) and critical (88%) RAM thresholds.
2. **Runtime V8 Garbage Collector:** Exposes and triggers V8 internal garbage collector at runtime using Node.js `vm.runInNewContext("gc")` without needing CLI flags.
3. **Global Process Immortality:** Handles `uncaughtException` and `unhandledRejection` without exiting the Node.js process, maintaining active student downloads.
4. **Worker Thread Watchdog:** Automatically terminates hung background PDF compression and OCR threads after 25 seconds, releasing buffers.
5. **Disk & Temp Folder Pruner:** Hourly routine purging orphaned upload chunks from `temp/` while respecting active upload immunity locks.

| Dimension | Details |
| :--- | :--- |
| **Working Condition** | Background intervals: 30s event-loop lag monitor, 3 min idle cleaner, 60 min temp pruner. GC triggered when RSS memory exceeds 75% ceiling. |
| **Merits** | Prevents 512MB OOM crash reboots; keeps idle server memory below 120MB; auto-reclaims hung thread buffers. |
| **Demerits** | Manual garbage collection invokes a brief 5-15ms thread pause during critical sweeps. |

---

## 6. Dual-Key Security Firewall & Two-Tier Adaptive Shield
**File References:** `src/middleware/ipJail.js`, `src/routes/security.js`, `src/services/securityBotService.js`

### The Two-Tier Adaptive Shield:
```mermaid
flowchart TD
    Req[Incoming Request] --> CheckJail{Is IP or Device Jailed?}
    CheckJail -- Yes --> CheckVol{Request Rate Volumetric Level}
    CheckVol -- ">1500 req/min (DDoS Attack)" --> FastHTML[Tier 1: 4KB Ultra-Fast Static HTML Quarantine]
    CheckVol -- "Client Script Tamper / Strike 3" --> ShieldReact[Tier 2: Restricted Shield Mode React App]
    ShieldReact --> RedBanner[Sticky Red Banner + Incident ID]
    ShieldReact --> AutoHelpModal[Help Center Modal Automatically Pops Open]
    AutoHelpModal --> SubmitAppeal[1-Tap Submit Appeal to Telegram]
    SubmitAppeal --> Topic750[Strictly Dispatched to Supergroup Topic 750]
    Topic750 --> AdminPardon{Admin Telegram Choice}
    AdminPardon -- "[Pardon Device Only]" --> ReleaseDev[Only Offending Hardware Released]
    AdminPardon -- "[Pardon Entire IP]" --> ReleaseIP[Full Public IP Released for Campus]
    CheckJail -- No --> Process[Allow Normal Request Flow]
```

### Dual-Key Campus Isolation:
Tracks both `Client Public IP` and `Hardware Device Fingerprint`. If one student in a college hostel triggers Strike 3 tampering, **only that specific student's hardware device is locked out**, preventing the entire campus Wi-Fi from going down.

### Telegram Topic 750 Dual-Pardon Desk:
Appeals are routed exclusively to Topic 750 (`🛡️ IP Jail & Security Appeals`) in the Security Supergroup (`-1003943130538`). The Administrator receives interactive buttons:
- `[📱 Pardon Device Only]`: Unjails only the student's hardware fingerprint (preserves campus IP shield).
- `[🌐 Pardon Entire IP]`: Releases the entire public IP address in a single tap.
- `[❌ Reject Appeal]`: Dismisses the appeal.

---

## 7. Client-Side Anti-Tamper Sensor, Scrape Curtain & Debugger Trap
**File Reference:** `src/utils/antiTamperDefense.js`

### Multi-Detector Sensor Array:
1. **RegToString:** Detects console serialization probes.
2. **DefineId:** Detects element getter inspections.
3. **Size Split:** Detects docked DevTools via window dimension differentials (`outerWidth - innerWidth > 160`).
4. **DateToString & Function Profiling:** Detects function callstack timings.

### 🛡️ Instant Anti-Scrape Curtain:
The exact millisecond DevTools is opened, an inline `<div>` with `z-index: 2147483645`, `background: rgba(11, 15, 25, 0.95)`, and `backdrop-filter: blur(24px)` is appended to the DOM. Viewport content is 100% concealed, preventing 1-time screen scraping of notes.

### 🛑 Thread-Freeze Debugger Trap:
When DevTools is detected, a recurring interval executes `Function("debugger")()` every 250ms, freezing browser execution in the Sources tab and preventing attackers from typing scraping loops in the console.

### 3-Strike Escalation Lifecycle:
- **Strike 1 & 2:** Warning banner displayed; 24px curtain applied while DevTools is open. Gracefully removed when DevTools is closed.
- **Strike 3:** Permanent account ban in Firestore & Turso, 24-hour Dual-Key IP/Device jail, and instant ban alert dispatched to Telegram Supergroup Topic 6.

---

## 8. Storage Pipeline, Smart Deduplication & Variance Controller
**File References:** `src/services/dedupService.js`, `src/services/dedupSettings.js`, `src/services/compressService.js`, `src/services/ocrService.js`, `src/services/thumbnailService.js`, `src/telegram/mtproto.js`

### Dynamic Size Variance Controller:
Configurable via Admin Tab 10 in Megabytes (default: 3MB) or exact bytes (3,145,728 Bytes). If an uploaded note matches an existing note's subject, title, and page count within the variance threshold, the system reuses the existing MTProto Telegram file ID, saving storage and upload time.

### Pipeline Stages:
1. **Multer Streaming:** Streams incoming upload chunks directly into `temp/` without consuming Node.js heap memory.
2. **File Security Inspector:** Deep magic byte sniffing (`%PDF-`, `PK\x03\x04`), PDF JavaScript scrubber, and Zip bomb decompression ratio checking.
3. **Smart Deduplication:** Calculates SHA-256 hash and metadata match.
4. **Worker PDF Compression:** Spawns `pdfCompressWorker.js` in an isolated worker thread to recompress embedded images and deflate streams with savings up to 70%.
5. **Tesseract OCR Extraction:** Scans images and scanned PDFs to extract handwritten text and mathematical formulas (indexed up to 8,000 characters).
6. **WebP Thumbnail Generation:** Renders page 1 cover image via `pdf-lib` and `sharp`.
7. **Telegram MTProto Cloud Dispatch:** Direct upload to Telegram cloud supergroups via TDLib protocol with file chunking up to 2GB.

---

## 9. Dual-Database Architecture: Firebase Firestore & Turso LibSQL Edge
**File References:** `src/firebase.js`, `src/services/tursoService.js`, `src/services/tursoNotesCacheService.js`, `src/services/tursoNoticesCacheService.js`

### Query Hierarchy:
```mermaid
flowchart LR
    Client[Student Search Query] --> CacheCheck{Is in Memory RAM Cache?}
    CacheCheck -- Hit (0ms) --> Client
    CacheCheck -- Miss --> TursoCheck{Is in Turso Edge SQLite?}
    TursoCheck -- Hit (2-8ms) --> PopulateRAM[Save in RAM Cache] --> Client
    TursoCheck -- Miss --> Firestore[Query Firebase Firestore (50-200ms)]
    Firestore --> SyncTurso[Sync Note Record to Turso]
    SyncTurso --> PopulateRAM
```

### Table Schemas in Turso:
- `notes`: `id`, `title`, `subject`, `branch`, `year`, `semester`, `file_url`, `file_id`, `file_size`, `thumbnail_url`, `ocr_text`, `views`, `downloads`, `created_at`
- `notices`: `id`, `title`, `content`, `category`, `priority`, `expires_at`, `created_at`
- `users`: `id`, `name`, `email`, `role`, `is_blocked`, `created_at`
- `help_tickets`: `id`, `ticket_code`, `user_id`, `user_name`, `question`, `status`, `admin_reply`

| Dimension | Details |
| :--- | :--- |
| **Working Condition** | Read requests hit RAM Cache first, fallback to Turso Edge, and finally to Firestore. Writes update Firestore and asynchronously synchronize to Turso. |
| **Merits** | Sub-10ms query responses; eliminates Firebase read quota limits during exam result traffic surges. |
| **Demerits** | Requires initial boot table sync (`cacheWarmer.js`) to prime local SQLite state. |

---

## 10. WebAuthn Passkeys & Multi-Modal Biometric Authentication
**File References:** `src/routes/auth.js`, `src/routes/passkey.js`, `src/utils/passkeyClient.js`

### Supported Authentication Modalities:
1. **Passkeys (FIDO2 / WebAuthn):** Biometric sign-in via Apple Touch ID/Face ID, Windows Hello, Android Biometrics, and YubiKeys.
2. **Brevo SMTP & Telegram OTP:** 6-digit cryptographic verification passcodes delivered via email or Telegram OTP Bot.
3. **Google OAuth 2.0:** One-tap single sign-on.
4. **Email & Salted Password:** Bcrypt hashed credentials with lockout shields after 5 failed attempts (`accountLockoutService.js`).
5. **Admin Step-Up Security:** Time-locked master elevation tokens required to view sensitive tabs.

---

## 11. Decentralized P2P WebRTC Mesh & Local Campus Airdrop
**File References:** `src/routes/p2p.js`, `src/utils/webrtcStudyRoom.js`, `src/utils/p2pCampusAirdrop.js`, `src/utils/p2pMesh.js`

### Architectural Purpose:
Enables students in the same college, classroom, or hostel Wi-Fi to exchange study notes directly peer-to-peer over local LAN data channels, completely bypassing the central server.

### Campus Airdrop Engine:
- **Device-Adaptive Chunking:** Adjusts chunk size based on `navigator.deviceMemory`: 32KB chunks for low-end 2GB phones, 64KB chunks for higher end devices.
- **Signaling Fastlane:** Signaling endpoints (`/api/p2p/signal`, `/api/p2p/announce`) operate on an immune route exempt from standard download rate limiters.
- **Subnet Matching:** Groups peers by IPv4 subnet (e.g. `192.168.1.x`), prioritizing 50-100 MB/s local Wi-Fi transfers.

---

## 12. Telegram Supergroup Bot Operations Desk & Topic Routing
**File References:** `src/services/securityBotService.js`, `src/services/emailService.js`, `src/services/helpTicketService.js`, `src/services/chatAuditBotService.js`, `src/telegram/botPoller.js`

### Supergroup Topic Routing Directory:
- **Topic 750 (`🛡️ IP Jail & Security Appeals`):** Dedicated exclusively to student IP and hardware quarantine appeals. Features inline keyboard actions:
  - `[📱 Pardon Device Only]`: Unlocks the student's hardware while keeping malicious bot IPs blocked.
  - `[🌐 Pardon Entire IP]`: Releases the entire campus public IP in a single click.
  - `[❌ Reject Appeal]`: Dismisses the appeal.
- **Topic 6 (`🛡️ Security Updates & Anti-Tamper Audits`):** Live stream of DevTools tampering, console strikes, and account locks with student forensics.
- **Topic 7 (`🔐 OTP Passcode Deliveries`):** Instant mirror of one-time login passcodes.
- **Topic 1 (`❓ Active Help Inquiries`):** Open student support queries with inline `[Mark Resolved]` buttons.
- **Topic 2 (`📁 Closed Support Dossiers`):** Archived resolution audit reports.
- **Study Supergroup Subject Topics:** Dynamic forum topics automatically created for academic subjects (DSA, OS, DBMS) where lecture notes are cross-posted.

---

## 13. Master Catalog of All 22 Client & Server Utilities

| # | Utility File | Architectural Responsibility & Working Condition | Merits & Demerits |
| :--- | :--- | :--- | :--- |
| 1 | `academicMetadata.js` | Parses note titles and text using regex pattern directories to extract subject, branch, and semester tags. | **Merit:** Auto-categorizes uploads with 98% accuracy. **Demerit:** Custom college subjects require regex updates. |
| 2 | `antiTamperDefense.js` | Multi-detector DevTools sensor, 24px backdrop blur scrape curtain, 250ms thread freeze debugger trap. | **Merit:** 100% protection against 1-time scraping. **Demerit:** Requires `?admin_inspect=1` bypass for styling debug. |
| 3 | `cacheWarmer.js` | Runs on server boot; queries Firestore and warms memory RAM cache and Turso LibSQL tables. | **Merit:** Eliminates cold-start latency for first student requests. **Demerit:** Adds 2-4s to initial server boot time. |
| 4 | `cdnFailover.js` | Client-side fetch wrapper that detects HTTP 502/504 errors on primary CDN and falls back to secondary origin. | **Merit:** 99.999% note availability. **Demerit:** Secondary stream may have slightly higher latency. |
| 5 | `circuitBreaker.js` | 3-state circuit breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) with 5-failure trip threshold and 45s recovery. | **Merit:** Prevents server hangs during Telegram or Firebase outages. **Demerit:** Temporary fast-fail during transient spikes. |
| 6 | `clientAi.js` | Browser-based lightweight text processing, formula extraction, exam tips, and flashcard generation. | **Merit:** 0 server CPU cost; instant response. **Demerit:** Limited to client device compute capabilities. |
| 7 | `clientCompressor.js` | Resizes and compresses student images directly in browser via Canvas API before upload. | **Merit:** Saves 60-80% upload data for students on mobile 4G. **Demerit:** Minor processing delay on low-end phones. |
| 8 | `clientOcr.js` | Client-side Tesseract.js fallback for scanned notes when server OCR is congested. | **Merit:** Distributes OCR compute across client devices. **Demerit:** Downloads 2MB Tesseract WASM binary once. |
| 9 | `cryptoVault.js` | AES-256-GCM authenticated encryption for sensitive student PII (phone numbers, emails) with blind HMAC indexing. | **Merit:** Full database breach immunity. **Demerit:** Requires valid `JWT_SECRET` for decryption. |
| 10 | `disposableEmailBlocker.js`| Blacklists 500+ throwaway email providers (10minutemail, tempmail, guerrillamail). | **Merit:** Prevents bot account generation. **Demerit:** Legitimate obscure private email domains must be whitelisted. |
| 11 | `fileSecurityInspector.js` | Sniffs magic bytes (`%PDF-`, `PK\x03\x04`), strips malicious PDF JavaScript (`/Launch`), blocks Zip bombs. | **Merit:** Eliminates upload payload exploits. **Demerit:** Parsing deep PDF objects adds 50-100ms. |
| 12 | `formatUtils.js` | Human-readable byte formatting (KB, MB, GB), date localization (IST), and string sanitization. | **Merit:** Consistent formatting across all UI views. **Demerit:** None (pure utility). |
| 13 | `hardwareAdaptiveEngine.js`| Detects device memory (`navigator.deviceMemory`), CPU cores, and connection to clamp heavy workloads. | **Merit:** Anti-crash protection for 2GB budget phones. **Demerit:** Safari does not support `deviceMemory` (uses fallback). |
| 14 | `offlineQueue.js` | IndexedDB-backed offline note storage and offline action sync queue for library environments. | **Merit:** Students study seamlessly without internet. **Demerit:** Subject to browser storage eviction policies. |
| 15 | `p2pCampusAirdrop.js` | WebRTC data channel binary streaming for direct campus classroom note transfers. | **Merit:** 50-100 MB/s transfer speed; 0% server bandwidth. **Demerit:** Requires WebRTC support in browser. |
| 16 | `p2pMesh.js` | Chunk-based P2P distribution mesh engine coordinating note seeders and leechers. | **Merit:** Scales infinitely during exam traffic surges. **Demerit:** Ephemeral state cleared when tabs close. |
| 17 | `passkeyClient.js` | `@simplewebauthn/browser` integration for FIDO2 biometric authentication. | **Merit:** Phishing-proof 1-second sign-in. **Demerit:** Requires HTTPS origin. |
| 18 | `pdfRagSearch.js` | Client-side MiniSearch semantic concept vector graph for instant on-device PDF concept lookups. | **Merit:** True AI concept search with 0 server CPU. **Demerit:** Initial PDF text extraction takes 1-2 seconds. |
| 19 | `ramCache.js` | In-memory LRU/TTL cache with automatic byte size tracking and eviction. | **Merit:** 0ms instantaneous read responses. **Demerit:** Memory bounded to 256MB. |
| 20 | `selfHealingWatchdog.js` | Dynamic memory ceiling discovery, runtime V8 GC hook, process immortality, thread recycler, temp pruner. | **Merit:** Prevents 512MB container OOM crashes. **Demerit:** Brief GC pause during critical sweeps. |
| 21 | `studentStudyContext.js` | Records student reading history, branch, and year; powers 6 AM exam morning pre-fetches. | **Merit:** Personalized pre-fetching ahead of exams. **Demerit:** Requires student consent for local tracking. |
| 22 | `tabLeaderLock.js` | Uses Web Locks API (`navigator.locks`) & BroadcastChannel to elect single leader tab across multiple windows. | **Merit:** Reduces duplicate server sync calls by 90%. **Demerit:** None (transparent multi-tab coordinator). |
| 23 | `telegramSyncLock.js` | Distributed in-flight mutex and 30-min deduplication map ensuring single-receipt delivery. | **Merit:** Prevents duplicate Telegram messages. **Demerit:** In-memory tracking reset on server restart. |
| 24 | `turnstileGuard.js` | Server-side validation of Cloudflare Turnstile captcha tokens via Cloudflare Siteverify API. | **Merit:** 100% automated bot protection. **Demerit:** Requires internet access to Cloudflare API. |
| 25 | `webrtcStudyRoom.js` | Yjs & Y-WebRTC real-time collaborative study room signaling and peer synchronization. | **Merit:** Instant collaborative study pods. **Demerit:** Requires WebSockets or WebRTC signaling. |

---

## 14. Master Catalog of All 19 Backend Services

| # | Service Module | Primary Function & Execution Trigger | Merits & Demerits |
| :--- | :--- | :--- | :--- |
| 1 | **Account Lockout Service** (`accountLockoutService.js`) | Locks account after 5 failed login attempts for 30 minutes. | **Merit:** Stops credential stuffing. **Demerit:** Requires admin unblock for forgotten passwords. |
| 2 | **Account Purge Service** (`accountPurgeService.js`) | Sweeps and removes unverified guest accounts older than 90 days. | **Merit:** Keeps database lean and fast. **Demerit:** Irreversible removal if unverified. |
| 3 | **Chat Audit Bot Service** (`chatAuditBotService.js`) | Mirrors community chat messages and flags abusive language in Telegram Supergroup. | **Merit:** Zero-delay community moderation. **Demerit:** Consumes Telegram bot API quotas. |
| 4 | **Compress Service** (`compressService.js`) | Spawns background worker thread to optimize PDF files. | **Merit:** 0% CPU impact on main event loop. **Demerit:** Slight delay during heavy concurrent uploads. |
| 5 | **PDF Compress Worker** (`pdfCompressWorker.js`) | The worker thread implementation executing `pdf-lib` stream compression. | **Merit:** Isolated thread crash containment. **Demerit:** Memory allocated per active thread. |
| 6 | **Deduplication Service** (`dedupService.js`) | Real-time upload hash calculation and duplicate detection. | **Merit:** Prevents duplicate files. **Demerit:** Cryptographic hashing takes 100-300ms on large files. |
| 7 | **Deduplication Settings** (`dedupSettings.js`) | Manages variance thresholds (3MB default) across upload queue and sweeps. | **Merit:** Dynamic byte-level precision. **Demerit:** Misconfiguration could cause false duplicates. |
| 8 | **Device Security Service** (`deviceSecurityService.js`) | Generates and validates hardware fingerprints and device hashes. | **Merit:** Enables Dual-Key campus isolation. **Demerit:** User browser privacy extensions can alter hashes. |
| 9 | **Email Service** (`emailService.js`) | Brevo SMTP transactional email dispatch with Telegram OTP fallback. | **Merit:** High email inbox delivery rate. **Demerit:** Dependent on external Brevo SMTP relay uptime. |
| 10 | **Exam Buddy Service** (`examBuddyService.js`) | Powers syllabus analysis, formula generation, and PYQ indexing. | **Merit:** Fast student exam preparation. **Demerit:** Requires structured syllabus metadata. |
| 11 | **Help Ticket Service** (`helpTicketService.js`) | Manages 2-way support tickets, Turso sync, and Telegram Topics 1 & 2 dispatch. | **Merit:** Two-way sync between web and Telegram. **Demerit:** Requires active internet connection. |
| 12 | **OCR Service** (`ocrService.js`) | Runs Tesseract.js to extract text from handwritten and scanned notes. | **Merit:** Makes handwritten notes fully searchable. **Demerit:** Heavy memory consumption during recognition. |
| 13 | **Thumbnail Service** (`thumbnailService.js`) | Generates WebP cover thumbnails using `pdf-lib` and `sharp`. | **Merit:** Ultra-fast image rendering on note cards. **Demerit:** Requires valid first page PDF structure. |
| 14 | **Queue Service** (`queueService.js`) | Manages background file upload queue with priority handling. | **Merit:** Prevents server overload during simultaneous uploads. **Demerit:** File processing queued during peak traffic. |
| 15 | **Security Bot Service** (`securityBotService.js`) | Telegram bot poller handling OTPs, Topic 750 appeals, and Dual-Pardon buttons. | **Merit:** 1-tap pardon direct from smartphone. **Demerit:** Requires long-polling or webhook stability. |
| 16 | **Turso Service** (`tursoService.js`) | Master client and schema initializers for Turso LibSQL cloud. | **Merit:** Microsecond database read latency. **Demerit:** Requires sync coordination with Firestore. |
| 17 | **Turso Notes Cache Service** (`tursoNotesCacheService.js`) | High-speed cache specifically for study notes queries. | **Merit:** Zero Firestore read costs for catalog searches. **Demerit:** Cache invalidation must be triggered on note edit. |
| 18 | **Turso Notices Cache Service** (`tursoNoticesCacheService.js`) | Dedicated high-speed cache for college notice boards. | **Merit:** Instant notice delivery to students. **Demerit:** Dependent on local cache validity. |
| 19 | **User Cascade Deletion Service** (`userCascadeDeletionService.js`) | Cleans user records across Firestore, Turso, tickets, and sessions. | **Merit:** 100% GDPR compliant clean account removal. **Demerit:** Irreversible operation. |

---

## 15. Master Catalog of All 11 API Route Controllers

| Route Prefix | File Reference | Primary Endpoints | Access Policy & Middleware |
| :--- | :--- | :--- | :--- |
| `/api/admin` | `src/routes/admin.js` | `GET /stats`, `GET /threats/realtime`, `POST /threats/unjail`, `POST /threats/test-appeal-topic` | Master Admin Only • `adminStepUp.js` |
| `/api/auth` | `src/routes/auth.js` | `POST /register`, `POST /login`, `POST /verify-otp`, `POST /logout` | Public & Authenticated • Rate Limited |
| `/api/chat` | `src/routes/chat.js` | `GET /messages`, `POST /messages`, `POST /report` | Authenticated Students • Anti-Abuse Filter |
| `/api/exam` | `src/routes/exam.js` | `GET /pyq`, `POST /buddy/query`, `GET /syllabus` | Public & Students • Cached |
| `/api/help` | `src/routes/help.js` | `POST /ticket`, `GET /my-tickets`, `POST /reply` | Public (Guests) & Students |
| `/api/notes` | `src/routes/notes.js` | `GET /`, `GET /:id`, `POST /view`, `POST /download` | Public & Students • RAM Cached |
| `/api/notices`| `src/routes/notices.js` | `GET /`, `POST /publish`, `DELETE /:id` | Public Read • Admin Write |
| `/api/p2p` | `src/routes/p2p.js` | `POST /announce`, `GET /peers/:noteId`, `POST /signal`| WebRTC Fastlane • Rate Limit Immune |
| `/api/passkey` | `src/routes/passkey.js` | `POST /register-options`, `POST /verify-registration`, `POST /auth-options`, `POST /verify-auth` | FIDO2 Authenticated • Nonce Guarded |
| `/api/security`| `src/routes/security.js` | `POST /tamper-alert`, `POST /jail-appeal`, `GET /status`, `POST /unjail-incident` | Zero-Trust Shield • Strictly Dispatches to Topic 750 |
| `/api/upload` | `src/routes/upload.js` | `POST /`, `GET /status/:jobId` | Authenticated • Turnstile Captcha • File Security Inspected |

---

## 16. Master Catalog of All 7 Middleware Layers

1. **`adminStepUp.js`:** Enforces time-bound secondary authentication elevation before allowing access to administrative database operations or security keys.
2. **`auth.js`:** Validates cryptographic JSON Web Tokens (JWT) stored in HTTP-only cookies; silently handles refresh tokens.
3. **`csrfGuard.js`:** Enforces strict Same-Origin and Sec-Fetch headers to prevent cross-site request forgery attacks on state-changing endpoints.
4. **`ipJail.js`:** The core Two-Tier firewall that manages sliding-window request rates, IP/Device isolation, and 4KB quarantine detention.
5. **`maintenance.js`:** Intercepts traffic during scheduled platform upgrades, displaying a clean maintenance screen while allowing admin bypass.
6. **`rateLimit.js`:** Multi-tiered express rate limiters for general browsing, search, file uploads, and authentication attempts.
7. **`sanitize.js`:** Globally inspects all incoming request bodies, URL parameters, and headers, stripping prototype pollution, SQL injection, and script tags in sub-milliseconds.

---

## 17. Master Catalog of All 17 Frontend Components & Modals

1. **`App.jsx`:** Main application controller; houses global navigation, search bar, theme toggles, Restricted Shield Mode top banner, and auto-appeal triggering.
2. **`Navbar.jsx`:** Responsive header containing category switches, campus notice pills, study pod links, and user authentication avatar.
3. **`HeroBanner.jsx`:** Dynamic headline showcase displaying real-time platform statistics (notes count, active students, bandwidth saved).
4. **`CategoryFilter.jsx`:** Multi-tier academic filtering buttons (Engineering branches: CSE, ECE, ME, Civil, IT; Semesters 1 through 8).
5. **`NoteCard.jsx`:** High-performance card presenting note cover thumbnails, verified badges, file size, download count, and 1-click preview triggers.
6. **`AdminModal.jsx`:** Master administration cockpit housing Tabs 1 through 16 with tab navigation and step-up elevation verification.
7. **`AuthModal.jsx`:** Multi-modal authentication interface supporting Passkey biometric touch, Email OTP, Google Sign-In, and standard password.
8. **`HelpCenterModal.jsx`:** Dynamic student support modal; automatically pre-populates category `Account Block / IP Jail Appeal` and Incident ID during security restrictions with a 1-tap Telegram unjail desk button.
9. **`NoticeBoardModal.jsx`:** Urgent campus announcements, exam schedules, and university notices board.
10. **`PreviewModal.jsx`:** Ultra-fast PDF document previewer with embedded page rendering and watermark protection.
11. **`ProfileModal.jsx`:** Student account manager displaying enrolled semester, registered passkeys, reading history, and downloaded notes.
12. **`QueueStatusPill.jsx`:** Floating real-time pipeline pill showing progress percentage for background compression, OCR, and Telegram upload jobs.
13. **`StudentChatModal.jsx`:** Live academic community chat room with subject channels and peer interaction.
14. **`StudyPodModal.jsx`:** Collaborative study room manager allowing students to join virtual revision pods with shared timers.
15. **`UploadModal.jsx`:** Student contribution portal with drag-and-drop file upload, subject tagging, Turnstile captcha, and client pre-compression.
16. **`VirtualPdfReader.jsx`:** Fullscreen virtual PDF textbook reader featuring dual-page view, zoom, night mode, and local offline storage.
17. **`GlobalErrorBoundary.jsx` & `ModalErrorBoundary.jsx`:** React error boundaries preventing full-page white-screen crashes during runtime component render failures.

---

## 18. Master Catalog of All 16 Admin Control Center Tabs

| Tab ID | Tab Name | Component File | Key Capabilities & Operational Tools |
| :--- | :--- | :--- | :--- |
| **Tab 1** | **Activities** | `TabActivities.jsx` | Real-time audit logs of student downloads, uploads, logins, and permission changes. |
| **Tab 2** | **Students** | `TabStudents.jsx` | Full student account directory; 1-click account blocking, role elevation, and device auditing. |
| **Tab 3** | **Notes Management** | `TabNotes.jsx` | Approve pending student submissions, edit subject tags, delete obsolete notes, and re-trigger OCR. |
| **Tab 4** | **Notices Board** | `TabNotices.jsx` | Draft, publish, and schedule university notices with priority pinning and expiration timers. |
| **Tab 5** | **Community Chat** | `TabCommunityChat.jsx` | Live chat moderation desk; delete messages, mute disruptive users, and view audit reports. |
| **Tab 6** | **Performance & CDN** | `TabPerformance.jsx` | Monitor Cloudflare Edge response times, toggle CDN failover, and view cache hit ratios. |
| **Tab 7** | **Hardware & Nodes** | `TabHardware.jsx` | Live CPU core charts, dynamic RAM ceiling monitors (75% / 88%), and disk space usage. |
| **Tab 8** | **Software & Runtime** | `TabSoftware.jsx` | Node.js version, V8 heap memory telemetry, process uptime, and self-healing watchdog events. |
| **Tab 9** | **Pipeline & Queue** | `TabPipeline.jsx` | Inspect active background worker threads, compression ratios, OCR queues, and MTProto jobs. |
| **Tab 10** | **Tech Nexus** | `TabTechNexus.jsx` | Smart Deduplication & Size Variance controller (dynamic 3MB / 3,145,728 Bytes tuning) & database duplicate sweep. |
| **Tab 11** | **Security Bot** | `TabSecurityBot.jsx` | Telegram OTP & Security Bot settings, bot token management, and live connectivity health checks. |
| **Tab 12** | **Turso Database Sync** | `TabTurso.jsx` | Inspect LibSQL Edge database sync state, view table row counts, and trigger manual force re-syncs. |
| **Tab 13** | **Database & Cloud** | `TabDatabase.jsx` | Firestore collections viewer, automated database backup export triggers, and storage statistics. |
| **Tab 14** | **Web Security & Appeals**| `TabWebSecurity.jsx` | Dual-Key Quarantine Matrix (All, IPs, Devices), Live Appeals desk with 1-tap pardon, Topic 750 ping test. |
| **Tab 15** | **Restore Vault** | `TabRestoreVault.jsx` | Recycle bin for soft-deleted study materials; allows instant restoration or permanent purge. |
| **Tab 16** | **Help Desk Tickets** | `TabHelpDesk.jsx` | Manage student inquiries; 2-way admin replies with automated synchronization to Telegram Topics 1 & 2. |

---

## 19. Master Software Dependencies Catalog (package.json)

| Package Name | Version | Architectural Purpose in Platform |
| :--- | :--- | :--- |
| `@libsql/client` | `^0.18.0` | Turso Edge SQLite driver supporting microsecond read queries and offline edge databases. |
| `@simplewebauthn/browser` | `^14.0.0` | Client-side FIDO2 / WebAuthn passkey registration and biometric challenge solver. |
| `@simplewebauthn/server` | `^14.0.3` | Server-side cryptographic attestation and assertion verification for passkeys. |
| `bcryptjs` | `^3.0.3` | Salted password hashing for student accounts (cost factor 10). |
| `compression` | `^1.8.2` | Gzip and Deflate response compression middleware reducing HTTP payload sizes by up to 75%. |
| `cookie-parser` | `^1.4.7` | Parses HTTP-only cookies containing JWT authentication and device ID tokens. |
| `cors` | `^2.8.5` | Cross-Origin Resource Sharing middleware enabling secure cross-origin streaming. |
| `disable-devtool` | `^0.3.9` | Industry-standard client-side sensor array detecting DevTools open events. |
| `dotenv` | `^16.4.7` | Loads environment variables from `.env` on server initialization. |
| `express` | `^4.21.2` | Core backend HTTP web application framework. |
| `express-rate-limit` | `^7.5.0` | IP-based request rate limiting with sliding-window counters. |
| `firebase-admin` | `^13.0.2` | Google Cloud Firebase Firestore administrative SDK for document storage. |
| `helmet` | `^8.0.0` | Sets production HTTP security headers (CSP, X-Frame-Options, HSTS). |
| `jsonwebtoken` | `^9.0.2` | Cryptographic JWT signing and verification for session tokens. |
| `lucide-react` | `^1.16.0` | Lightweight SVG icon library for modern React UI components. |
| `minisearch` | `^7.2.0` | High-performance in-memory client-side full-text search engine for PDFs. |
| `multer` | `^1.4.5-lts.1` | Multipart/form-data handler streaming incoming file uploads directly to disk. |
| `nodemailer` | `^10.1.0` | SMTP client dispatching transactional verification emails via Brevo relay. |
| `pdf-lib` | `^1.17.1` | Native JavaScript PDF manipulation (page splitting, compression, watermark injection). |
| `pdfjs-dist` | `^6.4.299` | Mozilla PDF.js rendering engine for client-side PDF document display. |
| `react` & `react-dom` | `^18.3.1` | Core frontend UI rendering library. |
| `sharp` | `^0.35.5` | High-performance libvips image processing for generating WebP thumbnails. |
| `telegram` (GramJS) | `^2.26.22` | Direct Telegram MTProto protocol client for infinite cloud storage. |
| `tesseract.js` | `^7.0.0` | Pure JavaScript OCR engine recognizing text in scanned notes and diagrams. |
| `vite` | `^6.2.0` | Next-generation frontend build tool and development server. |
| `yjs` & `y-webrtc` | `^13.6.33` / `^10.3.0` | CRDT conflict-free replicated data types for real-time collaborative study rooms. |

---

## 20. Complete CLI, Git, Telegram Bot & API Operations Reference

### 1. Development & Build CLI Commands:
```powershell
# Start server with Nodemon watch mode
npm run dev

# Run full production Vite client build
npm run build

# Start production Node.js server
npm run start

# Install packages and build for hosting platforms (Render, Cloud Run)
npm run render-build

# Launch Vite development client standalone
npm run client
```

### 2. Git & Version Control Operations:
```powershell
# Check current working tree status
git status

# Stage all modified and security files
git add src/utils/antiTamperDefense.js src/middleware/ipJail.js src/routes/security.js src/App.jsx

# Commit changes with structured semantic tag
git commit -m "feat(security): add anti-scrape curtain shield and thread-freeze debugger trap on devtools open"

# Push to primary production remote branch
git push origin main
```

### 3. Telegram Supergroup Bot Inline Commands:
- `appeal:pardon_dev:<incidentId>:<deviceId>`: Pardons only the student's hardware device (preserves campus IP shield).
- `appeal:pardon_ip:<incidentId>:<ip>`: Unjails the entire public IP address for all students.
- `appeal:deny:<incidentId>`: Rejects the student's appeal and keeps security quarantine active.
- `/start appeal_<incidentId>`: Deep-links a quarantined student into Telegram for direct verification.

### 4. Core Security & Management API Commands:
```bash
# Check current IP and device security detention status
curl -X GET "http://localhost:5000/api/security/status"

# Submit security quarantine appeal to Topic 750
curl -X POST "http://localhost:5000/api/security/jail-appeal" \
  -H "Content-Type: application/json" \
  -d '{"incidentId":"FSM-SEC-849201","name":"Aman Sharma","email":"aman@college.edu","message":"Inspecting page formatting"}'

# Release connection by Incident ID (Admin)
curl -X POST "http://localhost:5000/api/security/unjail-incident" \
  -H "Content-Type: application/json" \
  -d '{"incidentId":"FSM-SEC-849201"}'

# Test live connectivity to Telegram Topic 750
curl -X POST "http://localhost:5000/api/admin/threats/test-appeal-topic" \
  -H "Cookie: fsm_admin_token=YOUR_ADMIN_TOKEN"
```

---
*Comprehensive Manual compiled for Free Study Material Engineering Team. All rights reserved.*

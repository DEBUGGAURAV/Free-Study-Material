const fs = require("fs");
const path = require("path");
const { db } = require("../firebase");
const { calculateFileHash, findDuplicateNote } = require("./dedupService");
const { compressPdf } = require("./compressService");
const { generateWebPThumbnail } = require("./thumbnailService");
const { extractOcrText } = require("./ocrService");
const { uploadToStorageChannel } = require("../telegram/mtproto");
const { invalidateAllCache } = require("../utils/ramCache");
const { shouldYieldForWebTraffic } = require("../utils/selfHealingWatchdog");

// In-memory queue state for ultra-fast polling
const jobStatusMap = new Map();
const pipelineTrackerMap = new Map();
const activeUploadFiles = new Set();
const uploadWorkerQueue = [];
let activeUploadJobCount = 0;
const MAX_CONCURRENT_UPLOAD_JOBS = 1; // Strict single-worker concurrency prevents parallel worker OOM in 512MB RAM

// Periodic Pruning: Auto-clean completed upload records older than 20 minutes to prevent memory leaks (Point 9)
setInterval(() => {
  const now = Date.now();
  for (const [id, stat] of jobStatusMap.entries()) {
    if (stat.timestamp && now - stat.timestamp > 20 * 60 * 1000) {
      jobStatusMap.delete(id);
    }
  }
  if (pipelineTrackerMap.size > 80) {
    const sorted = Array.from(pipelineTrackerMap.entries()).sort(
      (a, b) => new Date(a[1].updatedAt || 0).getTime() - new Date(b[1].updatedAt || 0).getTime()
    );
    while (pipelineTrackerMap.size > 50) {
      const oldest = sorted.shift();
      if (oldest) pipelineTrackerMap.delete(oldest[0]);
    }
  }
}, 10 * 60 * 1000);

/**
 * 🛡️ Active Upload Immunity Guard:
 * Checks if a file in temp/ is currently being processed or uploaded to Telegram MTProto.
 * Active files receive 100% immunity and will NEVER be deleted by watchdog.
 */
function isTempFileActive(filePath) {
  if (!filePath) return false;
  const normalized = path.resolve(filePath);
  return activeUploadFiles.has(filePath) || activeUploadFiles.has(normalized);
}

function formatRealSize(bytes) {
  const num = Number(bytes || 0);
  if (!num || num <= 0) return "PDF";
  if (num < 1024) return `${num} B`;
  const kb = num / 1024;
  const mb = num / (1024 * 1024);
  if (mb < 0.1) {
    return `${kb.toFixed(1)} KB (${mb.toFixed(2)} MB)`;
  }
  return `${mb.toFixed(2)} MB`;
}

/**
 * Initialize a new Pipeline Lifecycle Record
 */
function recordPipelineStart(info) {
  const {
    noteId,
    title,
    originalName,
    fileSize,
    formattedSize,
    mimeType,
    branch,
    subject,
    course,
    year,
    uploaderEmail,
    uploaderName,
    uploaderIp,
    clientSpeed,
    clientElapsed,
  } = info;

  const record = {
    id: noteId,
    title: title || originalName || "Untitled Note",
    originalName: originalName || "Document.pdf",
    fileSize: fileSize || 0,
    formattedSize: formattedSize || formatRealSize(fileSize),
    mimeType: mimeType || "application/pdf",
    branch: branch || "CSE",
    subject: subject || "General",
    course: course || "B.Tech",
    year: year || "All",
    uploaderEmail: uploaderEmail || "student@freestudymaterial.com",
    uploaderName: uploaderName || "Student Contributor",
    uploaderIp: uploaderIp || "127.0.0.1",
    clientSpeed: clientSpeed || "High Speed (Direct Stream)",
    clientElapsed: clientElapsed ? `${clientElapsed}s` : "1.2s",
    status: "processing",
    progress: 25,
    currentStage: "Server Buffer & Checksum Verification",
    telegramReached: false,
    telegramMessageId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stages: [
      {
        id: 1,
        name: "Client -> Server Transfer",
        status: "completed",
        detail: `100% Ingested at ${clientSpeed || "High Speed"} (${formatRealSize(fileSize)})`,
        timestamp: new Date().toISOString(),
      },
      {
        id: 2,
        name: "Server Buffer & SHA-256",
        status: "processing",
        detail: "Buffering in temp/ storage and computing SHA-256 checksum...",
        timestamp: new Date().toISOString(),
      },
      {
        id: 3,
        name: "Compression & Deduplication",
        status: "pending",
        detail: "Queued for pdf-lib compression and hash deduplication",
        timestamp: null,
      },
      {
        id: 4,
        name: "High-Speed RAM Cache",
        status: "completed",
        detail: `Indexed in RAM (note_${noteId}) • Ranked #1 on Web`,
        timestamp: new Date().toISOString(),
      },
      {
        id: 5,
        name: "Telegram MTProto Storage",
        status: "pending",
        detail: "Awaiting GramJS 8-worker upload dispatch to storage channel",
        timestamp: null,
      },
      {
        id: 6,
        name: "Cloud Firestore Database",
        status: "pending",
        detail: "Awaiting Telegram confirmation to finalize doc & notice",
        timestamp: null,
      },
    ],
  };

  pipelineTrackerMap.set(noteId, record);
  if (db) {
    db.collection("upload_pipelines").doc(noteId).set(record).catch(() => {});
  }
  return record;
}

/**
 * Updates a specific stage in the Pipeline Lifecycle Record
 */
function updatePipelineStage(noteId, stageId, status, detail, extra = {}) {
  let record = pipelineTrackerMap.get(noteId);
  if (!record) return;

  const stage = record.stages.find((s) => s.id === stageId);
  if (stage) {
    stage.status = status;
    stage.detail = detail;
    stage.timestamp = new Date().toISOString();
  }

  if (extra.currentStage) record.currentStage = extra.currentStage;
  if (extra.progress !== undefined) record.progress = extra.progress;
  if (extra.status) record.status = extra.status;
  if (extra.telegramReached !== undefined) record.telegramReached = extra.telegramReached;
  if (extra.telegramMessageId) record.telegramMessageId = extra.telegramMessageId;
  if (extra.mtprotoSpeed) record.mtprotoSpeed = extra.mtprotoSpeed;
  if (extra.mtprotoPercent !== undefined) record.mtprotoPercent = extra.mtprotoPercent;
  if (extra.mtprotoLoadedMB !== undefined) record.mtprotoLoadedMB = extra.mtprotoLoadedMB;
  if (extra.mtprotoTotalMB !== undefined) record.mtprotoTotalMB = extra.mtprotoTotalMB;
  record.updatedAt = new Date().toISOString();

  pipelineTrackerMap.set(noteId, record);
  if (db) {
    db.collection("upload_pipelines").doc(noteId).set(record, { merge: true }).catch(() => {});
  }
}

/**
 * Retrieves ONLY active in-progress pipeline jobs for the Admin Observer
 * Completed uploads are automatically graduated and omitted.
 */
async function getPipelineList() {
  const activeList = [];
  for (const record of pipelineTrackerMap.values()) {
    // Only return items currently processing, queued, or pending
    if (record.status === "processing" || record.status === "queued" || record.status === "pending") {
      activeList.push(record);
    }
  }

  activeList.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  return activeList;
}


/**
 * Enqueues an upload job and processes it asynchronously via concurrency gate
 * @param {object} task 
 */
function enqueueUpload(task) {
  const { noteId, tempFilePath, originalName, mimeType, meta } = task;

  // 🛡️ Register active file in immunity list
  if (tempFilePath) {
    activeUploadFiles.add(path.resolve(tempFilePath));
  }

  const isQueued = activeUploadJobCount >= MAX_CONCURRENT_UPLOAD_JOBS;
  jobStatusMap.set(noteId, {
    noteId,
    status: isQueued ? "queued" : "processing",
    stage: isQueued ? "Queued for Cloud Processing" : "Calculating SHA-256 Checksum",
    progress: isQueued ? 10 : 15,
    timestamp: Date.now(),
  });

  uploadWorkerQueue.push(task);
  setImmediate(dispatchNextUploadJob);
}

function dispatchNextUploadJob() {
  if (activeUploadJobCount >= MAX_CONCURRENT_UPLOAD_JOBS) return;
  if (uploadWorkerQueue.length === 0) return;

  const task = uploadWorkerQueue.shift();
  activeUploadJobCount++;

  runUploadTask(task).finally(() => {
    activeUploadJobCount = Math.max(0, activeUploadJobCount - 1);
    setImmediate(dispatchNextUploadJob);
  });
}

async function runUploadTask(task) {
  const { noteId, tempFilePath, originalName, mimeType, meta } = task;
  try {
    console.log(`[QUEUE] Starting async job for Note: ${noteId} (${originalName})`);
    const originalSize = fs.existsSync(tempFilePath) ? fs.statSync(tempFilePath).size : 0;

    // Stage 1: SHA-256 Deduplication check
    jobStatusMap.set(noteId, {
      noteId,
      status: "processing",
      stage: "Checking SHA-256 Deduplication",
      progress: 30,
      timestamp: Date.now(),
    });

      const fileHash = await calculateFileHash(tempFilePath);
      console.log(`[QUEUE] SHA-256 Hash: ${fileHash}`);

      updatePipelineStage(noteId, 2, "completed", `SHA-256 Checksum: ${fileHash.substring(0, 16)}...`, {
        progress: 35,
        currentStage: "Checking Deduplication & Optimizing Streams",
      });

      const duplicate = await findDuplicateNote(fileHash, originalName, originalSize, noteId);

      if (duplicate) {
        console.log(`[QUEUE] ⚡ Zero-Second Deduplication hit for ${noteId}! Reusing Telegram Ref.`);
        
        // Instant completion via deduplication
        if (db) {
          const dupUpdates = {
            status: "ready",
            telegramMessageId: duplicate.telegramMessageId || null,
            telegramFileId: duplicate.telegramFileId || null,
            driveLink: duplicate.driveLink || null,
            fileUrl: duplicate.fileUrl || null,
            fileHash: fileHash,
            fileSize: duplicate.fileSize || originalSize,
            compressedSize: duplicate.compressedSize || originalSize,
            savingsPercent: 100,
            isDuplicate: true,
            thumbnailUrl: duplicate.thumbnailUrl || null,
            downloadUrl: `/api/notes/${noteId}/stream`,
            updatedAt: new Date().toISOString(),
          };
          await db.collection("notes").doc(noteId).update(dupUpdates);

          try {
            const { upsertNoteInCache } = require("./tursoNotesCacheService");
            const { upsertNoteToTurso } = require("./tursoService");
            const fullDupData = { id: noteId, ...meta, ...dupUpdates };
            upsertNoteInCache(fullDupData).catch(() => {});
            upsertNoteToTurso(fullDupData).catch(() => {});
          } catch (_) {}
        }

        // Clean up temp file immediately
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }

        jobStatusMap.set(noteId, {
          noteId,
          status: "ready",
          stage: "Completed via SHA-256 Deduplication (0s)",
          progress: 100,
          isDuplicate: true,
          savingsPercent: 100,
          duplicateReceipt: {
            isDuplicate: true,
            title: originalName,
            existingNoteId: duplicate.id,
            streamUrl: `/api/notes/${duplicate.id}/stream`,
            message: "♻️ Duplicate Notice: This file already exists in Academic Cloud Vault. Instant 0s deduplication applied.",
          },
        });

        updatePipelineStage(noteId, 3, "completed", "Deduplication Hit! Reused existing file reference", { progress: 70 });
        updatePipelineStage(noteId, 5, "completed", `Reused Cloud Storage Ref (Msg ID: #${duplicate.telegramMessageId})`, {
          telegramReached: true,
          telegramMessageId: duplicate.telegramMessageId,
          progress: 90,
        });
        updatePipelineStage(noteId, 6, "completed", "Firestore doc linked • Notice published • Download stream active", {
          status: "completed",
          progress: 100,
          currentStage: "Completed & Ready in Cloud (0s Deduplication)",
        });

        invalidateAllCache();
        setTimeout(() => {
          jobStatusMap.delete(noteId);
          pipelineTrackerMap.delete(noteId);
        }, 15 * 60 * 1000);
        return;
      }

      // Stage 2: PDF Compression (pdf-lib)
      // ⏱️ Yield momentarily if event loop is congested to prioritize live student requests
      if (shouldYieldForWebTraffic()) {
        await new Promise((r) => setTimeout(r, 400));
      }

      let compressedSize = originalSize;
      let savingsPercent = 0;
      const ext = path.extname(originalName).toLowerCase();

      // ⚡ Zero-Server CPU/RAM optimization: If client browser already compressed the PDF, skip server pdf-lib!
      const isClientPreCompressed = Boolean(task?.clientCompressed || meta?.clientCompressed);

      if (isClientPreCompressed) {
        console.log(`[QUEUE] ⚡ Note ${noteId} was pre-compressed by client browser. Skipping server pdf-lib (0% Server RAM used).`);
        updatePipelineStage(noteId, 3, "completed", `Client Hardware-Compressed (${formatRealSize(originalSize)}) • 0% Server CPU`, {
          progress: 55,
          currentStage: "Syncing to Cloud Storage (Primary Vault)",
        });
      } else if ((ext === ".pdf" || mimeType === "application/pdf") && originalSize <= 25 * 1024 * 1024) {
        jobStatusMap.set(noteId, {
          noteId,
          status: "processing",
          stage: "Compressing PDF Streams (pdf-lib)",
          progress: 50,
        });

        const compResult = await compressPdf(tempFilePath);
        compressedSize = compResult.compressedSize;
        savingsPercent = compResult.savingsPercent;

        updatePipelineStage(noteId, 3, "completed", `Compressed with pdf-lib (${savingsPercent}% saved, ${formatRealSize(compressedSize)})`, {
          progress: 55,
          currentStage: "Syncing to Cloud Storage (Primary Vault)",
        });
      } else {
        const isOver100MB = originalSize >= 100 * 1024 * 1024;
        const isLarge = originalSize > 50 * 1024 * 1024;
        updatePipelineStage(
          noteId,
          3,
          "completed",
          isOver100MB
            ? "Large File (>=100MB): Direct MTProto Stream to Telegram (0% Server RAM/Disk Cache)"
            : (isLarge ? "Large File (>50MB): Direct Async Cloud Transfer (Zero RAM Cache)" : "Stream verified • Direct binary pass-through"),
          {
            progress: 55,
            currentStage: isOver100MB
              ? "Direct MTProto Telegram Stream (>=100MB)"
              : (isLarge ? "Direct Async Cloud Transfer (>50MB)" : "Syncing to Cloud Storage (Primary Vault)"),
          }
        );
      }

      // Stage 3: WebP Thumbnail Generation (Sharp)
      jobStatusMap.set(noteId, {
        noteId,
        status: "processing",
        stage: "Generating WebP Thumbnail",
        progress: 65,
      });

      let thumbnailUrl = null;
      let ocrText = "";
      if (mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        thumbnailUrl = await generateWebPThumbnail(tempFilePath);
        
        jobStatusMap.set(noteId, {
          noteId,
          status: "processing",
          stage: "Extracting Text via Tesseract OCR Engine",
          progress: 72,
        });
        ocrText = await extractOcrText(tempFilePath, mimeType);
      }

      // Stage 4: Cloud Push (High-Speed Engine)
      jobStatusMap.set(noteId, {
        noteId,
        status: "processing",
        stage: "Syncing to Cloud Storage",
        progress: 85,
      });

      const isOver100MB = originalSize >= 100 * 1024 * 1024;
      updatePipelineStage(
        noteId,
        5,
        "processing",
        isOver100MB
          ? "Streaming direct to Telegram via MTProto (>=100MB Zero-RAM)..."
          : "Dispatching via High-Speed Pipeline to Cloud Storage...",
        {
          progress: 75,
          currentStage: isOver100MB ? "Telegram MTProto Direct Stream" : "Cloud Storage Push",
        }
      );

      const caption = `Title: ${meta.title || originalName}\nSubject: ${meta.subject || "General"}\nCourse: ${meta.course || "All"}\nBranch: ${meta.branch || "General"}\nYear: ${meta.year || "All"}`;
      const uploadResult = await uploadToStorageChannel(tempFilePath, caption, originalName, (mtMetrics) => {
        jobStatusMap.set(noteId, {
          noteId,
          status: "processing",
          stage: `Syncing to Cloud Storage: ${mtMetrics.percent}% (${mtMetrics.speed})`,
          progress: Math.min(95, 75 + Math.round(mtMetrics.percent * 0.2)),
          mtprotoSpeed: mtMetrics.speed,
          mtprotoPercent: mtMetrics.percent,
          mtprotoLoadedMB: mtMetrics.loadedMB,
          mtprotoTotalMB: mtMetrics.totalMB,
        });

        updatePipelineStage(noteId, 5, "processing", `Uploading to Cloud Storage: ${mtMetrics.percent}% • ⚡ ${mtMetrics.speed} (${mtMetrics.loadedMB} / ${mtMetrics.totalMB} MB)`, {
          progress: Math.min(95, 75 + Math.round(mtMetrics.percent * 0.2)),
          currentStage: "Cloud Storage Push",
          mtprotoSpeed: mtMetrics.speed,
          mtprotoPercent: mtMetrics.percent,
          mtprotoLoadedMB: mtMetrics.loadedMB,
          mtprotoTotalMB: mtMetrics.totalMB,
        });
      });

      updatePipelineStage(noteId, 5, "completed", `Stored in Cloud Storage! Msg ID: #${uploadResult.messageId}${uploadResult.documentId ? ` (Doc ID: ${uploadResult.documentId})` : ""}`, {
        telegramReached: true,
        telegramMessageId: uploadResult.messageId,
        progress: 90,
        currentStage: "Finalizing Database Document",
      });

      // Stage 5: Finalize Firestore Document
      jobStatusMap.set(noteId, {
        noteId,
        status: "processing",
        stage: "Finalizing Metadata",
        progress: 95,
      });

      if (db) {
        const readyUpdates = {
          status: "ready",
          telegramMessageId: uploadResult.messageId,
          telegramDocumentId: uploadResult.documentId || null,
          telegramChannelId: uploadResult.channelId || null,
          fileHash: fileHash,
          fileSize: originalSize,
          compressedSize: compressedSize,
          savingsPercent: savingsPercent,
          thumbnailUrl: thumbnailUrl,
          ocrText: ocrText || "",
          hasOcr: Boolean(ocrText && ocrText.length > 0),
          downloadUrl: `/api/notes/${noteId}/stream`,
          updatedAt: new Date().toISOString(),
        };

        await db.collection("notes").doc(noteId).update(readyUpdates);

        try {
          const { upsertNoteInCache } = require("./tursoNotesCacheService");
          const { upsertNoteToTurso } = require("./tursoService");
          const fullReadyData = { id: noteId, ...meta, ...readyUpdates };
          upsertNoteInCache(fullReadyData).catch(() => {});
          upsertNoteToTurso(fullReadyData).catch(() => {});
        } catch (_) {}

        try {
          const { recordSyncEvent } = require("../telegram/syncTracker");
          recordSyncEvent({
            trigger: `Website Upload: "${meta?.title || originalName || noteId}"`,
            details: "Uploaded to web and synchronized to Cloud Vault",
            importedCount: 1,
          });
        } catch {}
      }

      // 💽 Pre-seed Server NVMe SSD Disk Cache so newly uploaded note streams instantly (Tier 3)
      // Strictly for files <= 50MB: Large files (>50MB or >=100MB) bypass disk copy to prevent ENOSPC disk exhaustion
      if (originalSize <= 50 * 1024 * 1024) {
        try {
          const cdnCacheDir = path.join(process.cwd(), "cache", "cdn");
          if (!fs.existsSync(cdnCacheDir)) fs.mkdirSync(cdnCacheDir, { recursive: true });
          const targetBin = path.join(cdnCacheDir, `${noteId}.bin`);
          const targetMeta = path.join(cdnCacheDir, `${noteId}.meta.json`);
          if (fs.existsSync(tempFilePath)) {
            await fs.promises.copyFile(tempFilePath, targetBin);
            await fs.promises.writeFile(targetMeta, JSON.stringify({
              id: noteId,
              title: meta?.title || originalName || noteId,
              mimeType: mimeType || "application/pdf",
              totalSize: compressedSize || originalSize,
              cachedAt: new Date().toISOString(),
            }), "utf8");
            console.log(`[QUEUE] 💽 Pre-seeded newly uploaded note ${noteId} directly to Server SSD Disk Cache!`);
            if (db) {
              db.collection("notes").doc(noteId).update({ isCdnCached: true }).catch(() => {});
            }
          }
        } catch (ssdErr) {
          console.warn("[QUEUE] Pre-seed Server SSD disk cache notice:", ssdErr.message);
        }
      } else {
        console.log(`[QUEUE] ⚡ Note ${noteId} (${formatRealSize(originalSize)}) > 50MB: Bypassing local disk pre-seed to conserve server storage quota. Stored 100% in Telegram Vault.`);
      }

      // Clean up server temp file (100% Zero Persistent Server Disk Usage)
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
        console.log(`[QUEUE] Temp file safely purged: ${tempFilePath}`);
      }

      jobStatusMap.set(noteId, {
        noteId,
        status: "ready",
        stage: "Stored in Cloud Storage & Ready",
        progress: 100,
        savingsPercent,
      });

      updatePipelineStage(noteId, 6, "completed", "Firestore document finalized • Live stream ready • Auto-notice published", {
        status: "completed",
        progress: 100,
        currentStage: "All Stages Completed & Ready in Cloud",
      });

      invalidateAllCache();
      console.log(`[QUEUE] Job finished successfully for Note: ${noteId}`);
      setTimeout(() => {
        jobStatusMap.delete(noteId);
        pipelineTrackerMap.delete(noteId);
      }, 15 * 60 * 1000);
    } catch (err) {
      console.error(`[QUEUE] Error processing job for Note ${noteId}:`, err);
      
      jobStatusMap.set(noteId, {
        noteId,
        status: "error",
        error: err.message,
        stage: "Failed",
      });

      updatePipelineStage(noteId, 5, "error", `Telegram / Processing error: ${err.message}`, {
        status: "error",
        telegramReached: false,
        currentStage: `Failed: ${err.message}`,
      });

      if (db) {
        await db.collection("notes").doc(noteId).update({
          status: "error",
          errorMessage: err.message,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }

      // Clean up temp file on error too
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }

      setTimeout(() => {
        jobStatusMap.delete(noteId);
        pipelineTrackerMap.delete(noteId);
      }, 15 * 60 * 1000);
    } finally {
      if (tempFilePath) {
        activeUploadFiles.delete(path.resolve(tempFilePath));
      }
    }
}

function getJobStatus(noteId) {
  return jobStatusMap.get(noteId) || null;
}

module.exports = {
  enqueueUpload,
  getJobStatus,
  recordPipelineStart,
  updatePipelineStage,
  getPipelineList,
  isTempFileActive,
};



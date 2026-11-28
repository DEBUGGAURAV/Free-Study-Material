import { useState } from "react";
import { Trash2, Search, Clock, HardDrive, Zap, Flame } from "lucide-react";
import "../../../api";

export default function TabPerformance(props) {
  const {
    cdnFiles,
    cdnSearch,
    cdnStats,
    handlePurgeCdn,
    handlePurgeDiskOnly,
    handlePurgeEdgeOnly,
    handlePurgeNoteCdn,
    handlePurgeRamOnly,
    handlePurgeSingleCdnFile,
    handlePurgeSingleDiskFile,
    handleSaveRetention,
    manualNoteIdToPurge,
    retentionDays,
    setActiveTab,
    setCdnSearch,
    setManualNoteIdToPurge,
    setRetentionDays,
    setShowAllCdnFiles,
    showAllCdnFiles,
    ssdDiskStats,
  } = props;

  const [storageFilter, setStorageFilter] = useState("all"); // "all" | "ssd" | "ram"

  

  return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                    Cloudflare CDN &amp; Memory Acceleration
                  </h3>
                  <p style={{ fontSize: "0.78rem", color: "#475569", margin: "2px 0 0" }}>
                    Global edge caching, cache invalidation, and memory garbage collection.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={handlePurgeRamOnly}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", borderColor: "#a7f3d0", color: "#059669", fontWeight: 700, background: "#ecfdf5" }}
                    title="Purge only Node.js in-memory LRU RAM buffer"
                  >
                    <Trash2 size={13} />
                    <span>🧹 Purge RAM Only</span>
                  </button>

                  <button
                    onClick={handlePurgeDiskOnly}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", borderColor: "#a7f3d0", color: "#059669", fontWeight: 700, background: "#ecfdf5" }}
                    title="Purge only Server NVMe SSD Disk Cache (cache/cdn/) without touching RAM or Cloudflare Edge"
                  >
                    <HardDrive size={13} />
                    <span>💽 Clean Server SSD Only</span>
                  </button>

                  <button
                    onClick={handlePurgeEdgeOnly}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", borderColor: "#bae6fd", color: "#0284c7", fontWeight: 700, background: "#f0f9ff" }}
                    title="Purge Cloudflare Edge CDN & Worker cache across all PoPs"
                  >
                    <Zap size={13} />
                    <span>⚡ Purge Edge CDN &amp; Worker</span>
                  </button>

                  <button
                    onClick={handlePurgeCdn}
                    className="btn-danger"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 14px", fontWeight: 800, background: "#dc2626", color: "#ffffff", borderColor: "#b91c1c" }}
                    title="Purge All Keys globally across Server NVMe SSD Disk, Cloudflare Edge & RAM Cache"
                  >
                    <Flame size={14} />
                    <span>🔥 Purge All (SSD + Edge + RAM)</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab("turso");
                    }}
                    className="btn-secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", padding: "7px 12px", borderColor: "#fecaca", color: "#dc2626", fontWeight: 700, background: "#fef2f2" }}
                    title="Open Turso Cache Delete Controller by Days"
                  >
                    <Trash2 size={13} />
                    <span>🗑️ Turso Cache (By Days)</span>
                  </button>
                </div>
              </div>

              {/* Cloudflare CDN Storage & Retention Policy Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                {/* Storage Breakdown Card */}
                <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "18px", boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <HardDrive size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.92rem" }}>CDN &amp; RAM Storage Breakdown</div>
                        <div style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 700 }}>Live Capacity Utilization &amp; Allocation</div>
                      </div>
                    </div>

                    <button
                      onClick={handlePurgeCdn}
                      className="btn-danger"
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.74rem", padding: "5px 12px", background: "#dc2626", color: "#ffffff", border: "1.5px solid #b91c1c", borderRadius: "6px", fontWeight: 700, cursor: "pointer" }}
                      title="Empty and clear all cache entries immediately"
                    >
                      <Trash2 size={13} />
                      <span>Empty Cache Pool</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.8rem" }}>
                    {/* Server NVMe SSD Disk Cache Pool */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "#475569", fontWeight: 600 }}>Server NVMe SSD Disk Cache:</span>
                        <span style={{ color: "#059669", fontWeight: 700 }}>
                          {(ssdDiskStats?.totalMB ?? cdnStats?.ssdDisk?.storageUsedMB ?? "0.0")} MB / 1536 MB ({ssdDiskStats?.quotaPercent ?? cdnStats?.ssdDisk?.quotaUsedPercent ?? 0}% used)
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, Math.max((ssdDiskStats?.totalBytes ?? 0) > 0 ? 3 : 0, (ssdDiskStats?.quotaPercent ?? cdnStats?.ssdDisk?.quotaUsedPercent ?? 0)))}%`, height: "100%", background: "#10b981", borderRadius: "999px" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#475569", marginTop: "4px" }}>
                        <span>Dedicated 1.5 GB NVMe SSD cache (cache/cdn/) • {ssdDiskStats?.totalFiles ?? cdnStats?.ssdDisk?.cachedFilesCount ?? 0} notes on disk</span>
                        <button
                          onClick={handlePurgeDiskOnly}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc2626",
                            fontWeight: 700,
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            textDecoration: "underline",
                            padding: 0
                          }}
                        >
                          Clear SSD Disk
                        </button>
                      </div>
                    </div>

                    {/* In-Memory RAM Cache */}
                    <div>
                      {(() => {
                        const usedMB = Number(cdnStats?.ramUsedMB ?? 0);
                        const poolMaxMB = Number(cdnStats?.ramPoolMaxMB || 128);
                        const percent = poolMaxMB > 0 ? Math.min(100, Math.round((usedMB / poolMaxMB) * 100)) : 0;
                        const itemsCount = Number(cdnStats?.ramBufferItems ?? 0);
                        return (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <span style={{ color: "#475569", fontWeight: 600 }}>In-Memory RAM Cache Pool:</span>
                              <span style={{ color: "#059669", fontWeight: 700 }}>
                                {usedMB.toFixed(2)} MB / {poolMaxMB} MB ({percent}% used)
                              </span>
                            </div>
                            <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                              <div style={{ width: `${percent}%`, height: "100%", background: "#10b981", borderRadius: "999px" }} />
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "4px" }}>
                              Live Node.js PDF RAM buffer ({itemsCount} hot {itemsCount === 1 ? "note" : "notes"} in memory; large PDFs stream directly via Disk/Edge to keep RAM safe).
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Cloudflare Edge CDN Storage Used */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "#475569", fontWeight: 600 }}>Cloudflare Edge CDN Space Used:</span>
                        <span style={{ color: "#0284c7", fontWeight: 700 }}>
                          {cdnStats?.edgeCdn?.formattedUsed || "0.0 MB"} Cached (Indian Anycast: BOM / DEL)
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ width: `${cdnStats?.edgeCdn?.realCachedPercent ? Math.min(100, Math.max(0, cdnStats.edgeCdn.realCachedPercent)) : (cdnStats?.hitRatio ? Math.min(100, Math.max(0, parseFloat(cdnStats.hitRatio))) : 0)}%`, height: "100%", background: "linear-gradient(90deg, #0284c7, #2563eb)", borderRadius: "999px" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#475569", marginTop: "4px" }}>
                        <span>Capacity: Unlimited Dynamic NVMe SSD Pool ({cdnStats?.edgeCdn?.pdfCount ?? cdnStats?.edgeCdn?.cachedFilesCount ?? 0} Vault PDFs • {cdnStats?.edgeCdn?.imgCount ?? 0} Images / Media)</span>
                        <span style={{ color: "#059669", fontWeight: 700 }}>Bandwidth Offload: {cdnStats?.edgeCdn?.totalBandwidthSaved || "0.00 MB"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cache Retention & Purge Policy Card */}
                <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "18px", boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#ede9fe", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Clock size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.92rem" }}>Retention Policy &amp; Eviction Lifecycle</div>
                      <div style={{ fontSize: "0.72rem", color: "#7c3aed", fontWeight: 700 }}>Automated &amp; Configurable Cache Lifetime</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <span style={{ color: "#334155", fontWeight: 600 }}>Automated Retention:</span>
                      <span style={{ color: "#065f46", fontWeight: 800, background: "#d1fae5", padding: "3px 10px", borderRadius: "999px", border: "1.5px solid #6ee7b7", fontSize: "0.75rem" }}>
                        365 Days Rolling (1 Year Edge TTL)
                      </span>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ color: "#334155", fontWeight: 600 }}>Configurable Retention Slider:</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#b45309", fontWeight: 800, fontSize: "0.86rem" }}>
                            {retentionDays >= 365
                              ? "365 Days (1 Full Year 🌟)"
                              : retentionDays >= 30
                              ? `${retentionDays} Days (~${Math.round(retentionDays / 30)} Mo)`
                              : `${retentionDays} Days`}
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={retentionDays}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setRetentionDays(Math.max(1, Math.min(365, val)));
                            }}
                            style={{
                              width: "60px",
                              padding: "4px 6px",
                              fontSize: "0.78rem",
                              fontWeight: 800,
                              textAlign: "center",
                              background: "#f8fafc",
                              border: "1.5px solid #cbd5e1",
                              borderRadius: "6px",
                              color: "#0f172a",
                            }}
                            title="Enter exact retention days (1-365)"
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                          type="range"
                          min="1"
                          max="365"
                          value={retentionDays}
                          onChange={(e) => setRetentionDays(Number(e.target.value))}
                          style={{ flex: 1, accentColor: "#7c3aed", cursor: "pointer" }}
                        />
                        <button
                          onClick={() => handleSaveRetention()}
                          style={{
                            padding: "6px 14px",
                            fontSize: "0.76rem",
                            fontWeight: 700,
                            background: "#7c3aed",
                            border: "1.5px solid #6d28d9",
                            color: "#ffffff",
                            cursor: "pointer",
                            borderRadius: "6px",
                          }}
                        >
                          Apply Retention
                        </button>
                      </div>

                      {/* Fast Preset Option Chips */}
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "10px" }}>
                        <span style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 600, marginRight: "2px" }}>Quick Presets:</span>
                        {[
                          { days: 7, label: "7 Days" },
                          { days: 30, label: "30 Days (1 Mo)" },
                          { days: 90, label: "90 Days (3 Mo)" },
                          { days: 180, label: "180 Days (6 Mo)" },
                          { days: 365, label: "365 Days (1 Year 🌟)" },
                        ].map((preset) => {
                          const isSelected = retentionDays === preset.days;
                          return (
                            <button
                              key={preset.days}
                              type="button"
                              onClick={() => {
                                setRetentionDays(preset.days);
                              }}
                              style={{
                                padding: "4px 10px",
                                fontSize: "0.72rem",
                                fontWeight: isSelected ? 800 : 600,
                                borderRadius: "6px",
                                border: isSelected
                                  ? "1.5px solid #6d28d9"
                                  : "1.5px solid #cbd5e1",
                                background: isSelected
                                  ? "#7c3aed"
                                  : "#f8fafc",
                                color: isSelected ? "#ffffff" : "#334155",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ fontSize: "0.74rem", color: "#475569", marginTop: "10px", lineHeight: "1.4" }}>
                        Adjustable from <strong style={{ color: "#0f172a" }}>1 to 365 Days (1 Full Year)</strong>. Recommended: <strong style={{ color: "#0f172a" }}>365 Days</strong> for permanent campus edge persistence, or <strong style={{ color: "#0f172a" }}>7 to 30 Days</strong> for rapid rotation.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CDN KPIs - 4 Columns Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                {/* Edge CDN Storage Used Card */}
                <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "14px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 700, textTransform: "uppercase" }}>Edge CDN Space Used</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0284c7", marginTop: "2px" }}>
                    {cdnStats?.edgeCdn?.formattedUsed || "0.0 MB"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#059669", marginTop: "4px", fontWeight: 700 }}>
                    Bandwidth Saved: {cdnStats?.edgeCdn?.totalBandwidthSaved || "0.00 MB"}
                  </div>
                </div>

                <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "14px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 700 }}>Edge Hit Ratio</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#059669", marginTop: "2px" }}>
                    {cdnStats?.hitRatio || "0.0%"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "4px", fontWeight: 600 }}>
                    Hits: {cdnStats?.hits ?? 0} • Misses: {cdnStats?.misses ?? 0}
                  </div>
                </div>

                <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "14px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 700 }}>Cached Vault Documents</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#7c3aed", marginTop: "2px" }}>
                    {cdnStats?.edgeCdn?.cachedFilesCount ?? (cdnStats?.edgeCdn?.isPurged ? 0 : cdnFiles.length)}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "4px", fontWeight: 600 }}>
                    Active Across 300+ Edge Cities
                  </div>
                </div>

                <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "14px", boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 700 }}>Targeted Note Cache Purge</div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: "6px 10px", fontSize: "0.78rem", flex: 1, background: "#f8fafc", border: "1.5px solid #cbd5e1", color: "#0f172a", borderRadius: "6px" }}
                      placeholder="Enter Note ID..."
                      value={manualNoteIdToPurge}
                      onChange={(e) => setManualNoteIdToPurge(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        handlePurgeNoteCdn(manualNoteIdToPurge);
                        setManualNoteIdToPurge("");
                      }}
                      className="btn-primary"
                      style={{ padding: "6px 14px", fontSize: "0.78rem", fontWeight: 700, background: "#2563eb", color: "#ffffff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                    >
                      Purge
                    </button>
                  </div>
                </div>
              </div>

              {/* Granular Cached Files Table with Storage Filters & Search Bar */}
              {(() => {
                const ssdCount = cdnFiles.filter((f) => f.onDisk).length;
                const ramCount = cdnFiles.filter((f) => f.inRam).length;

                const filteredCdn = cdnFiles.filter((file) => {
                  if (storageFilter === "ssd" && !file.onDisk) return false;
                  if (storageFilter === "ram" && !file.inRam) return false;

                  if (!cdnSearch.trim()) return true;
                  const q = cdnSearch.toLowerCase().trim();
                  return (
                    (file.noteId && file.noteId.toLowerCase().includes(q)) ||
                    (file.title && file.title.toLowerCase().includes(q)) ||
                    (file.originalName && file.originalName.toLowerCase().includes(q))
                  );
                });
                const displayCdn = showAllCdnFiles ? filteredCdn : filteredCdn.slice(0, 15);

                return (
                  <div style={{ background: "#ffffff", border: "1.5px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)" }}>
                    {/* Header Bar with Realtime Search & Storage Node Filter Tabs */}
                    <div style={{ padding: "14px 18px", borderBottom: "1.5px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span>Stored &amp; Cached Academic Documents</span>
                          <span style={{ fontSize: "0.72rem", background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "2px 8px", borderRadius: "999px", fontWeight: 700 }}>
                            💽 {ssdCount} on Server SSD
                          </span>
                          <span style={{ fontSize: "0.72rem", background: "#f3e8ff", color: "#7e22ce", border: "1px solid #d8b4fe", padding: "2px 8px", borderRadius: "999px", fontWeight: 700 }}>
                            🧠 {ramCount} in RAM Buffer
                          </span>
                        </div>

                        {/* Filter Mode Selector Pills */}
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            onClick={() => setStorageFilter("all")}
                            style={{
                              padding: "4px 12px",
                              borderRadius: "6px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              background: storageFilter === "all" ? "#0284c7" : "#ffffff",
                              border: storageFilter === "all" ? "1.5px solid #0369a1" : "1.5px solid #cbd5e1",
                              color: storageFilter === "all" ? "#ffffff" : "#475569",
                              transition: "all 0.15s ease",
                            }}
                          >
                            🌐 All Cached ({cdnFiles.length})
                          </button>
                          <button
                            onClick={() => setStorageFilter("ssd")}
                            style={{
                              padding: "4px 12px",
                              borderRadius: "6px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              background: storageFilter === "ssd" ? "#059669" : "#ffffff",
                              border: storageFilter === "ssd" ? "1.5px solid #047857" : "1.5px solid #cbd5e1",
                              color: storageFilter === "ssd" ? "#ffffff" : "#475569",
                              transition: "all 0.15s ease",
                            }}
                          >
                            💽 Stored on Server SSD Only ({ssdCount})
                          </button>
                          <button
                            onClick={() => setStorageFilter("ram")}
                            style={{
                              padding: "4px 12px",
                              borderRadius: "6px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              background: storageFilter === "ram" ? "#7c3aed" : "#ffffff",
                              border: storageFilter === "ram" ? "1.5px solid #6d28d9" : "1.5px solid #cbd5e1",
                              color: storageFilter === "ram" ? "#ffffff" : "#475569",
                              transition: "all 0.15s ease",
                            }}
                          >
                            🧠 In RAM Buffer Only ({ramCount})
                          </button>
                        </div>
                      </div>

                      <div style={{ position: "relative", minWidth: "260px" }}>
                        <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                        <input
                          type="text"
                          value={cdnSearch}
                          onChange={(e) => setCdnSearch(e.target.value)}
                          placeholder="Search note by title or ID..."
                          style={{
                            width: "100%",
                            padding: "6px 12px 6px 32px",
                            borderRadius: "6px",
                            background: "#ffffff",
                            border: "1.5px solid #cbd5e1",
                            color: "#0f172a",
                            fontSize: "0.78rem",
                          }}
                        />
                      </div>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9", borderBottom: "1.5px solid #cbd5e1", color: "#334155" }}>
                          <th style={{ padding: "10px 16px", fontWeight: 800 }}>KEY / NOTE ID</th>
                          <th style={{ padding: "10px 16px", fontWeight: 800 }}>STORAGE NODE</th>
                          <th style={{ padding: "10px 16px", fontWeight: 800 }}>TYPE</th>
                          <th style={{ padding: "10px 16px", fontWeight: 800 }}>DOCUMENT TITLE</th>
                          <th style={{ padding: "10px 16px", fontWeight: 800 }}>SSD / FILE SIZE</th>
                          <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 800 }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayCdn.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>
                              {cdnSearch.trim()
                                ? "No stored documents match your search query."
                                : storageFilter === "ssd"
                                ? "No notes currently stored on Server NVMe SSD disk. When students download notes, they are automatically cached to SSD in 1ms!"
                                : "No files currently cached in this pool."}
                            </td>
                          </tr>
                        ) : (
                          displayCdn.map((file) => (
                            <tr key={file.noteId} style={{ borderBottom: "1px solid #e2e8f0" }}>
                              <td style={{ padding: "10px 16px", color: "#0284c7", fontFamily: "var(--font-mono)", fontSize: "0.78rem", fontWeight: 700 }}>
                                {file.noteId}
                              </td>
                              <td style={{ padding: "10px 16px" }}>
                                {file.onDisk ? (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      padding: "2px 7px",
                                      borderRadius: "4px",
                                      fontWeight: 800,
                                      background: "#dcfce7",
                                      color: "#15803d",
                                      border: "1px solid #86efac",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px",
                                    }}
                                  >
                                    💽 Server SSD
                                  </span>
                                ) : file.inRam ? (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      padding: "2px 7px",
                                      borderRadius: "4px",
                                      fontWeight: 800,
                                      background: "#f3e8ff",
                                      color: "#7e22ce",
                                      border: "1px solid #d8b4fe",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px",
                                    }}
                                  >
                                    🧠 RAM Buffer
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      padding: "2px 7px",
                                      borderRadius: "4px",
                                      fontWeight: 800,
                                      background: "#e0f2fe",
                                      color: "#0369a1",
                                      border: "1px solid #7dd3fc",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "3px",
                                    }}
                                  >
                                    ⚡ Edge CDN
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "10px 16px" }}>
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    padding: "2px 7px",
                                    borderRadius: "4px",
                                    fontWeight: 800,
                                    background: file.fileType === "image" ? "#fef3c7" : "#e0f2fe",
                                    color: file.fileType === "image" ? "#b45309" : "#0284c7",
                                    border: file.fileType === "image" ? "1px solid #fcd34d" : "1px solid #bae6fd",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                  }}
                                >
                                  {file.typeLabel || (file.fileType === "image" ? "🖼️ IMG" : "📄 PDF")}
                                </span>
                              </td>
                              <td style={{ padding: "10px 16px", color: "#0f172a", fontWeight: 600 }}>
                                {file.title || "Academic Material"}
                              </td>
                              <td style={{ padding: "10px 16px", color: file.onDisk ? "#059669" : "#475569", fontWeight: file.onDisk ? 700 : 600 }}>
                                {file.diskSize ? `${(file.diskSize / 1048576).toFixed(2)} MB` : file.sizeFormatted || (file.size ? `${(file.size / 1048576).toFixed(2)} MB` : "Dynamic")}
                              </td>
                              <td style={{ padding: "10px 16px", textAlign: "right" }}>
                                <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                                  {file.onDisk && (
                                    <button
                                      onClick={() => handlePurgeSingleDiskFile(file.noteId)}
                                      className="btn-secondary"
                                      style={{ padding: "4px 8px", fontSize: "0.72rem", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2", fontWeight: 700, borderRadius: "6px" }}
                                      title="Delete only from Server NVMe SSD disk cache"
                                    >
                                      💽 Delete SSD
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handlePurgeSingleCdnFile(file.noteId)}
                                    className="btn-danger"
                                    style={{ padding: "4px 10px", fontSize: "0.72rem", background: "#dc2626", color: "#ffffff", border: "1.5px solid #b91c1c", borderRadius: "6px", fontWeight: 700, cursor: "pointer" }}
                                    title="Purge globally across Edge, Worker & RAM"
                                  >
                                    Purge All
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    {/* Pagination / Expand Footer (10 Notes Default) */}
                    {filteredCdn.length > 10 && (
                      <div style={{ padding: "10px 18px", borderTop: "1.5px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                        <span style={{ fontSize: "0.74rem", color: "#475569" }}>
                          Showing <strong>{displayCdn.length}</strong> of <strong>{filteredCdn.length}</strong> cached documents
                        </span>
                        <button
                          onClick={() => setShowAllCdnFiles(!showAllCdnFiles)}
                          className="btn-secondary"
                          style={{ padding: "5px 14px", fontSize: "0.76rem", fontWeight: 700, background: "#ffffff", color: "#334155", border: "1.5px solid #cbd5e1", borderRadius: "6px" }}
                        >
                          {showAllCdnFiles ? "▲ Show Top 10 Only" : `▼ Show All (${filteredCdn.length} Cached Notes)`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
  );
}

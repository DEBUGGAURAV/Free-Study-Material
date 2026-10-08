import React from "react";
import { LayoutGrid, List, Sparkles } from "lucide-react";

const SEMESTERS = ["All", "Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5", "Sem 6", "Sem 7", "Sem 8"];

export default function CategoryFilter({
  selectedSemester,
  setSelectedSemester,
  selectedBranch,
  setSelectedBranch,
  branches = [],
  totalCount,
  viewMode = "grid",
  setViewMode,
}) {
  const branchList = ["All", ...(branches.length > 0 ? branches : ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"])];

  return (
    <div className="control-bar-wrapper">
      {/* Semester Filter Tabs */}
      <div className="semester-tabs">
        {SEMESTERS.map((sem) => (
          <button
            key={sem}
            className={`filter-tab ${selectedSemester === sem ? "active" : ""}`}
            onClick={() => setSelectedSemester(sem)}
          >
            {sem}
          </button>
        ))}
      </div>

      {/* Dynamic Branch Chips & View Mode Switcher */}
      <div className="branch-chips-bar">
        <div className="branch-chips-list">
          {branchList.map((branch) => (
            <button
              key={branch}
              className={`branch-chip ${selectedBranch === branch ? "active" : ""}`}
              onClick={() => setSelectedBranch(branch)}
            >
              {branch}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* View Mode Switcher */}
          {setViewMode && (
            <div
              style={{
                display: "flex",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "2px",
                gap: "2px",
              }}
            >
              <button
                className={`btn-icon ${viewMode === "grid" ? "active" : ""}`}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  background: viewMode === "grid" ? "rgba(99, 102, 241, 0.25)" : "transparent",
                  color: viewMode === "grid" ? "var(--accent-indigo)" : "var(--text-dim)",
                }}
                onClick={() => setViewMode("grid")}
                title="Cards Grid View"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={`btn-icon ${viewMode === "table" ? "active" : ""}`}
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  background: viewMode === "table" ? "rgba(6, 182, 212, 0.25)" : "transparent",
                  color: viewMode === "table" ? "var(--accent-cyan)" : "var(--text-dim)",
                }}
                onClick={() => setViewMode("table")}
                title="Compact List View"
              >
                <List size={15} />
              </button>
            </div>
          )}

          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600 }}>
            Showing <span style={{ color: "#fff" }}>{totalCount}</span> notes
          </div>
        </div>
      </div>
    </div>
  );
}

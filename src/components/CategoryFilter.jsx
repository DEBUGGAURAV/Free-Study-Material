import React from "react";
import { LayoutGrid, List, Sparkles, GraduationCap, Calendar, Layers } from "lucide-react";

const COURSES = [
  "All Courses",
  "B.Tech",
  "BCA",
  "MCA",
  "Diploma",
  "M.Tech",
  "B.Sc",
  "Handwritten Notes",
  "Question Papers",
];

const YEARS = ["All Years", "1st Year", "2nd Year", "3rd Year", "4th Year"];

export default function CategoryFilter({
  selectedCourse = "All Courses",
  setSelectedCourse,
  selectedYear = "All Years",
  setSelectedYear,
  selectedBranch = "All",
  setSelectedBranch,
  branches = [],
  totalCount,
  viewMode = "grid",
  setViewMode,
}) {
  const branchList = ["All", ...(branches.length > 0 ? branches : ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"])];

  return (
    <div className="control-bar-wrapper">
      {/* Dynamic Course & Program Filter Bar (Replaced rigid Semester Scene) */}
      <div className="semester-tabs" style={{ display: "flex", alignItems: "center", gap: "8px", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent-cyan)", fontSize: "0.78rem", fontWeight: 700, paddingRight: "4px", flexShrink: 0 }}>
          <GraduationCap size={15} />
          <span>Course:</span>
        </div>
        {COURSES.map((course) => (
          <button
            key={course}
            className={`filter-tab ${selectedCourse === course ? "active" : ""}`}
            onClick={() => setSelectedCourse(course)}
          >
            {course}
          </button>
        ))}
      </div>

      {/* Year / Level Quick Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700, paddingRight: "4px", flexShrink: 0 }}>
          <Calendar size={13} />
          <span>Year / Level:</span>
        </div>
        {YEARS.map((yr) => (
          <button
            key={yr}
            onClick={() => setSelectedYear(yr)}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              fontWeight: 600,
              background: selectedYear === yr ? "rgba(99, 102, 241, 0.2)" : "transparent",
              color: selectedYear === yr ? "var(--accent-indigo)" : "var(--text-dim)",
              border: selectedYear === yr ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            {yr}
          </button>
        ))}
      </div>

      {/* Dynamic Branch / Department Chips & View Mode Switcher */}
      <div className="branch-chips-bar">
        <div className="branch-chips-list">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, marginRight: "4px" }}>
            <Layers size={13} />
            <span>Branch:</span>
          </div>
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

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
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

import React from "react";

const SEMESTERS = ["All", "Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5", "Sem 6", "Sem 7", "Sem 8"];

export default function CategoryFilter({
  selectedSemester,
  setSelectedSemester,
  selectedBranch,
  setSelectedBranch,
  branches = [],
  totalCount,
}) {
  const branchList = ["All", ...(branches.length > 0 ? branches : ["CSE", "IT", "ECE", "ME", "Civil", "BCA", "MCA", "AI/ML"])];

  return (
    <div className="control-bar-wrapper">
      {/* Semester Filter */}
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

      {/* Dynamic Branch Chips (Includes Custom User Branches) */}
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

        <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", fontWeight: 600 }}>
          Showing <span style={{ color: "#fff" }}>{totalCount}</span> notes
        </div>
      </div>
    </div>
  );
}

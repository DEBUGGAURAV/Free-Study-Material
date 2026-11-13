/**
 * Academic Metadata & Dynamic Subject Resolution Engine
 * Specially designed for B.Tech CSE, IT, and Engineering Programs
 */

// CSE and Core Engineering Comprehensive Subject Directory
const SUBJECT_PATTERNS = [
  // Algorithms & Programming
  { regex: /\b(DSA|DATA\s*STRUCTURES?(\s*(AND|&)\s*ALGORITHMS?)?|BINARY\s*(SEARCH\s*)?TREES?|BST|LINKED\s*LISTS?)\b/i, name: "Data Structures & Algorithms (DSA)" },
  { regex: /\b(DAA|DESIGN\s*(AND|&)\s*ANALYSIS\s*OF\s*ALGORITHMS?|ANALYSIS\s*(AND|&)\s*DESIGN\s*OF\s*ALGORITHMS?|ALGORITHMS?)\b/i, name: "Design & Analysis of Algorithms (DAA)" },
  { regex: /\b(PYTHON(\s*PROGRAMMING)?)\b/i, name: "Python Programming" },
  { regex: /\b(JAVA(\s*PROGRAMMING)?)\b/i, name: "Java Programming" },
  { regex: /\b(C\s*\+\+|CPP|C\s*PROGRAMMING)\b/i, name: "C / C++ Programming" },
  { regex: /\b(OOPS?|OBJECT\s*ORIENTED(\s*PROGRAMMING)?)\b/i, name: "Object Oriented Programming (OOP)" },

  // Security & Networks
  { regex: /\b(CRYPTO(GRAPHY)?|CNS|NETWORK\s*SECURITY|INFO(RMATION)?\s*SECURITY)\b/i, name: "Cryptography & Network Security (CNS)" },
  { regex: /\b(CYBER(\s*SECURITY)?|DIGITAL\s*FORENSICS?|ETHICAL\s*HACKING)\b/i, name: "Cyber Security & Digital Forensics" },
  { regex: /\b(CN|COMPUTER\s*NETWORKS?|NETWORKING)\b/i, name: "Computer Networks (CN)" },

  // AI & Data
  { regex: /\b(AI|ARTIFICIAL\s*INTELLIGENCE)\b/i, name: "Artificial Intelligence (AI)" },
  { regex: /\b(ML|MACHINE\s*LEARNING)\b/i, name: "Machine Learning (ML)" },
  { regex: /\b(DL|DEEP\s*LEARNING)\b/i, name: "Deep Learning (DL)" },
  { regex: /\b(NLP|NATURAL\s*LANGUAGE\s*PROCESSING)\b/i, name: "Natural Language Processing (NLP)" },
  { regex: /\b(DATA\s*SCIENCE|BIG\s*DATA|HADOOP)\b/i, name: "Data Science & Big Data" },

  // Systems & Architecture
  { regex: /\b(DBMS|DATABASE(\s*MANAGEMENT)?|SQL|RDBMS)\b/i, name: "Database Management Systems (DBMS)" },
  { regex: /\b(OS|OPERATING\s*SYSTEMS?)\b/i, name: "Operating Systems (OS)" },
  { regex: /\b(COA|COMPUTER\s*ORGANIZATION(\s*(AND|&)\s*ARCHITECTURE)?|COMPUTER\s*ARCHITECTURE)\b/i, name: "Computer Organization & Architecture (COA)" },
  { regex: /\b(CD|COMPILER(\s*DESIGN)?)\b/i, name: "Compiler Design (CD)" },
  { regex: /\b(TOC|THEORY\s*OF\s*COMPUTATION|AUTOMATA|FLAT|TAFL)\b/i, name: "Theory of Computation (TOC)" },
  { regex: /\b(DISTRIBUTED\s*SYSTEMS?|DISTRIBUTED\s*COMPUTING)\b/i, name: "Distributed Systems" },
  { regex: /\b(CLOUD(\s*COMPUTING)?|AWS|AZURE|DEVOPS)\b/i, name: "Cloud Computing" },

  // Web & Software
  { regex: /\b(WT|WEB\s*TECH(NOLOGY)?|WEB\s*DEVELOPMENT|FULL\s*STACK)\b/i, name: "Web Technology (WT)" },
  { regex: /\b(SE|SOFTWARE\s*ENG(INEERING)?)\b/i, name: "Software Engineering (SE)" },
  { regex: /\b(IOT|INTERNET\s*OF\s*THINGS)\b/i, name: "Internet of Things (IoT)" },
  { regex: /\b(BLOCKCHAIN|WEB3|CRYPTO\s*CURRENCY)\b/i, name: "Blockchain Architecture" },

  // Mathematics & Logic
  { regex: /\b(DSTL|DISCRETE\s*(STRUCTURES?|MATH(EMATICS)?|LOGIC))\b/i, name: "Discrete Structures & Theory of Logic (DSTL)" },
  { regex: /\b((ENG(INEERING)?\s*)?MATH(EMATICS|S)?(\s*[1-4IVX]+)?)\b/i, name: "Engineering Mathematics" },

  // Energy, Environmental & Open Electives
  { regex: /\b(RENEWABLE(\s*ENERGY(\s*RESOURCES?)?)?|ENERGY\s*RESOURCES?|NON[\s\-]*CONVENTIONAL\s*ENERGY)\b/i, name: "Renewable Energy Resources" },
  { regex: /\b(EVS|ENVIRONMENTAL(\s*STUDIES|\s*SCIENCE)?)\b/i, name: "Environmental Studies (EVS)" },

  // Humanities & Core
  { regex: /\b(UHV|UNIVERSAL\s*HUMAN\s*VALUES?)\b/i, name: "Universal Human Values (UHV)" },
  { regex: /\b(CONSTITUTION(\s*OF\s*INDIA)?|INDIAN\s*TRADITION)\b/i, name: "Indian Tradition & Constitution" },
];

/**
 * Normalizes any academic year string into standard UI category ("1st Year", "2nd Year", "3rd Year", "4th Year")
 */
function normalizeAcademicYear(raw = "") {
  const str = String(raw || "").trim();
  if (!str) return "";
  if (
    /\b(4TH|FOURTH|4|FINAL)\s*(YEAR|YR|YER)?\b/i.test(str) ||
    /\bYEAR\s*4\b/i.test(str) ||
    /\b(SEM|SEMESTER)\s*[78]\b/i.test(str) ||
    /\b[78](TH)?\s*(SEM|SEMESTER)\b/i.test(str)
  ) {
    return "4th Year";
  }
  if (
    /\b(3RD|THIRD|3)\s*(YEAR|YR|YER)?\b/i.test(str) ||
    /\bYEAR\s*3\b/i.test(str) ||
    /\b(SEM|SEMESTER)\s*[56]\b/i.test(str) ||
    /\b[56](TH)?\s*(SEM|SEMESTER)\b/i.test(str)
  ) {
    return "3rd Year";
  }
  if (
    /\b(2ND|SECOND|2)\s*(YEAR|YR|YER)?\b/i.test(str) ||
    /\bYEAR\s*2\b/i.test(str) ||
    /\b(SEM|SEMESTER)\s*[34]\b/i.test(str) ||
    /\b[34](RD|TH)?\s*(SEM|SEMESTER)\b/i.test(str)
  ) {
    return "2nd Year";
  }
  if (
    /\b(1ST|FIRST|1)\s*(YEAR|YR|YER)?\b/i.test(str) ||
    /\bYEAR\s*1\b/i.test(str) ||
    /\b(SEM|SEMESTER)\s*[12]\b/i.test(str) ||
    /\b[12](ST|ND)?\s*(SEM|SEMESTER)\b/i.test(str)
  ) {
    return "1st Year";
  }
  return "";
}

/**
 * Resolves a dynamic CSE subject from any string
 */
function resolveDynamicCseSubject(text = "") {
  if (!text) return null;
  const clean = text.replace(/[_.\-]+/g, " ").trim();
  for (const item of SUBJECT_PATTERNS) {
    if (item.regex.test(clean)) {
      return item.name;
    }
  }
  return null;
}

/**
 * Resolves Academic Year from Syllabus Subject heuristics (Universal across universities)
 */
function resolveYearFromSubject(subject = "", contextText = "") {
  if (!subject) return "";
  const s = String(subject).toUpperCase();
  const c = String(contextText || "").toUpperCase();

  if (
    s.includes("DISTRIBUTED SYSTEMS") ||
    s.includes("BLOCKCHAIN") ||
    s.includes("RENEWABLE ENERGY") ||
    s.includes("NLP") ||
    s.includes("NATURAL LANGUAGE")
  ) {
    return "4th Year";
  }

  if (s.includes("CLOUD") || s.includes("DEEP LEARNING")) {
    if (/[478]|FINAL/i.test(c)) return "4th Year";
    return "3rd Year";
  }

  if (
    s.includes("DSA") ||
    s.includes("DATA STRUCTURE") ||
    s.includes("DISCRETE") ||
    s.includes("COA") ||
    s.includes("COMPUTER ORGANIZATION") ||
    s.includes("DAA") ||
    s.includes("ALGORITHMS") ||
    s.includes("OPERATING SYSTEM") ||
    s.includes("DBMS") ||
    s.includes("DATABASE")
  ) {
    return "2nd Year";
  }

  if (
    s.includes("WEB TECH") ||
    s.includes("CNS") ||
    s.includes("CRYPTOGRAPHY") ||
    s.includes("COMPILER") ||
    s.includes("COMPUTER NETWORK") ||
    s.includes("ARTIFICIAL INTELLIGENCE") ||
    s.includes("MACHINE LEARNING") ||
    s.includes("DATA SCIENCE")
  ) {
    return "3rd Year";
  }

  if (
    s.includes("ENGINEERING MATHEMATICS") ||
    s.includes("MATH") ||
    s.includes("HUMAN VALUES") ||
    s.includes("UHV") ||
    s.includes("ENVIRONMENTAL") ||
    s.includes("EVS") ||
    s.includes("CONSTITUTION")
  ) {
    return "1st Year";
  }

  return "";
}

/**
 * Extracts Year and Subject directly from a Telegram Forum Topic title
 */
function parseTopicMetadata(threadTitle = "") {
  const raw = String(threadTitle || "").trim();
  if (!raw) return { year: "", subject: "" };

  let year = "";
  // 1. Detect Year / Semester in topic title
  if (
    /\b(4TH|FOURTH|FINAL)\s*(YEAR|YR|YER)?\b/i.test(raw) ||
    /\bYEAR\s*4\b/i.test(raw) ||
    /\b(SEM|SEMESTER)\s*[78]\b/i.test(raw) ||
    /\b[78](TH)?\s*(SEM|SEMESTER)\b/i.test(raw)
  ) {
    year = "4th Year";
  } else if (
    /\b(3RD|THIRD)\s*(YEAR|YR|YER)?\b/i.test(raw) ||
    /\bYEAR\s*3\b/i.test(raw) ||
    /\b(SEM|SEMESTER)\s*[56]\b/i.test(raw) ||
    /\b[56](TH)?\s*(SEM|SEMESTER)\b/i.test(raw)
  ) {
    year = "3rd Year";
  } else if (
    /\b(2ND|SECOND)\s*(YEAR|YR|YER)?\b/i.test(raw) ||
    /\bYEAR\s*2\b/i.test(raw) ||
    /\b(SEM|SEMESTER)\s*[34]\b/i.test(raw) ||
    /\b[34](RD|TH)?\s*(SEM|SEMESTER)\b/i.test(raw)
  ) {
    year = "2nd Year";
  } else if (
    /\b(1ST|FIRST)\s*(YEAR|YR|YER)?\b/i.test(raw) ||
    /\bYEAR\s*1\b/i.test(raw) ||
    /\b(SEM|SEMESTER)\s*[12]\b/i.test(raw) ||
    /\b[12](ST|ND)?\s*(SEM|SEMESTER)\b/i.test(raw)
  ) {
    year = "1st Year";
  }

  // 2. Extract Subject from topic title
  // A. Check canonical dictionary on raw topic
  let subject = resolveDynamicCseSubject(raw) || "";

  // B. If not found, strip Year, Semester, Course, and Noise to find subject
  if (!subject) {
    let clean = raw
      .replace(/[-_]+/g, " ")
      .replace(/\b(1ST|FIRST|2ND|SECOND|3RD|THIRD|4TH|FOURTH|FINAL)\s*(YEAR|YR|YER)?\b/gi, "")
      .replace(/\bYEAR\s*[1-4]\b/gi, "")
      .replace(/\b(SEM|SEMESTER)\s*[1-8]\b/gi, "")
      .replace(/\b[1-8](ST|ND|RD|TH)?\s*(SEM|SEMESTER)\b/gi, "")
      .replace(/\b(B\.?TECH|M\.?TECH|BCA|MCA|DIPLOMA|CSE?|IT|DEPARTMENT|BRANCH|SECTION|NOTES?|VAULT|MATERIALS?|FILES?|STUDY)\b/gi, "")
      .replace(/[():\-–—|/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (clean) {
      subject = resolveDynamicCseSubject(clean) || "";
      // If still not in directory, keep clean string as subject (min 3 chars, not generic noise)
      if (!subject && clean.length >= 3 && !/^(General|Chat|Group|Uploads|Misc|Folder)$/i.test(clean)) {
        subject = clean;
      }
    }
  }

  // 3. If year wasn't explicitly stated in topic, but topic provided a clear subject, infer year from syllabus!
  if (!year && subject) {
    year = resolveYearFromSubject(subject, raw);
  }

  return { year, subject };
}

/**
 * Extract Academic Metadata with intelligent priority:
 * 1. Caption overrides
 * 2. Forum Topic name (determines Year & Subject cleanly)
 * 3. Filename patterns (universal subject matching without university-specific codes)
 * 4. Group / Chat title
 */
function extractAcademicMetadata({ fileName = "", caption = "", chatTitle = "", threadTitle = "" }) {
  // 1. Sanitize file name for title (remove (1), [1], _LePic, and any subject code)
  let title = fileName.replace(/\.[^/.]+$/, "").trim() || "Academic Study Material";
  title = title.replace(/\s*\(\d+\)\s*$/, "").replace(/\s*\[\d+\]\s*$/, "");
  // Strip university-specific subject/course codes (e.g. KCS-501, CS301, BCS-301, KOE074, etc.)
  title = title.replace(/\b[A-Z]{2,5}\s*[-_]?\s*0?\d{2,4}[A-Z]?\b/gi, " ").trim();
  title = title.replace(/[_\-]+/g, " ").replace(/\bLePic\b/gi, "").replace(/\s+/g, " ").trim();

  let subject = "";
  let branch = "CSE";
  let course = "B.Tech";
  let year = "All Years";
  let explicitYear = "";

  // Check explicit caption lines
  if (caption) {
    const lines = caption.split("\n");
    for (const line of lines) {
      if (/^Title:\s*/i.test(line)) title = line.replace(/^Title:\s*/i, "").trim() || title;
      if (/^Subject:\s*/i.test(line)) subject = line.replace(/^Subject:\s*/i, "").trim();
      if (/^Branch:\s*/i.test(line)) branch = line.replace(/^Branch:\s*/i, "").trim().toUpperCase();
      if (/^Course:\s*/i.test(line)) course = line.replace(/^Course:\s*/i, "").trim();
      if (/^Year:\s*/i.test(line)) explicitYear = line.replace(/^Year:\s*/i, "").trim();
    }
  }

  // Parse Forum Topic metadata if threadTitle is provided
  const topicMeta = parseTopicMetadata(threadTitle);

  // 2. Resolve Subject if not explicitly set in caption
  if (!subject) {
    // A. Priority 1: Subject from Forum Topic Name
    if (topicMeta.subject) {
      subject = topicMeta.subject;
    }

    // B. Priority 2: Direct Subject Pattern Match in Filename
    if (!subject) {
      const fileSubject = resolveDynamicCseSubject(fileName);
      if (fileSubject) subject = fileSubject;
    }

    // C. Priority 3: Direct Subject Pattern Match in Caption
    if (!subject && caption) {
      const capSubject = resolveDynamicCseSubject(caption);
      if (capSubject) subject = capSubject;
    }

    // D. Priority 4: Check Chat / Group Title
    if (!subject && chatTitle && !/^(General|Chat|Group|Notes|Files)$/i.test(chatTitle.trim())) {
      const chatSubject = resolveDynamicCseSubject(chatTitle);
      if (chatSubject) {
        subject = chatSubject;
      } else if (!chatTitle.toLowerCase().includes("group")) {
        subject = `${chatTitle.trim()} Material`;
      }
    }

    // Default Fallback
    if (!subject) {
      subject = "Computer Science & Engineering Material";
    }
  }

  // 3. Resolve Branch
  const combined = `${fileName} ${caption} ${chatTitle} ${threadTitle}`.toUpperCase();
  if (/\b(ECE|ELECTRONICS?)\b/i.test(combined)) {
    branch = "ECE";
  } else if (/\b(ME|MECHANICAL)\b/i.test(combined)) {
    branch = "ME";
  } else if (/\b(CIVIL|CE)\b/i.test(combined)) {
    branch = "CIVIL";
  } else if (/\b(IT|INFORMATION\s*TECH(NOLOGY)?)\b/i.test(combined)) {
    branch = "IT";
  } else if (/\b(AIML|AI\s*&\s*ML|AI-ML)\b/i.test(combined)) {
    branch = "AIML";
  } else if (/\b(EE|ELECTRICAL)\b/i.test(combined)) {
    branch = "EE";
  } else {
    branch = "CSE";
  }

  // 4. Resolve Course / Degree
  if (combined.includes("BCA")) {
    course = "BCA";
  } else if (combined.includes("MCA")) {
    course = "MCA";
  } else if (combined.includes("DIPLOMA") || combined.includes("POLYTECHNIC")) {
    course = "Diploma";
  } else if (combined.includes("M.TECH") || combined.includes("MTECH")) {
    course = "M.Tech";
  } else {
    course = "B.Tech";
  }

  // 5. Resolve Academic Year
  const normalizedExplicit = normalizeAcademicYear(explicitYear);
  if (normalizedExplicit) {
    // Priority 1: Explicit Year from caption
    year = normalizedExplicit;
  } else if (topicMeta.year) {
    // Priority 2: Direct Year extracted from Topic Name!
    year = topicMeta.year;
  } else {
    // Priority 3: Check closest document indicators (filename + caption) - without subject codes!
    const docSpecific = `${fileName} ${caption}`.toUpperCase().replace(/[-_]+/g, " ");
    const normCombined = combined.replace(/[-_]+/g, " ");

    if (
      /\b(4TH|FOURTH|FINAL)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*4\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[78]\b/i.test(docSpecific) ||
      /\b[78](TH)?\s*(SEM|SEMESTER)\b/i.test(docSpecific)
    ) {
      year = "4th Year";
    } else if (
      /\b(3RD|THIRD)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*3\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[56]\b/i.test(docSpecific) ||
      /\b[56](TH)?\s*(SEM|SEMESTER)\b/i.test(docSpecific)
    ) {
      year = "3rd Year";
    } else if (
      /\b(2ND|SECOND)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*2\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[34]\b/i.test(docSpecific) ||
      /\b[34](RD|TH)?\s*(SEM|SEMESTER)\b/i.test(docSpecific)
    ) {
      year = "2nd Year";
    } else if (
      /\b(1ST|FIRST)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*1\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[12]\b/i.test(docSpecific) ||
      /\b[12](ST|ND)?\s*(SEM|SEMESTER)\b/i.test(docSpecific)
    ) {
      year = "1st Year";
    }
    // Priority 4: Check full combined string (group / channel title) - without subject codes!
    else if (
      /\b(4TH|FOURTH|FINAL)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*4\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[78]\b/i.test(normCombined) ||
      /\b[78](TH)?\s*(SEM|SEMESTER)\b/i.test(normCombined)
    ) {
      year = "4th Year";
    } else if (
      /\b(3RD|THIRD)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*3\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[56]\b/i.test(normCombined) ||
      /\b[56](TH)?\s*(SEM|SEMESTER)\b/i.test(normCombined)
    ) {
      year = "3rd Year";
    } else if (
      /\b(2ND|SECOND)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*2\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[34]\b/i.test(normCombined) ||
      /\b[34](RD|TH)?\s*(SEM|SEMESTER)\b/i.test(normCombined)
    ) {
      year = "2nd Year";
    } else if (
      /\b(1ST|FIRST)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*1\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[12]\b/i.test(normCombined) ||
      /\b[12](ST|ND)?\s*(SEM|SEMESTER)\b/i.test(normCombined)
    ) {
      year = "1st Year";
    } else {
      // Priority 5: Intelligent heuristic based on syllabus subject curriculum
      const inferred = resolveYearFromSubject(subject, normCombined);
      if (inferred) {
        year = inferred;
      }
    }
  }

  return { title, subject, branch, course, year };
}

module.exports = {
  SUBJECT_PATTERNS,
  normalizeAcademicYear,
  resolveDynamicCseSubject,
  resolveYearFromSubject,
  parseTopicMetadata,
  extractAcademicMetadata,
};

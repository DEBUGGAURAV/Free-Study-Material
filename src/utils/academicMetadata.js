/**
 * Academic Metadata & Dynamic Subject Resolution Engine
 * Specially designed for B.Tech CSE, IT, and Engineering Programs
 */

// CSE and Core Engineering Comprehensive Subject Directory
const SUBJECT_PATTERNS = [
  // Algorithms & Programming
  { regex: /\b(DAA|ALGORITHMS?|DESIGN\s*(AND|&)\s*ANALYSIS\s*OF\s*ALGORITHMS?)\b/i, name: "Design & Analysis of Algorithms (DAA)" },
  { regex: /\b(DSA|DATA\s*STRUCTURES?(\s*(AND|&)\s*ALGORITHMS?)?)\b/i, name: "Data Structures & Algorithms (DSA)" },
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
  { regex: /\b(ENG(INEERING)?\s*MATH(EMATICS)?|MATHS?(\s*[1-4IVX]+)?)\b/i, name: "Engineering Mathematics" },

  // Energy, Environmental & Open Electives
  { regex: /\b(RENEWABLE(\s*ENERGY(\s*RESOURCES?)?)?|ENERGY\s*RESOURCES?|NON[\s\-]*CONVENTIONAL\s*ENERGY)\b/i, name: "Renewable Energy Resources" },
  { regex: /\b(EVS|ENVIRONMENTAL(\s*STUDIES|\s*SCIENCE)?)\b/i, name: "Environmental Studies (EVS)" },

  // Humanities & Core
  { regex: /\b(UHV|UNIVERSAL\s*HUMAN\s*VALUES?)\b/i, name: "Universal Human Values (UHV)" },
  { regex: /\b(KNC|CONSTITUTION(\s*OF\s*INDIA)?|INDIAN\s*TRADITION)\b/i, name: "Indian Tradition & Constitution" },
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
  const clean = text.trim();
  for (const item of SUBJECT_PATTERNS) {
    if (item.regex.test(clean)) {
      return item.name;
    }
  }
  return null;
}

/**
 * Extract Academic Metadata with intelligent priority:
 * 1. Caption overrides
 * 2. Topic/Subgroup name (highest weight for subject)
 * 3. Filename patterns (CSE subject matching)
 * 4. Group / Chat title
 */
function extractAcademicMetadata({ fileName = "", caption = "", chatTitle = "", threadTitle = "" }) {
  // 1. Sanitize file name for title (remove (1), [1], _LePic, etc.)
  let title = fileName.replace(/\.[^/.]+$/, "").trim() || "Academic Study Material";
  title = title.replace(/\s*\(\d+\)\s*$/, "").replace(/\s*\[\d+\]\s*$/, "");
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

  // 2. Resolve Subject if not explicitly set in caption
  if (!subject) {
    // A. Priority to Subgroup / Forum Topic Title
    if (threadTitle && !/^(General|Chat|Group|Notes|Files|ABC)$/i.test(threadTitle.trim())) {
      const topicSubject = resolveDynamicCseSubject(threadTitle);
      if (topicSubject) {
        subject = topicSubject;
      } else {
        subject = threadTitle.trim();
      }
    }

    // B. Check Filename
    if (!subject) {
      const fileSubject = resolveDynamicCseSubject(fileName);
      if (fileSubject) {
        subject = fileSubject;
      }
    }

    // C. Check Caption
    if (!subject && caption) {
      const capSubject = resolveDynamicCseSubject(caption);
      if (capSubject) {
        subject = capSubject;
      }
    }

    // D. Check Chat / Group Title
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
    year = normalizedExplicit;
  } else {
    // Check closest document indicators first (filename + caption)
    const docSpecific = `${fileName} ${caption}`.toUpperCase().replace(/[-_]+/g, " ");
    const normCombined = combined.replace(/[-_]+/g, " ");

    // Priority 1: Check document-specific text FIRST for 4th Year / Final Year / 3rd / 2nd / 1st
    // (Evaluating 4th Year first prevents "3rd Year" chat/topic titles from corrupting 4th year uploads)
    if (
      /\b(4TH|FOURTH|FINAL)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*4\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[78]\b/i.test(docSpecific) ||
      /\b[78](TH)?\s*(SEM|SEMESTER)\b/i.test(docSpecific) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[78]\d{1,2}\b/i.test(docSpecific)
    ) {
      year = "4th Year";
    } else if (
      /\b(3RD|THIRD)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*3\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[56]\b/i.test(docSpecific) ||
      /\b[56](TH)?\s*(SEM|SEMESTER)\b/i.test(docSpecific) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[56]\d{1,2}\b/i.test(docSpecific)
    ) {
      year = "3rd Year";
    } else if (
      /\b(2ND|SECOND)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*2\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[34]\b/i.test(docSpecific) ||
      /\b[34](RD|TH)?\s*(SEM|SEMESTER)\b/i.test(docSpecific) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[34]\d{1,2}\b/i.test(docSpecific)
    ) {
      year = "2nd Year";
    } else if (
      /\b(1ST|FIRST)\s*(YEAR|YR|YER)?\b/i.test(docSpecific) ||
      /\bYEAR\s*1\b/i.test(docSpecific) ||
      /\b(SEM|SEMESTER)\s*[12]\b/i.test(docSpecific) ||
      /\b[12](ST|ND)?\s*(SEM|SEMESTER)\b/i.test(docSpecific) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[12]\d{1,2}\b/i.test(docSpecific)
    ) {
      year = "1st Year";
    }
    // Priority 2: Check full combined string (forum topic / supergroup title)
    else if (
      /\b(4TH|FOURTH|FINAL)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*4\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[78]\b/i.test(normCombined) ||
      /\b[78](TH)?\s*(SEM|SEMESTER)\b/i.test(normCombined) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[78]\d{1,2}\b/i.test(normCombined)
    ) {
      year = "4th Year";
    } else if (
      /\b(3RD|THIRD)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*3\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[56]\b/i.test(normCombined) ||
      /\b[56](TH)?\s*(SEM|SEMESTER)\b/i.test(normCombined) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[56]\d{1,2}\b/i.test(normCombined)
    ) {
      year = "3rd Year";
    } else if (
      /\b(2ND|SECOND)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*2\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[34]\b/i.test(normCombined) ||
      /\b[34](RD|TH)?\s*(SEM|SEMESTER)\b/i.test(normCombined) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[34]\d{1,2}\b/i.test(normCombined)
    ) {
      year = "2nd Year";
    } else if (
      /\b(1ST|FIRST)\s*(YEAR|YR|YER)?\b/i.test(normCombined) ||
      /\bYEAR\s*1\b/i.test(normCombined) ||
      /\b(SEM|SEMESTER)\s*[12]\b/i.test(normCombined) ||
      /\b[12](ST|ND)?\s*(SEM|SEMESTER)\b/i.test(normCombined) ||
      /\b(KCS|BCS|BAS|KAS|KOE|KIT|KEC|KME|KHU|BHU|BOE)\s*0?[12]\d{1,2}\b/i.test(normCombined)
    ) {
      year = "1st Year";
    } else {
      // Priority 3: Intelligent heuristic based on syllabus subject curriculum
      if (
        subject.includes("Distributed Systems") ||
        subject.includes("Blockchain") ||
        subject.includes("Renewable Energy") ||
        subject.includes("NLP") ||
        subject.includes("Natural Language")
      ) {
        year = "4th Year";
      } else if (
        subject.includes("Cloud") ||
        subject.includes("Deep Learning")
      ) {
        if (/[478]|FINAL/i.test(normCombined)) {
          year = "4th Year";
        } else {
          year = "3rd Year";
        }
      } else if (
        subject.includes("DSA") ||
        subject.includes("Discrete") ||
        subject.includes("COA") ||
        subject.includes("DAA") ||
        subject.includes("Operating Systems") ||
        subject.includes("DBMS")
      ) {
        year = "2nd Year";
      } else if (
        subject.includes("Web Tech") ||
        subject.includes("CNS") ||
        subject.includes("Cryptography") ||
        subject.includes("Compiler") ||
        subject.includes("Computer Networks") ||
        subject.includes("Artificial Intelligence") ||
        subject.includes("Machine Learning") ||
        subject.includes("Data Science")
      ) {
        year = "3rd Year";
      }
    }
  }

  return { title, subject, branch, course, year };
}

module.exports = {
  SUBJECT_PATTERNS,
  resolveDynamicCseSubject,
  extractAcademicMetadata,
};

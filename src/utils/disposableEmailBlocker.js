/**
 * 🛡️ Autonomous Strict Disposable & Burner Email Defense Engine
 * Protects platform from disposable/burner email services (10minutemail, tempmail, guerrillamail, mailinator, etc.)
 * Strictly enforces that students use authentic personal email (Gmail, Outlook, Yahoo, Apple, Proton, etc.)
 * or official accredited academic/university email (.edu, .ac.in, .org.in, etc.).
 */

const dns = require("dns").promises;

// 1. Load community database of 121,500+ disposable domains with safe fallback
let communityDisposableDomains = [];
try {
  communityDisposableDomains = require("disposable-email-domains");
} catch (_) {
  communityDisposableDomains = [];
}

// 2. High-Priority Curated Burner / Tempmail Domain Set (121,500+ domains)
const DISPOSABLE_DOMAINS = new Set([
  ...communityDisposableDomains,
  // 10MinuteMail & Dynamic Burner Domains
  "vtmpj.com", "tmail.ws", "tp-mail.com", "10minutemail.com", "10minutemail.net", "10minutemail.org", "10minutemail.co.uk",
  "10mail.org", "20minutemail.it", "zehnminutenmail.de", "0clickemail.com", "0-mail.com", "33mail.com",
  // TempMail & Temp-Mail Variants
  "tempmail.com", "tempmail.net", "tempmail.org", "temp-mail.org", "temp-mail.io", "tempmailo.com", "tempail.com",
  "tmpmail.net", "tmpmail.org", "mytemp.email", "temporaryemail.net", "temporarymail.com", "tempinbox.com",
  "temporaryforwarding.com", "temporaryinbox.com", "tempmailaddress.com",
  // GuerrillaMail
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamailblock.com",
  "grr.la", "sharklasers.com", "pokemail.net", "spam4.me", "guerillamail.com", "guerillamail.org", "guerillamail.net",
  // Mailinator & Yopmail
  "mailinator.com", "mailinator.net", "mailinater.com", "suremail.info", "zippymail.info",
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "courriel.fr.nf",
  // Other Popular Throwaway Services
  "throwawaymail.com", "fakemailgenerator.com", "dispostable.com", "trashmail.com", "trashmail.net", "trashmail.org",
  "trashmail.me", "trash-mail.com", "trash-me.com", "trashcanmail.com", "trashmail.at", "trashmailer.com",
  "getnada.com", "abovethecloud.top", "nada.ltd", "nada.email", "inboxbear.com", "burner.kiwi", "burnermales.com",
  "inboxkitten.com", "crazymailing.com", "dropmail.me", "mohmal.com", "mohmal.in", "mohmal.im", "mohmal.tech",
  "burnermail.io", "emailondeck.com", "generator.email", "mytrashmail.com", "disposablemail.com", "disposable.ws",
  "maildrop.cc", "harakirimail.com", "fakeinbox.com", "fakemail.net", "mailnesia.com", "mintemail.com",
  "trashforce.com", "disbox.org", "disbox.net", "boun.cr", "cuvox.de", "dayrep.com", "einrot.com", "fleckens.hu",
  "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "armyspy.com", "speedpost.net",
  "luxusmail.org", "emailfake.com", "internxt.com", "muellmail.com", "wegwerfemail.de", "anonbox.net",
  "discard.email", "discardmail.com", "discardmail.de", "disposableaddress.com", "dodgeit.com", "dodgit.com",
  "drdrb.net", "dumpmail.de", "e4ward.com", "easytrashmail.com", "email60.com", "emailias.com", "emailmiser.com",
  "emailproxsy.com", "emailsensei.com", "emailtemporario.com.br", "ephemail.net", "etranquil.com", "eyepaste.com",
  "fastchemail.com", "filzmail.com", "fixmail.it", "getairmail.com", "getonemail.com", "gishpuppy.com",
  "haltospam.com", "incognitomail.org", "instant-mail.de", "jetable.org", "kasmail.com", "klzlk.com",
  "kurzepost.de", "letthemeatspam.com", "lhsdv.com", "lifebyfood.com", "link2mail.net", "lookugly.com",
  "lortemail.dk", "lr-online.de", "m-h.im", "mail-temporaire.fr", "mail-temporaire.net", "mailbidon.com",
  "mailcatch.com", "mailcleaner.de", "mailcube.net", "maileater.com", "mailexpire.com", "mailhazard.com",
  "mailhazard.us", "mailimate.com", "mailinblack.com", "mailmoat.com", "mailnull.com", "mailquack.com",
  "mailshell.com", "mailslite.com", "mailtothis.com", "mailzilla.org", "meltmail.com", "messagebeamer.de",
  "mycleaninbox.com", "myspamkiller.com", "netmails.net", "no-spam.ws", "noclickemail.com", "nomail.xl.cx",
  "nospam.ze.tc", "nospam4.us", "nospamfor.us", "nospamthanks.info", "notsharingmy.info", "nowmymail.com",
  "objectmail.com", "oneoffemail.com", "onetimeemail.com", "owlpic.com", "pookmail.com", "privacy.net",
  "pwrby.com", "quickinbox.com", "rcpt.at", "recode.me", "refdesk.com", "safe-mail.net", "safersignup.com",
  "safetypost.de", "saynotospams.com", "shieldmail.com", "shiftmail.com", "shortmail.net", "sneakemail.com",
  "sogetthis.com", "soodonims.com", "spam.la", "spambob.com", "spambob.net", "spambob.org", "spambog.com",
  "spambog.de", "spambog.ru", "spambox.us", "spamcan.org", "spamday.com", "spamfree24.org", "spamgourmet.com",
  "spamhole.com", "spaminator.de", "spaml.com", "spaml.de", "spammotel.com", "spamspot.com", "spamstack.net",
  "spamtrap.ro", "squizzy.de", "tafmail.com", "teewars.org", "thankyou2010.com", "thisisnotmyrealemail.com",
  "throwawayemailaddress.com", "trash-attac.de", "trash-mail.at", "twinmail.de", "uggsrock.com", "undisclosed.org",
  "upgradedmail.com", "validmail.org", "veryrealemail.com", "vidavee.com", "vmani.com", "warprecords.com",
  "wegwerfadresse.de", "whyspam.me", "willselfdestruct.com", "wuzupmail.net", "xagloo.com", "xemaps.com",
  "xents.com", "xmaily.com", "xoxy.net", "yellowstone.net", "yep.it", "yogamaven.com", "yuurok.com",
  "zoemail.org", "zxcvbnm.co.uk"
]);

// 3. Trusted Major Public Email Providers (Instant 0ms Whitelist)
const TRUSTED_PUBLIC_PROVIDERS = new Set([
  // Google
  "gmail.com", "googlemail.com",
  // Microsoft
  "outlook.com", "outlook.in", "hotmail.com", "live.com", "msn.com", "hotmail.co.uk", "hotmail.fr", "live.in",
  // Yahoo
  "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com", "rocketmail.com", "yahoo.co.uk", "yahoo.ca",
  // Apple
  "icloud.com", "me.com", "mac.com",
  // Proton
  "proton.me", "protonmail.com",
  // Zoho
  "zoho.com", "zohomail.in", "zoho.in",
  // Recognized Personal Portals
  "aol.com", "rediffmail.com", "gmx.com", "gmx.net", "mail.com"
]);

// 4. Accredited Academic & University Domain TLD Regex
// Recognizes all standard educational institutions (.edu, .edu.*, .ac.in, .ac.*, .org.in, .res.in, .ernet.in, .gov.in)
const ACADEMIC_DOMAIN_REGEX = /(?:\.edu(?:\.[a-z]{2})?|\.ac\.[a-z]{2,}|\.org\.in|\.res\.in|\.ernet\.in|\.gov\.in)$/i;

// 5. Suspicious Burner Domain & MX Host Patterns
const DISPOSABLE_KEYWORDS_REGEX = /(?:temp[-_.]?mail|disposable|throwaway|10minute|fake[-_.]?mail|burner|guerrilla|trash[-_.]?mail|yopmail|mailinator|dropmail|inboxkitten|vtmpj|sharklasers|dispostable|mohmal|getnada|emailondeck|generator\.email|disbox|mytemp|speedpost|luxusmail|fakemail)/i;
const SUSPICIOUS_MX_REGEX = /(?:10minute|temp[-_.]?mail|mailinator|guerrilla|sharklasers|trash|burner|dispos|yopmail|fake[-_.]?mail|dropmail|inboxkitten|nada|getnada|mohmal|crazymailing|emailondeck|generator\.email|disbox|mytemp|speedpost)/i;

// Standard RFC-5322 compliant regex for student emails
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// In-Memory MX Cache for DNS lookups (TTL 24 hours)
const mxDnsCache = new Map();
const MX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Checks if an email address belongs to a disposable/burner service
 * @param {string} email
 * @returns {boolean}
 */
function isDisposableEmail(email) {
  if (!email || typeof email !== "string") return true;
  const clean = email.trim().toLowerCase();
  const parts = clean.split("@");
  if (parts.length !== 2) return true;
  const domain = parts[1].trim();

  // 1. Direct match in 121,500+ disposable domain database
  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  // 2. Keyword heuristic on domain
  if (DISPOSABLE_KEYWORDS_REGEX.test(domain)) return true;

  // 3. Subdomain checks for major burner services
  const knownRoots = ["mailinator.com", "yopmail.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "vtmpj.com", "dispostable.com"];
  for (const root of knownRoots) {
    if (domain.endsWith(`.${root}`)) return true;
  }

  // 4. If domain is a recognized public email provider -> Valid (not disposable)
  if (TRUSTED_PUBLIC_PROVIDERS.has(domain)) return false;

  // 5. If domain matches official educational/university TLD (.edu, .ac.in, .org.in) -> Valid
  if (ACADEMIC_DOMAIN_REGEX.test(domain)) return false;

  // 6. Any other unrecognized/unverified custom domain is treated as prohibited burner domain
  return true;
}

/**
 * Asynchronously performs deep MX record inspection for custom domains
 * @param {string} domain
 * @returns {Promise<{ isBurnerMx: boolean, hasMx: boolean, reason?: string }>}
 */
async function checkDomainMxRecords(domain) {
  if (!domain || typeof domain !== "string") return { isBurnerMx: true, hasMx: false, reason: "Invalid domain" };
  const cleanDomain = domain.trim().toLowerCase();

  // Check cache
  const cached = mxDnsCache.get(cleanDomain);
  if (cached && Date.now() - cached.timestamp < MX_CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    const records = await dns.resolveMx(cleanDomain);
    if (!records || records.length === 0) {
      const res = { isBurnerMx: true, hasMx: false, reason: "No mail exchange (MX) records found for domain" };
      mxDnsCache.set(cleanDomain, { timestamp: Date.now(), result: res });
      return res;
    }

    // Inspect each MX exchange server host
    for (const record of records) {
      const exchange = (record.exchange || "").toLowerCase();
      if (SUSPICIOUS_MX_REGEX.test(exchange) || DISPOSABLE_DOMAINS.has(exchange)) {
        const res = { isBurnerMx: true, hasMx: true, reason: `Mail server (${exchange}) belongs to a temporary email provider` };
        mxDnsCache.set(cleanDomain, { timestamp: Date.now(), result: res });
        return res;
      }
    }

    const res = { isBurnerMx: false, hasMx: true };
    mxDnsCache.set(cleanDomain, { timestamp: Date.now(), result: res });
    return res;
  } catch (err) {
    const res = { isBurnerMx: true, hasMx: false, reason: `DNS MX check failed: ${err.code || err.message}` };
    mxDnsCache.set(cleanDomain, { timestamp: Date.now(), result: res });
    return res;
  }
}

/**
 * Validates student email strictly:
 * 1. Proper formatting & length
 * 2. Absolute prohibition on temporary/disposable domains
 * 3. Requires authentic personal mail (Gmail, Outlook, Yahoo) or university email (.edu, .ac.in)
 * @param {string} email
 * @returns {{ isValid: boolean, error?: string, normalizedEmail?: string, tier?: string }}
 */
function validateStudentEmail(email) {
  if (!email || typeof email !== "string") {
    return { isValid: false, error: "Email address is mandatory." };
  }

  const clean = email.trim().toLowerCase();

  if (clean.length > 254) {
    return { isValid: false, error: "Email address is too long (maximum 254 characters)." };
  }

  if (!EMAIL_REGEX.test(clean)) {
    return { isValid: false, error: "Please enter a valid personal email (e.g. Gmail, Outlook, Yahoo) or official college email (.edu, .ac.in)." };
  }

  const parts = clean.split("@");
  if (parts.length !== 2) {
    return { isValid: false, error: "Invalid email address structure." };
  }

  const domain = parts[1].trim();
  if (!domain || !domain.includes(".")) {
    return { isValid: false, error: "Invalid email domain format." };
  }

  // Check if disposable / burner
  if (isDisposableEmail(clean)) {
    return {
      isValid: false,
      error: "Temporary / disposable emails (e.g. tempmail, 10minutemail, mailinator) are strictly prohibited. Please use an authentic email address (Gmail, Outlook, Yahoo, or your official college email).",
    };
  }

  const isTrusted = TRUSTED_PUBLIC_PROVIDERS.has(domain);
  const isAcademic = ACADEMIC_DOMAIN_REGEX.test(domain);

  return {
    isValid: true,
    normalizedEmail: clean,
    tier: isTrusted ? "Trusted Public Provider" : (isAcademic ? "Academic Institution" : "Standard"),
  };
}

/**
 * Asynchronous student email validator with Live DNS MX resolution
 * @param {string} email
 * @returns {Promise<{ isValid: boolean, error?: string, normalizedEmail?: string }>}
 */
async function validateStudentEmailAsync(email) {
  const syncResult = validateStudentEmail(email);
  if (!syncResult.isValid) return syncResult;

  const domain = syncResult.normalizedEmail.split("@")[1];
  // Fast path for trusted providers: no need for external DNS lookup
  if (TRUSTED_PUBLIC_PROVIDERS.has(domain)) {
    return syncResult;
  }

  // Deep MX validation for academic or institutional domains
  const mxCheck = await checkDomainMxRecords(domain);
  if (mxCheck.isBurnerMx || !mxCheck.hasMx) {
    return {
      isValid: false,
      error: "Temporary / unverified email domains are strictly prohibited. Please use an authentic personal email (Gmail, Outlook, Yahoo) or your official college email.",
    };
  }

  return syncResult;
}

module.exports = {
  isDisposableEmail,
  validateStudentEmail,
  validateStudentEmailAsync,
  checkDomainMxRecords,
  DISPOSABLE_DOMAINS,
  TRUSTED_PUBLIC_PROVIDERS,
  ACADEMIC_DOMAIN_REGEX,
};

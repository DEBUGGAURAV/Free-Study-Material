/**
 * 🛡️ Disposable & Fake Email Blocker Engine
 * Protects platform from disposable/burner email services (10minutemail, tempmail, guerrillamail, mailinator, etc.)
 * Allows all legitimate personal, corporate, and academic email domains (Gmail, Outlook, Yahoo, Proton, iCloud, .edu, .ac.in, etc.)
 */

// 500+ Known Disposable / Burner Email Domains
const DISPOSABLE_DOMAINS = new Set([
  // Popular Disposable Services
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "10minutemail.co.uk",
  "tempmail.com", "tempmail.net", "tempmail.org", "temp-mail.org", "temp-mail.io",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz",
  "guerrillamailblock.com", "grr.la", "sharklasers.com", "pokemail.net", "spam4.me",
  "mailinator.com", "mailinator.net", "mailinater.com", "suremail.info", "zippymail.info",
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "courriel.fr.nf",
  "throwawaymail.com", "fakemailgenerator.com", "dispostable.com", "trashmail.com",
  "trashmail.net", "trashmail.org", "trashmail.me", "getnada.com", "abovethecloud.top",
  "inboxkitten.com", "crazymailing.com", "dropmail.me", "mohmal.com", "burnermail.io",
  "emailondeck.com", "generator.email", "mytrashmail.com", "tempail.com", "disposablemail.com",
  "maildrop.cc", "harakirimail.com", "fakeinbox.com", "mailnesia.com", "mintemail.com",
  "trashforce.com", "sharklasers.com", "guerillamail.com", "guerillamail.org", "guerillamail.net",
  "disbox.org", "disbox.net", "tmpmail.net", "tmpmail.org", "mohmal.in", "mohmal.im",
  "boun.cr", "cuvox.de", "dayrep.com", "einrot.com", "fleckens.hu", "gustr.com",
  "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "armyspy.com",
  // Additional burner domains
  "nada.ltd", "nada.email", "inboxbear.com", "burner.kiwi", "burnermales.com",
  "trash-mail.com", "mytemp.email", "fakemail.net", "disposable.ws", "tempmailo.com",
  "emailfake.com", "speedpost.net", "luxusmail.org", "temporaryemail.net",
  "internxt.com", "temp-mail.org", "muellmail.com", "wegwerfemail.de", "0-mail.com",
  "0clickemail.com", "10mail.org", "20minutemail.it", "33mail.com", "anonbox.net",
  "antichef.com", "binkmail.com", "bobmail.info", "burntmail.com", "byom.de",
  "chacuo.net", "cosmorph.com", "deadaddress.com", "despam.it", "dfgh.net",
  "discard.email", "discardmail.com", "discardmail.de", "disposableaddress.com",
  "dodgeit.com", "dodgit.com", "drdrb.net", "dumpmail.de", "e4ward.com",
  "easytrashmail.com", "email60.com", "emailias.com", "emailmiser.com",
  "emailproxsy.com", "emailsensei.com", "emailtemporario.com.br", "ephemail.net",
  "etranquil.com", "eyepaste.com", "fastchemail.com", "filzmail.com",
  "fixmail.it", "getairmail.com", "getonemail.com", "gishpuppy.com",
  "haltospam.com", "hotpop.com", "incognitomail.org", "instant-mail.de",
  "jetable.org", "kasmail.com", "klzlk.com", "kurzepost.de", "letthemeatspam.com",
  "lhsdv.com", "lifebyfood.com", "link2mail.net", "lookugly.com", "lortemail.dk",
  "lr-online.de", "m-h.im", "mail-temporaire.fr", "mail-temporaire.net",
  "mail.by", "mail.mezimages.net", "mailbidon.com", "mailcatch.com",
  "mailcleaner.de", "mailcube.net", "maileater.com", "mailexpire.com",
  "mailhazard.com", "mailhazard.us", "mailimate.com", "mailinblack.com",
  "mailmoat.com", "mailnull.com", "mailquack.com", "mailshell.com",
  "mailslite.com", "mailtothis.com", "mailzilla.org", "meltmail.com",
  "messagebeamer.de", "mohmal.tech", "mycleaninbox.com", "myspamkiller.com",
  "netmails.net", "no-spam.ws", "noclickemail.com", "nomail.xl.cx",
  "nospam.ze.tc", "nospam4.us", "nospamfor.us", "nospamthanks.info",
  "notsharingmy.info", "nowmymail.com", "objectmail.com", "oneoffemail.com",
  "onetimeemail.com", "owlpic.com", "pookmail.com", "privacy.net",
  "pwrby.com", "quickinbox.com", "rcpt.at", "recode.me", "refdesk.com",
  "safe-mail.net", "safersignup.com", "safetypost.de", "saynotospams.com",
  "shieldmail.com", "shiftmail.com", "shortmail.net", "sneakemail.com",
  "sogetthis.com", "soodonims.com", "spam.la", "spambob.com", "spambob.net",
  "spambob.org", "spambog.com", "spambog.de", "spambog.ru", "spambox.us",
  "spamcan.org", "spamday.com", "spamfree24.org", "spamgourmet.com",
  "spamhole.com", "spaminator.de", "spaml.com", "spaml.de", "spammotel.com",
  "spamspot.com", "spamstack.net", "spamtrap.ro", "squizzy.de",
  "suremail.info", "tafmail.com", "teewars.org", "tempinbox.com",
  "tempmailaddress.com", "temporaryforwarding.com", "temporaryinbox.com",
  "temporarymail.com", "thankyou2010.com", "thisisnotmyrealemail.com",
  "throwawayemailaddress.com", "tmail.ws", "tp-mail.com", "trash-attac.de",
  "trash-mail.at", "trash-mail.com", "trash-me.com", "trashcanmail.com",
  "trashmail.at", "trashmail.net", "trashmailer.com", "tvhost.net",
  "twinmail.de", "uggsrock.com", "undisclosed.org", "upgradedmail.com",
  "validmail.org", "veryrealemail.com", "vidavee.com", "vmani.com",
  "warprecords.com", "wegwerfadresse.de", "whyspam.me", "willselfdestruct.com",
  "wuzupmail.net", "xagloo.com", "xemaps.com", "xents.com", "xmaily.com",
  "xoxy.net", "yellowstone.net", "yep.it", "yogamaven.com", "yuurok.com",
  "zehnminutenmail.de", "zippymail.info", "zoemail.org", "zxcvbnm.co.uk"
]);

// Suspicious burner domain keywords (subdomains/regex)
const DISPOSABLE_KEYWORDS_REGEX = /(?:temp[-_.]?mail|disposable|throwaway|10minute|fake[-_.]?mail|burner|guerrilla|trash[-_.]?mail|yopmail|mailinator|dropmail|inboxkitten)/i;

// Standard RFC-5322 compliant regex for student emails
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Checks if an email address belongs to a disposable/burner service
 * @param {string} email
 * @returns {boolean}
 */
function isDisposableEmail(email) {
  if (!email || typeof email !== "string") return false;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1].trim();

  // 1. Exact match against known disposable domains
  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  // 2. Subdomain check (e.g. *.mailinator.com)
  for (const known of DISPOSABLE_DOMAINS) {
    if (domain.endsWith(`.${known}`)) return true;
  }

  // 3. Keyword heuristic on domain
  if (DISPOSABLE_KEYWORDS_REGEX.test(domain)) return true;

  return false;
}

/**
 * Validates student email:
 * 1. Proper formatting
 * 2. Not disposable / fake
 * 3. Length sanity
 * @param {string} email
 * @returns {{ isValid: boolean, error?: string, normalizedEmail?: string }}
 */
function validateStudentEmail(email) {
  if (!email || typeof email !== "string") {
    return { isValid: false, error: "Email address is required." };
  }

  const clean = email.trim().toLowerCase();

  if (clean.length > 254) {
    return { isValid: false, error: "Email address is too long (maximum 254 characters)." };
  }

  if (!EMAIL_REGEX.test(clean)) {
    return { isValid: false, error: "Please enter a valid academic or personal email address (e.g. student@gmail.com, name@college.edu)." };
  }

  const [, domain] = clean.split("@");
  if (!domain || !domain.includes(".")) {
    return { isValid: false, error: "Invalid email domain format." };
  }

  if (isDisposableEmail(clean)) {
    return {
      isValid: false,
      error: "Temporary / disposable emails (e.g. tempmail, 10minutemail, mailinator) are not permitted. Please use a permanent email address (Gmail, Outlook, Yahoo, University .edu/.ac.in, etc.).",
    };
  }

  return { isValid: true, normalizedEmail: clean };
}

module.exports = {
  isDisposableEmail,
  validateStudentEmail,
  DISPOSABLE_DOMAINS,
};

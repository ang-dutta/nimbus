/**
 * Scanner A: API Key & Credential Exposure Scanner
 *
 * Scans text file content for secrets, API keys, and credentials.
 * Returns an array of findings with severity, line number, and matched pattern.
 */

const PATTERNS = [
  {
    id: 'aws_access_key',
    name: 'AWS Access Key ID',
    severity: 'critical',
    regex: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS IAM access key. Exposure allows full AWS API access.',
  },
  {
    id: 'aws_secret_key',
    name: 'AWS Secret Access Key',
    severity: 'critical',
    regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    contextRequired: ['aws', 'secret', 'key'],
    description: 'Potential AWS secret access key.',
  },
  {
    id: 'google_api_key',
    name: 'Google API Key',
    severity: 'high',
    regex: /AIza[0-9A-Za-z\-_]{30,39}/g,
    description: 'Google API key. Can be used to access Google Cloud services.',
  },
  {
    id: 'github_pat_classic',
    name: 'GitHub Personal Access Token (Classic)',
    severity: 'critical',
    regex: /ghp_[A-Za-z0-9]{36}/g,
    description: 'GitHub Personal Access Token granting repo access.',
  },
  {
    id: 'github_pat_fine',
    name: 'GitHub Fine-grained PAT',
    severity: 'critical',
    regex: /github_pat_[A-Za-z0-9_]{82}/g,
    description: 'GitHub fine-grained Personal Access Token.',
  },
  {
    id: 'stripe_secret',
    name: 'Stripe Secret Key',
    severity: 'critical',
    regex: /sk_live_[0-9a-zA-Z]{10,}/g,
    description: 'Stripe live secret key. Grants full payment processing access.',
  },
  {
    id: 'stripe_publishable',
    name: 'Stripe Publishable Key',
    severity: 'medium',
    regex: /pk_live_[0-9a-zA-Z]{10,}/g,
    description: 'Stripe live publishable key.',
  },
  {
    id: 'slack_bot_token',
    name: 'Slack Bot Token',
    severity: 'high',
    regex: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24}/g,
    description: 'Slack bot token with workspace access.',
  },
  {
    id: 'slack_user_token',
    name: 'Slack User Token',
    severity: 'high',
    regex: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{32}/g,
    description: 'Slack user OAuth token.',
  },
  {
    id: 'slack_webhook',
    name: 'Slack Incoming Webhook',
    severity: 'medium',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    description: 'Slack webhook URL — can send messages to a channel.',
  },
  {
    id: 'rsa_private_key',
    name: 'RSA Private Key',
    severity: 'critical',
    regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    description: 'Private key material. Never commit private keys.',
  },
  {
    id: 'sendgrid_key',
    name: 'SendGrid API Key',
    severity: 'high',
    regex: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/g,
    description: 'SendGrid API key with email sending permissions.',
  },
  {
    id: 'twilio_key',
    name: 'Twilio Account SID / Auth Token',
    severity: 'high',
    regex: /AC[a-z0-9]{32}|SK[a-z0-9]{32}/g,
    description: 'Twilio credentials for SMS/voice services.',
  },
  {
    id: 'jwt_token',
    name: 'JSON Web Token',
    severity: 'medium',
    regex: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
    description: 'JWT token detected. May contain sensitive claims.',
  },
  {
    id: 'db_connection_string',
    name: 'Database Connection String',
    severity: 'critical',
    regex: /(postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/gi,
    description: 'Database connection string with embedded credentials.',
  },
  {
    id: 'firebase_service_account',
    name: 'Firebase Service Account Key',
    severity: 'critical',
    regex: /"type"\s*:\s*"service_account"/g,
    description: 'Firebase/GCP service account JSON — grants admin-level access.',
  },
  {
    id: 'generic_secret',
    name: 'Generic High-Entropy Secret',
    severity: 'medium',
    regex: /(?:secret|password|passwd|pwd|token|api[_-]?key)\s*[=:]\s*["']?[A-Za-z0-9+/=_\-]{20,}["']?/gi,
    description: 'Potential hardcoded secret or password in config/code.',
  },
  {
    id: 'private_key_pem',
    name: 'PEM Certificate/Key',
    severity: 'high',
    regex: /-----BEGIN CERTIFICATE-----/g,
    description: 'Certificate file embedded in source.',
  },
  {
    id: 'heroku_api_key',
    name: 'Heroku API Key',
    severity: 'high',
    regex: /[hH]eroku[^0-9a-zA-Z]{0,10}[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    description: 'Heroku API key granting full account access.',
  },
];

// File types we can meaningfully scan
const SCANNABLE_EXTENSIONS = new Set([
  '.txt', '.env', '.json', '.yaml', '.yml', '.js', '.ts', '.jsx', '.tsx',
  '.py', '.rb', '.go', '.java', '.php', '.sh', '.bash', '.zsh', '.csv',
  '.xml', '.md', '.log', '.config', '.cfg', '.ini', '.properties', '.toml',
  '.tf', '.tfvars', '.dockerfile', '.conf', '.htaccess', '.pem', '.key', '.crt',
]);

function isScannableFile(fileName) {
  const ext = '.' + fileName.split('.').pop().toLowerCase();
  return SCANNABLE_EXTENSIONS.has(ext);
}

/**
 * Scan file content for credential exposure.
 *
 * @param {string} content  - Raw text content of the file
 * @param {string} fileName - Original file name (used to check extension)
 * @returns {{ findings: Finding[], riskScore: number, shouldScan: boolean }}
 */
function scanCredentials(content, fileName) {
  if (!isScannableFile(fileName)) {
    return { findings: [], riskScore: 0, shouldScan: false };
  }

  const lines = content.split('\n');
  const findings = [];

  for (const pattern of PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.regex.lastIndex = 0;

    // Search line by line for accurate line numbers
    lines.forEach((line, lineIndex) => {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        // Context filter: some patterns require surrounding keywords
        if (pattern.contextRequired) {
          const context = line.toLowerCase();
          const hasContext = pattern.contextRequired.some((kw) => context.includes(kw));
          if (!hasContext) continue;
        }

        // Redact the matched value for display (show first/last 4 chars)
        const raw = match[0];
        const redacted = raw.length > 12
          ? raw.slice(0, 4) + '****' + raw.slice(-4)
          : '****';

        findings.push({
          patternId: pattern.id,
          patternName: pattern.name,
          severity: pattern.severity,
          lineNumber: lineIndex + 1,
          linePreview: line.slice(0, 120).trim(),
          matchedValue: redacted,
          description: pattern.description,
        });
      }
    });
  }

  // Deduplicate: one finding per pattern per line
  const seen = new Set();
  const unique = findings.filter((f) => {
    const key = `${f.patternId}:${f.lineNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const riskScore = computeRiskScore(unique);

  return { findings: unique, riskScore, shouldScan: true };
}

function computeRiskScore(findings) {
  if (findings.length === 0) return 0;

  const weights = { critical: 40, high: 20, medium: 10 };
  const raw = findings.reduce((sum, f) => sum + (weights[f.severity] || 5), 0);
  return Math.min(100, raw);
}

module.exports = { scanCredentials, isScannableFile, PATTERNS };

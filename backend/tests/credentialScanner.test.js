const { scanCredentials, isScannableFile } = require('../src/services/credentialScanner');

describe('Credential Scanner', () => {
  describe('isScannableFile', () => {
    test('returns true for .env files', () => {
      expect(isScannableFile('config.env')).toBe(true);
    });
    test('returns true for .js files', () => {
      expect(isScannableFile('index.js')).toBe(true);
    });
    test('returns true for .py files', () => {
      expect(isScannableFile('main.py')).toBe(true);
    });
    test('returns false for .png files', () => {
      expect(isScannableFile('photo.png')).toBe(false);
    });
    test('returns false for .mp4 files', () => {
      expect(isScannableFile('video.mp4')).toBe(false);
    });
  });

  describe('scanCredentials', () => {
    test('returns shouldScan=false for non-scannable file types', () => {
      const result = scanCredentials('some content', 'image.png');
      expect(result.shouldScan).toBe(false);
      expect(result.findings).toHaveLength(0);
    });

    test('detects AWS access key', () => {
      const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const result = scanCredentials(content, 'config.env');
      expect(result.shouldScan).toBe(true);
      expect(result.findings.some((f) => f.patternId === 'aws_access_key')).toBe(true);
      expect(result.findings[0].severity).toBe('critical');
    });

    test('detects Google API key', () => {
      const content = 'const apiKey = "AIzaSyD-9tSrke72I6e0bKabK5c5ihWfFVNnxU";';
      const result = scanCredentials(content, 'config.js');
      expect(result.findings.some((f) => f.patternId === 'google_api_key')).toBe(true);
    });

    test('detects GitHub PAT', () => {
      const content = 'token: ghp_R4nD0MStrIngOfThirtySixChars12345678';
      const result = scanCredentials(content, 'config.yml');
      expect(result.findings.some((f) => f.patternId === 'github_pat_classic')).toBe(true);
    });

    test('detects Stripe secret key', () => {
      const content = 'STRIPE_SECRET_KEY=sk_live_51HBOjXKZw2vExample';
      const result = scanCredentials(content, '.env');
      expect(result.findings.some((f) => f.patternId === 'stripe_secret')).toBe(true);
    });

    test('detects private key header', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
      const result = scanCredentials(content, 'key.pem');
      expect(result.findings.some((f) => f.patternId === 'rsa_private_key')).toBe(true);
    });

    test('detects database connection string', () => {
      const content = 'DATABASE_URL=postgresql://admin:supersecret@db.example.com:5432/prod';
      const result = scanCredentials(content, 'config.env');
      expect(result.findings.some((f) => f.patternId === 'db_connection_string')).toBe(true);
    });

    test('returns riskScore > 0 when findings exist', () => {
      const content = 'AKIAIOSFODNN7EXAMPLE';
      const result = scanCredentials(content, 'test.env');
      expect(result.riskScore).toBeGreaterThan(0);
    });

    test('returns riskScore of 0 for clean file', () => {
      const content = '# This is a clean config file\nDEBUG=true\nPORT=3000';
      const result = scanCredentials(content, 'config.env');
      expect(result.riskScore).toBe(0);
      expect(result.findings).toHaveLength(0);
    });

    test('deduplicates findings at same line', () => {
      const content = 'AKIAIOSFODNN7EXAMPLE AKIAIOSFODNN7EXAMPLE';
      const result = scanCredentials(content, 'test.env');
      const awsFindings = result.findings.filter((f) => f.patternId === 'aws_access_key');
      // Should be deduplicated to 1 finding per pattern per line
      expect(awsFindings.length).toBe(1);
    });

    test('includes correct line number', () => {
      const content = 'line1\nline2\nAKIAIOSFODNN7EXAMPLE\nline4';
      const result = scanCredentials(content, 'test.env');
      const awsFinding = result.findings.find((f) => f.patternId === 'aws_access_key');
      expect(awsFinding?.lineNumber).toBe(3);
    });

    test('redacts matched value for display', () => {
      const content = 'AKIAIOSFODNN7EXAMPLE';
      const result = scanCredentials(content, 'test.env');
      const finding = result.findings.find((f) => f.patternId === 'aws_access_key');
      // Should not expose the full key
      expect(finding?.matchedValue).not.toBe('AKIAIOSFODNN7EXAMPLE');
      expect(finding?.matchedValue).toContain('****');
    });
  });
});

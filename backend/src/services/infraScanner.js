const {
  S3Client,
  ListBucketsCommand,
  GetBucketAclCommand,
  GetBucketPolicyCommand,
  GetBucketEncryptionCommand,
} = require('@aws-sdk/client-s3');
const {
  EC2Client,
  DescribeSecurityGroupsCommand,
} = require('@aws-sdk/client-ec2');
const {
  CloudTrailClient,
  DescribeTrailsCommand,
  GetTrailStatusCommand,
} = require('@aws-sdk/client-cloudtrail');
const {
  IAMClient,
  GetAccountSummaryCommand,
  ListPoliciesCommand,
  GetPolicyVersionCommand,
} = require('@aws-sdk/client-iam');
const logger = require('../utils/logger');

/**
 * Scanner B: AWS Cloud Infrastructure Misconfiguration Scanner
 *
 * Takes ephemeral AWS credentials, runs a suite of checks,
 * and returns a structured report with severity ratings and remediation steps.
 *
 * IMPORTANT: Credentials are NEVER persisted. They are used only for the
 * duration of this function call and discarded.
 */
async function scanInfrastructure({ accessKeyId, secretAccessKey, region = 'us-east-1' }) {
  const credentials = { accessKeyId, secretAccessKey };
  const clientConfig = { credentials, region };

  const results = [];
  let totalRiskScore = 0;

  // ── S3 checks ────────────────────────────────────────────────────────────
  try {
    const s3 = new S3Client(clientConfig);
    const { Buckets } = await s3.send(new ListBucketsCommand({}));

    for (const bucket of (Buckets || [])) {
      const bucketName = bucket.Name;

      // Check 1: Public ACL
      try {
        const aclRes = await s3.send(new GetBucketAclCommand({ Bucket: bucketName }));
        const isPublic = aclRes.Grants?.some(
          (g) =>
            g.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers' ||
            g.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers'
        );
        if (isPublic) {
          results.push({
            checkId: 's3_public_acl',
            name: 'Public S3 Bucket (ACL)',
            resource: bucketName,
            severity: 'critical',
            status: 'FAIL',
            description: `Bucket "${bucketName}" has a public ACL granting access to all users.`,
            remediation: 'Remove public ACL grants. Use bucket policy + CloudFront for public content instead.',
          });
          totalRiskScore += 30;
        } else {
          results.push(pass('s3_public_acl', 'S3 Bucket Public ACL', bucketName));
        }
      } catch (_) {}

      // Check 2: Public bucket policy
      try {
        const policyRes = await s3.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
        const policy = JSON.parse(policyRes.Policy || '{}');
        const hasStarPrincipal = (policy.Statement || []).some(
          (stmt) =>
            stmt.Effect === 'Allow' &&
            (stmt.Principal === '*' || stmt.Principal?.AWS === '*')
        );
        if (hasStarPrincipal) {
          results.push({
            checkId: 's3_public_policy',
            name: 'Public S3 Bucket (Policy)',
            resource: bucketName,
            severity: 'critical',
            status: 'FAIL',
            description: `Bucket "${bucketName}" policy allows public access via wildcard principal.`,
            remediation: 'Remove or restrict the bucket policy wildcard principal.',
          });
          totalRiskScore += 25;
        } else {
          results.push(pass('s3_public_policy', 'S3 Bucket Policy', bucketName));
        }
      } catch (err) {
        // NoSuchBucketPolicy — no policy, which is fine
        if (err.name !== 'NoSuchBucketPolicy') {
          logger.warn(`S3 policy check failed for ${bucketName}: ${err.message}`);
        }
      }

      // Check 3: Encryption at rest
      try {
        await s3.send(new GetBucketEncryptionCommand({ Bucket: bucketName }));
        results.push(pass('s3_encryption', 'S3 Bucket Encryption', bucketName));
      } catch (err) {
        if (err.name === 'ServerSideEncryptionConfigurationNotFoundError') {
          results.push({
            checkId: 's3_encryption',
            name: 'Unencrypted S3 Bucket',
            resource: bucketName,
            severity: 'high',
            status: 'FAIL',
            description: `Bucket "${bucketName}" does not have default server-side encryption enabled.`,
            remediation: 'Enable default encryption with AES-256 or AWS KMS in bucket properties.',
          });
          totalRiskScore += 15;
        }
      }
    }
  } catch (err) {
    logger.warn('S3 scan failed:', err.message);
    results.push(error('s3_scan', 'S3 Scan', err.message));
  }

  // ── EC2 Security Groups ───────────────────────────────────────────────────
  try {
    const ec2 = new EC2Client(clientConfig);
    const { SecurityGroups } = await ec2.send(new DescribeSecurityGroupsCommand({}));
    const sensitivePorts = [22, 3306, 5432, 27017, 6379, 3389];

    for (const sg of (SecurityGroups || [])) {
      for (const perm of (sg.IpPermissions || [])) {
        const fromPort = perm.FromPort;
        const toPort = perm.ToPort;
        const isOpenToWorld = perm.IpRanges?.some((r) => r.CidrIp === '0.0.0.0/0') ||
          perm.Ipv6Ranges?.some((r) => r.CidrIpv6 === '::/0');

        if (isOpenToWorld) {
          const exposedPorts = sensitivePorts.filter(
            (p) => fromPort <= p && p <= toPort
          );
          if (exposedPorts.length > 0) {
            results.push({
              checkId: 'sg_unrestricted',
              name: 'Unrestricted Security Group Inbound Rule',
              resource: `${sg.GroupId} (${sg.GroupName})`,
              severity: 'critical',
              status: 'FAIL',
              description: `Security group "${sg.GroupName}" allows unrestricted inbound access (0.0.0.0/0) to sensitive ports: ${exposedPorts.join(', ')}.`,
              remediation: 'Restrict inbound rules to specific IP ranges. Never expose SSH (22), databases (3306, 5432, 27017), or Redis (6379) to the public internet.',
            });
            totalRiskScore += 25;
          }
        }
      }
    }
  } catch (err) {
    logger.warn('EC2 security group scan failed:', err.message);
    results.push(error('sg_scan', 'Security Group Scan', err.message));
  }

  // ── CloudTrail ────────────────────────────────────────────────────────────
  try {
    const ct = new CloudTrailClient(clientConfig);
    const { trailList } = await ct.send(new DescribeTrailsCommand({ includeShadowTrails: false }));

    if (!trailList || trailList.length === 0) {
      results.push({
        checkId: 'cloudtrail_disabled',
        name: 'CloudTrail Not Configured',
        resource: 'Account',
        severity: 'high',
        status: 'FAIL',
        description: 'No CloudTrail trails are configured. API activity is not being logged.',
        remediation: 'Enable CloudTrail in all regions and configure log delivery to an S3 bucket.',
      });
      totalRiskScore += 20;
    } else {
      let anyLogging = false;
      for (const trail of trailList) {
        try {
          const status = await ct.send(new GetTrailStatusCommand({ Name: trail.TrailARN }));
          if (status.IsLogging) anyLogging = true;
        } catch (_) {}
      }
      if (!anyLogging) {
        results.push({
          checkId: 'cloudtrail_disabled',
          name: 'CloudTrail Logging Disabled',
          resource: 'Account',
          severity: 'high',
          status: 'FAIL',
          description: 'CloudTrail is configured but logging is currently paused.',
          remediation: 'Re-enable logging on your CloudTrail trail.',
        });
        totalRiskScore += 20;
      } else {
        results.push(pass('cloudtrail_disabled', 'CloudTrail Logging', 'Account'));
      }
    }
  } catch (err) {
    logger.warn('CloudTrail scan failed:', err.message);
    results.push(error('cloudtrail_scan', 'CloudTrail Scan', err.message));
  }

  // ── IAM checks ───────────────────────────────────────────────────────────
  try {
    const iam = new IAMClient(clientConfig);

    // MFA on root
    const summary = await iam.send(new GetAccountSummaryCommand({}));
    const mfaEnabled = summary.SummaryMap?.AccountMFAEnabled === 1;
    if (!mfaEnabled) {
      results.push({
        checkId: 'iam_root_mfa',
        name: 'MFA Not Enabled on Root Account',
        resource: 'Root Account',
        severity: 'critical',
        status: 'FAIL',
        description: 'The AWS root account does not have MFA enabled.',
        remediation: 'Enable MFA on the root account immediately. Use a hardware MFA device for root.',
      });
      totalRiskScore += 30;
    } else {
      results.push(pass('iam_root_mfa', 'Root Account MFA', 'Root Account'));
    }

    // Overly permissive managed policies
    const { Policies } = await iam.send(
      new ListPoliciesCommand({ Scope: 'Local', OnlyAttached: true })
    );

    for (const policy of (Policies || []).slice(0, 20)) {
      try {
        const version = await iam.send(
          new GetPolicyVersionCommand({
            PolicyArn: policy.Arn,
            VersionId: policy.DefaultVersionId,
          })
        );
        const doc = JSON.parse(decodeURIComponent(version.PolicyVersion.Document));
        const hasStarAction = (doc.Statement || []).some(
          (s) =>
            s.Effect === 'Allow' &&
            (s.Action === '*' || (Array.isArray(s.Action) && s.Action.includes('*')))
        );
        if (hasStarAction) {
          results.push({
            checkId: 'iam_star_policy',
            name: 'Overly Permissive IAM Policy',
            resource: policy.PolicyName,
            severity: 'high',
            status: 'FAIL',
            description: `Policy "${policy.PolicyName}" grants Action: * — full administrative access.`,
            remediation: 'Replace wildcard actions with the minimum set of actions the role/user actually needs (principle of least privilege).',
          });
          totalRiskScore += 20;
        }
      } catch (_) {}
    }
  } catch (err) {
    logger.warn('IAM scan failed:', err.message);
    results.push(error('iam_scan', 'IAM Scan', err.message));
  }

  return {
    riskScore: Math.min(100, totalRiskScore),
    checks: results,
    scannedAt: new Date().toISOString(),
    summary: {
      total: results.filter((r) => r.status !== 'ERROR').length,
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
      critical: results.filter((r) => r.severity === 'critical' && r.status === 'FAIL').length,
      high: results.filter((r) => r.severity === 'high' && r.status === 'FAIL').length,
    },
  };
}

function pass(checkId, name, resource) {
  return { checkId, name, resource, severity: 'info', status: 'PASS', description: `${name} is configured correctly.`, remediation: null };
}

function error(checkId, name, message) {
  return { checkId, name, resource: 'N/A', severity: 'info', status: 'ERROR', description: `Could not complete check: ${message}`, remediation: 'Ensure the provided credentials have sufficient permissions.' };
}

module.exports = { scanInfrastructure };

#!/bin/bash
# Creates the nimbus-files S3 bucket in LocalStack on startup

set -e

echo "Initializing LocalStack S3..."

awslocal s3 mb s3://nimbus-files --region us-east-1

# Enable versioning on the bucket
awslocal s3api put-bucket-versioning \
  --bucket nimbus-files \
  --versioning-configuration Status=Enabled

echo "LocalStack S3 bucket 'nimbus-files' ready."

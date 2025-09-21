#!/bin/bash

echo "🚀 Complete SageMaker Nurse Roster Deployment"

# Configuration
ECR_URI="926303510788.dkr.ecr.us-east-1.amazonaws.com"
REPO_NAME="nurse_roster"
REGION="us-east-1"
BUCKET="hospital-roster-data"

# Step 1: Verify S3 structure
echo "📁 Verifying S3 bucket structure..."
if ! aws s3 ls s3://$BUCKET/raw_data/nurse_data/nurse1.json > /dev/null 2>&1; then
    echo "❌ Missing nurse1.json in S3. Please upload your data files first."
    exit 1
fi

if ! aws s3 ls s3://$BUCKET/training/pairwise_weekly_compliance.parquet > /dev/null 2>&1; then
    echo "❌ Missing training data in S3. Please upload your model files first."
    exit 1
fi

echo "✅ S3 structure verified"

# Step 2: Authenticate with ECR
echo "🔐 Authenticating with ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_URI

# Step 3: Build Docker image
echo "🐳 Building Docker image..."
docker build -t $REPO_NAME . --no-cache

# Step 4: Tag image
echo "🏷️  Tagging image..."
docker tag $REPO_NAME:latest $ECR_URI/$REPO_NAME:latest

# Step 5: Push to ECR
echo "📤 Pushing to ECR..."
docker push $ECR_URI/$REPO_NAME:latest

# Step 6: Create processing job
echo "🏃 Creating SageMaker Processing Job..."
python create_processing_job.py

echo "✅ Deployment complete!"
echo "📊 Check AWS SageMaker Console for job status"
echo "📁 Results will appear in s3://$BUCKET/roster_history/"
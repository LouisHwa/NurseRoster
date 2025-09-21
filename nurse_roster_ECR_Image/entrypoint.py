#!/usr/bin/env python3

import os
import sys
import json
import boto3
from pathlib import Path
from datetime import datetime

s3 = boto3.client("s3")


def download_from_s3(bucket, key, local_path):
    """Download a file from S3 to a local path"""
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    print(f"⬇️ Downloading s3://{bucket}/{key} -> {local_path}")
    s3.download_file(bucket, key, local_path)


def main():
    print("🚀 Starting Nurse Roster Generation (Fargate Edition)")

    # Environment variables (set in ECS Task Definition)
    input_bucket = os.environ.get("INPUT_S3_BUCKET", "hospital-roster-data")
    output_bucket = os.environ.get("OUTPUT_S3_BUCKET", "hospital-roster-data")
    output_prefix = os.environ.get("OUTPUT_PREFIX", "roster_history/")

    # S3 keys for input files
    input_files = {
        "nurse.json": os.environ.get("NURSE_PATH", "raw_data/nurse_data/nurse.json"),
        "demand.json": os.environ.get(
            "DEMAND_PATH", "raw_data/demand_data/demand.json"
        ),
        "rules.json": os.environ.get("RULES_PATH", "raw_data/rules.json"),
        "shift.json": os.environ.get("SHIFT_PATH", "raw_data/shift.json"),
        "pairwise_weekly_compliance.parquet": os.environ.get(
            "PAIRWISE_PATH", "training/pairwise_weekly_compliance.parquet"
        ),
        "model.tar.gz": os.environ.get(
            "MODEL_PATH",
            "training/xgboost/output/sagemaker-xgboost-2025-09-20-01-07-22-211/output/model.tar.gz",
        ),
    }

    # Local working directory for input files only
    os.makedirs("data", exist_ok=True)

    # Download all required inputs from S3
    print("📥 Downloading input files from S3...")
    for local_file, s3_key in input_files.items():
        local_path = f"data/{local_file}"
        try:
            download_from_s3(input_bucket, s3_key, local_path)
        except Exception as e:
            print(f"❌ Failed to download {s3_key}: {e}")
            sys.exit(1)

    # Run roster generation (this will save directly to S3)
    print("🧠 Running roster generation algorithm...")
    try:
        import generateRoster

        success = generateRoster.generate_roster()
        if success:
            print("✅ Roster generation completed successfully")
            print(f"📤 Results saved to s3://{output_bucket}/{output_prefix}")
        else:
            print("❌ Roster generation failed")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Error during roster generation: {e}")
        sys.exit(1)

    print("🎉 Nurse Roster Job completed successfully!")


if __name__ == "__main__":
    main()

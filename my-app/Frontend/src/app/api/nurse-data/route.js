// src/app/api/nurse-data/route.js
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "hospital-roster-data";

export async function GET() {
  try {
    console.log("🔍 Fetching nurse data from S3...");
    
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: "raw_data/nurse_data/nurse.json",
    });

    const response = await s3.send(getCommand);
    const body = await response.Body.transformToString();
    const nurseData = JSON.parse(body);

    console.log(`✅ Successfully fetched ${nurseData.length} nurses`);
    
    // Create lookup map for easier access
    const nurseLookup = {};
    nurseData.forEach(nurse => {
      nurseLookup[nurse.nurse_id] = {
        name: nurse.name,
        skills: nurse.skills,
        experience_years: nurse.experience_years,
        seniority_level: nurse.seniority_level
      };
    });

    return NextResponse.json({
      success: true,
      nurseData: nurseData,
      nurseLookup: nurseLookup,
      count: nurseData.length
    });

  } catch (error) {
    console.error("❌ Error fetching nurse data:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: "Failed to fetch nurse data from S3"
    }, { status: 500 });
  }
}
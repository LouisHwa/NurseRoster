// src/app/api/history/route.js
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "hospital-roster-data";

// Helper function to extract week from roster filename
function extractWeekFromRosterFilename(s3Key) {
  // Extract from patterns like "roster_history/roster_01092025.json" 
  // -> "01092025" -> "01/09/2025" -> "Week of 2025-09-01"
  const match = s3Key.match(/roster_(\d{8})\.json$/);
  if (match) {
    const dateStr = match[1]; // "01092025"
    const day = dateStr.substring(0, 2);   // "01"
    const month = dateStr.substring(2, 4); // "09" 
    const year = dateStr.substring(4, 8);  // "2025"
    
    return `Week of ${year}-${month}-${day}`;
  }
  
  // Fallback: use filename without extension
  const filename = s3Key.split('/').pop().replace('.json', '');
  return filename || "Unknown Week";
}

export async function GET() {
  try {
    console.log("🔍 Fetching history from roster_history/...");
    
    // 1. List objects in the roster_history folder
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "roster_history/",
    });

    const listed = await s3.send(listCommand);
    console.log(`📁 Found ${listed.Contents?.length || 0} files in roster_history/`);

    if (!listed.Contents || listed.Contents.length === 0) {
      console.log("⚠️ No files found in roster_history/");
      return NextResponse.json([], { status: 200 });
    }

    // 2. Download and parse each JSON file, skip folder entries
    const historyFiles = await Promise.all(
      listed.Contents
        .filter(item => item.Key.endsWith('.json') && item.Size > 0) // Only process JSON files with content
        .map(async (item) => {
          try {
            console.log(`📄 Processing file: ${item.Key}`);
            
            const getCommand = new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: item.Key,
            });

            const response = await s3.send(getCommand);
            const body = await response.Body.transformToString();
            const jsonData = JSON.parse(body);

            // Extract week from filename: roster_01092025.json -> Week of 2025-09-01
            const weekFromFilename = extractWeekFromRosterFilename(item.Key);

            // Add metadata from S3
            return {
              ...jsonData,
              week: jsonData.week || weekFromFilename, // Use existing week or extract from filename
              s3Key: item.Key,
              lastModified: item.LastModified,
              size: item.Size,
            };
          } catch (fileError) {
            console.error(`❌ Error processing file ${item.Key}:`, fileError);
            return null; // Skip corrupted files
          }
        })
    );

    // Filter out null entries (corrupted files)
    const validFiles = historyFiles.filter(file => file !== null);
    
    console.log(`✅ Successfully processed ${validFiles.length} roster history files`);
    console.log(`📊 Sample file structure:`, validFiles[0] ? {
      week: validFiles[0].week,
      departmentCount: validFiles[0].departments?.length,
      s3Key: validFiles[0].s3Key
    } : 'No valid files');
    
    return NextResponse.json(validFiles, { status: 200 });
    
  } catch (err) {
    console.error("❌ Error fetching history from S3:", err);
    return NextResponse.json(
      { 
        error: "Failed to fetch history", 
        details: err.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
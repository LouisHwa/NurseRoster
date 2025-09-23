// src/app/api/latest-roster/route.js
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

// Helper function to extract week from roster filename (same as history API)
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
    console.log("🔍 Fetching latest roster from roster_history/...");

    // 1. List objects in the roster_history folder (same as history API)
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "roster_history/", // 🔹 Changed from "historical/" to "roster_history/"
    });

    const listResponse = await s3.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log("❌ No files found in roster_history/ directory");
      return NextResponse.json({
        success: false,
        error: "No roster history files found"
      }, { status: 404 });
    }

    console.log(`📁 Found ${listResponse.Contents.length} files in roster_history/`);

    // 2. Process files and extract weeks
    const filesByWeek = {};
    
    listResponse.Contents
      .filter(item => item.Key.endsWith('.json') && item.Size > 0)
      .forEach(file => {
        const week = extractWeekFromRosterFilename(file.Key);
        console.log(`📄 Processing file: ${file.Key} → Week: ${week}`);
        
        if (!filesByWeek[week]) {
          filesByWeek[week] = [];
        }
        filesByWeek[week].push({
          key: file.Key,
          lastModified: file.LastModified,
          size: file.Size
        });
      });

    // 3. Sort weeks and get the latest
    const sortedWeeks = Object.keys(filesByWeek).sort().reverse();
    console.log(`📅 Available weeks: ${sortedWeeks.join(', ')}`);
    
    if (sortedWeeks.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid roster files found"
      }, { status: 404 });
    }

    const latestWeek = sortedWeeks[0];
    const latestFiles = filesByWeek[latestWeek];

    console.log(`📅 Latest week: ${latestWeek} with ${latestFiles.length} files`);

    // 4. Fetch all files for the latest week
    const departments = [];
    
    for (const file of latestFiles) {
      try {
        console.log(`🔍 Fetching file: ${file.key}`);
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: file.key,
        });

        const response = await s3.send(getCommand);
        const body = await response.Body.transformToString();
        const jsonData = JSON.parse(body);

        // Add departments from this file
        if (jsonData.departments && Array.isArray(jsonData.departments)) {
          departments.push(...jsonData.departments);
          console.log(`✅ Added ${jsonData.departments.length} departments from ${file.key}`);
        } else {
          console.log(`⚠️ No departments array found in ${file.key}`);
          console.log(`📊 File structure:`, Object.keys(jsonData));
        }
        
      } catch (error) {
        console.error(`❌ Error processing file ${file.key}:`, error);
        // Continue with other files even if one fails
      }
    }

    const result = {
      success: true,
      week: latestWeek,
      departments: departments,
      fileCount: latestFiles.length,
      totalDepartments: departments.length,
      lastModified: Math.max(...latestFiles.map(f => new Date(f.lastModified).getTime()))
    };

    console.log(`✅ Successfully compiled latest roster: ${departments.length} departments for week ${latestWeek}`);

    return NextResponse.json(result);

  } catch (error) {
    console.error("❌ Error fetching latest roster:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: "Failed to fetch latest roster from S3"
    }, { status: 500 });
  }
}
// src/app/api/debug-roster/route.js
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

export async function GET() {
  try {
    console.log("🔍 Checking roster_history/ folder...");
    
    // List files in roster_history/
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "roster_history/",
    });

    const listed = await s3.send(listCommand);
    console.log(`📁 Found ${listed.Contents?.length || 0} files in roster_history/`);

    const results = {
      success: true,
      folder: "roster_history/",
      totalFiles: listed.Contents?.length || 0,
      files: [],
    };

    if (listed.Contents && listed.Contents.length > 0) {
      // Analyze first few files
      for (const file of listed.Contents.slice(0, 3)) {
        try {
          console.log(`📄 Analyzing file: ${file.Key}`);
          
          const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: file.Key,
          });

          const response = await s3.send(getCommand);
          const body = await response.Body.transformToString();
          const jsonData = JSON.parse(body);

          const fileAnalysis = {
            filename: file.Key,
            size: file.Size,
            lastModified: file.LastModified,
            structure: {
              isArray: Array.isArray(jsonData),
              topLevelKeys: Array.isArray(jsonData) ? 'Array' : Object.keys(jsonData),
              hasDepartments: !!jsonData.departments,
              hasWeek: !!jsonData.week,
              week: jsonData.week,
            },
          };

          // Check if it has the expected schedule structure
          if (jsonData.departments && Array.isArray(jsonData.departments)) {
            fileAnalysis.scheduleInfo = {
              departmentCount: jsonData.departments.length,
              departments: jsonData.departments.map(dept => ({
                name: dept.name,
                nurseCount: dept.nurses?.length || 0,
                hasShiftData: dept.nurses?.[0]?.shifts ? true : false,
              })),
            };
          }

          // Preview of content
          fileAnalysis.preview = JSON.stringify(jsonData).substring(0, 500) + "...";

          results.files.push(fileAnalysis);

        } catch (fileError) {
          console.error(`❌ Error reading file ${file.Key}:`, fileError);
          results.files.push({
            filename: file.Key,
            size: file.Size,
            error: fileError.message,
          });
        }
      }

      // List all file names
      results.allFileNames = listed.Contents.map(file => file.Key);
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error("❌ Error checking roster_history:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
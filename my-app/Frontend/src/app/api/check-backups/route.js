// src/app/api/check-backups/route.js
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
    // List backup files
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "backups/",
      MaxKeys: 5, // Just check first 5 files
    });

    const listed = await s3.send(listCommand);
    const results = [];

    if (listed.Contents && listed.Contents.length > 0) {
      for (const file of listed.Contents.slice(0, 3)) { // Check first 3 files
        try {
          const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: file.Key,
          });

          const response = await s3.send(getCommand);
          const body = await response.Body.transformToString();
          const jsonData = JSON.parse(body);

          // Analyze structure
          const analysis = {
            filename: file.Key,
            size: file.Size,
            isArray: Array.isArray(jsonData),
            topLevelKeys: Array.isArray(jsonData) ? 'Array' : Object.keys(jsonData),
            hasScheduleData: false,
            hasDepartments: !!jsonData.departments,
            hasNurseProfiles: false,
            sampleStructure: null,
          };

          // Check if it's nurse profile data
          if (Array.isArray(jsonData) && jsonData[0]) {
            const firstItem = jsonData[0];
            if (firstItem.nurse_id && firstItem.skills) {
              analysis.hasNurseProfiles = true;
              analysis.sampleStructure = {
                type: 'nurse_profiles',
                count: jsonData.length,
                sampleKeys: Object.keys(firstItem),
              };
            }
          }

          // Check if it's schedule data
          if (jsonData.departments && Array.isArray(jsonData.departments)) {
            analysis.hasScheduleData = true;
            analysis.sampleStructure = {
              type: 'schedule_data',
              departmentCount: jsonData.departments.length,
              firstDepartment: jsonData.departments[0]?.name,
              nursesInFirstDept: jsonData.departments[0]?.nurses?.length || 0,
            };
          }

          // Preview first few characters
          analysis.preview = JSON.stringify(jsonData).substring(0, 300) + "...";

          results.push(analysis);
        } catch (fileError) {
          results.push({
            filename: file.Key,
            error: fileError.message,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      backupFiles: results,
      totalBackupFiles: listed.Contents?.length || 0,
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
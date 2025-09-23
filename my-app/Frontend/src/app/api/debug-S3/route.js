// src/app/api/debug-s3/route.js
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
  const debugInfo = {
    timestamp: new Date().toISOString(),
    bucket: BUCKET_NAME,
    region: process.env.AWS_REGION || "us-east-1",
    hasCredentials: {
      accessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    }
  };

  try {
    console.log("🔧 Starting S3 Debug...");

    // Step 1: List ALL objects in bucket (no prefix)
    console.log("📂 Step 1: List all objects in bucket");
    const listAllCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 50,
    });

    const allObjects = await s3.send(listAllCommand);
    debugInfo.allObjects = {
      count: allObjects.Contents?.length || 0,
      objects: allObjects.Contents?.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        isJson: obj.Key.endsWith('.json')
      })) || []
    };

    console.log(`Found ${allObjects.Contents?.length || 0} total objects`);

    // Step 2: List objects with "historical/" prefix
    console.log("📂 Step 2: List objects with historical/ prefix");
    const listHistoricalCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "historical/",
    });

    const historicalObjects = await s3.send(listHistoricalCommand);
    debugInfo.historicalObjects = {
      count: historicalObjects.Contents?.length || 0,
      objects: historicalObjects.Contents?.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        isJson: obj.Key.endsWith('.json')
      })) || []
    };

    console.log(`Found ${historicalObjects.Contents?.length || 0} historical objects`);

    // Step 3: Try different prefixes
    const prefixesToTry = ["", "history/", "Historical/", "data/", "schedules/"];
    debugInfo.prefixResults = {};

    for (const prefix of prefixesToTry) {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          MaxKeys: 10,
        });
        const result = await s3.send(listCommand);
        debugInfo.prefixResults[prefix || "root"] = {
          count: result.Contents?.length || 0,
          objects: result.Contents?.slice(0, 5).map(obj => obj.Key) || []
        };
      } catch (prefixError) {
        debugInfo.prefixResults[prefix || "root"] = { error: prefixError.message };
      }
    }

    // Step 4: Try to read the first JSON file we find
    let sampleFile = null;
    const allJsonFiles = [
      ...(allObjects.Contents || []),
      ...(historicalObjects.Contents || [])
    ].filter(obj => obj.Key.endsWith('.json'));

    if (allJsonFiles.length > 0) {
      const firstJsonFile = allJsonFiles[0];
      console.log(`📖 Step 4: Reading first JSON file: ${firstJsonFile.Key}`);
      
      try {
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: firstJsonFile.Key,
        });

        const response = await s3.send(getCommand);
        const body = await response.Body.transformToString();
        const jsonData = JSON.parse(body);

        sampleFile = {
          key: firstJsonFile.Key,
          size: firstJsonFile.Size,
          structure: {
            topLevelKeys: Object.keys(jsonData),
            hasDepartments: !!jsonData.departments,
            departmentCount: jsonData.departments?.length || 0,
            hasWeek: !!jsonData.week,
            week: jsonData.week,
            firstDepartment: jsonData.departments?.[0]?.name,
            firstDepartmentNurses: jsonData.departments?.[0]?.nurses?.length || 0,
          },
          preview: JSON.stringify(jsonData).substring(0, 500) + "..."
        };

        console.log("✅ Successfully read sample file");
      } catch (fileError) {
        sampleFile = {
          key: firstJsonFile.Key,
          error: fileError.message
        };
        console.error(`❌ Error reading file: ${fileError.message}`);
      }
    }

    debugInfo.sampleFile = sampleFile;
    debugInfo.success = true;

    return NextResponse.json(debugInfo);

  } catch (error) {
    console.error("❌ S3 Debug Error:", error);
    debugInfo.success = false;
    debugInfo.error = {
      message: error.message,
      code: error.code,
      name: error.name,
    };

    return NextResponse.json(debugInfo, { status: 500 });
  }
}
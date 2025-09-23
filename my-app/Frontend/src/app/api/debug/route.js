import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_S3_BUCKET,
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
  });
}

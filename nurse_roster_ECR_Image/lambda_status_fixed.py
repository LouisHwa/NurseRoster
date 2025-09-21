import json
import boto3
from datetime import datetime, timedelta

ecs = boto3.client("ecs")
s3 = boto3.client("s3")


def lambda_handler(event, context):
    try:
        # Get task ARN from path parameters
        if "pathParameters" not in event or "taskArn" not in event["pathParameters"]:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Missing taskArn in path"}),
            }

        task_arn = event["pathParameters"]["taskArn"]
        print(f"Full task ARN: {task_arn}")

        # Extract task ID from the ARN
        # ARN format: arn:aws:ecs:region:account:task/cluster-name/task-id
        # We need just the task-id part
        if task_arn.startswith("arn:aws:ecs:"):
            task_id = task_arn.split("/")[-1]  # Get the last part after the final /
        else:
            task_id = task_arn  # Assume it's already just the task ID

        print(f"Extracted task ID: {task_id}")

        # Check task status using the task ID
        response = ecs.describe_tasks(
            cluster="nurse-roster-cluster", tasks=[task_id]  # Use task ID, not full ARN
        )

        if not response["tasks"]:
            return {
                "statusCode": 404,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Task not found"}),
            }

        task = response["tasks"][0]
        last_status = task["lastStatus"]

        result = {
            "taskArn": task_arn,  # Return the original ARN for frontend
            "taskId": task_id,
            "status": last_status,
            "createdAt": (
                task.get("createdAt", "").isoformat() if task.get("createdAt") else None
            ),
        }

        # If task is stopped, check for output files
        if last_status == "STOPPED":
            try:
                # Get files from last 30 minutes
                cutoff_time = datetime.now() - timedelta(minutes=30)

                s3_response = s3.list_objects_v2(
                    Bucket="hospital-roster-data", Prefix="roster_history/", MaxKeys=20
                )

                if "Contents" in s3_response:
                    # Filter recent files and get most recent
                    recent_files = [
                        obj
                        for obj in s3_response["Contents"]
                        if obj["LastModified"].replace(tzinfo=None) > cutoff_time
                    ]

                    if recent_files:
                        latest_file = sorted(
                            recent_files, key=lambda x: x["LastModified"], reverse=True
                        )[0]
                        result["outputFile"] = latest_file["Key"]
                        result["outputFileSize"] = latest_file["Size"]
                        result["outputFileModified"] = latest_file[
                            "LastModified"
                        ].isoformat()

            except Exception as e:
                result["warning"] = f"Could not check output files: {str(e)}"
                print(f"S3 check error: {e}")

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps(result),
        }

    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Internal server error", "details": str(e)}),
        }

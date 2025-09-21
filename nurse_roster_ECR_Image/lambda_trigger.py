import json
import boto3
import uuid
from datetime import datetime

ecs = boto3.client("ecs")
s3 = boto3.client("s3")


def lambda_handler(event, context):
    try:
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()

        # Start ECS task
        response = ecs.run_task(
            cluster="nurse-roster-cluster",
            taskDefinition="nurse-roster-task",
            launchType="FARGATE",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": ["subnet-0cacc7381e4e00955"],  # Replace with your subnet
                    "securityGroups": [
                        "sg-080a2161ce3fc244c"
                    ],  # Replace with your security group
                    "assignPublicIp": "ENABLED",
                }
            },
            overrides={
                "containerOverrides": [
                    {
                        "name": "roster-generator",
                        "environment": [{"name": "JOB_ID", "value": job_id}],
                    }
                ]
            },
        )

        task_arn = response["tasks"][0]["taskArn"]

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            "body": json.dumps(
                {
                    "jobId": job_id,
                    "taskArn": task_arn,
                    "status": "RUNNING",
                    "message": "Roster generation started",
                }
            ),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)}),
        }

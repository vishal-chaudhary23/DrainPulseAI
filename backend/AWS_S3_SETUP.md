# Private S3 file storage

DrainPulse uses Boto3 and the standard AWS credential provider chain. The backend does not accept or store AWS access keys itself. Use an IAM role in deployed environments, or a named AWS CLI profile for local development.

## Configure the backend

1. The project backend reads environment variables from **`DrainPulseAI\backend\.env`**. The checked-in template is `DrainPulseAI\backend\.env.example`. The backend `.env` contains only the provided bucket configuration (no credentials) and is ignored by the repository `.gitignore`. Keep any existing database or other settings in that file when editing it.

   ```dotenv
   STORAGE_BACKEND=s3
   AWS_S3_BUCKET=drainpulseai-evidence-vk-2026
   AWS_REGION=ap-southeast-2
   AWS_ENDPOINT_URL_S3=
   ```

   `AWS_ENDPOINT_URL_S3` should remain empty when using Amazon S3. This configuration does not replace `DATABASE_URL`; absent an explicit setting, the current SQLite default is unchanged.

2. In the AWS Console, open **S3 → Buckets → drainpulseai-evidence-vk-2026 → Properties**. Confirm the Region is **Asia Pacific (Sydney), ap-southeast-2**. Under **Block Public Access**, keep all four blocks enabled. Under **Default encryption**, enable SSE-S3 (Amazon S3 managed keys). Do not add a public bucket policy or ACL.

3. AWS CLI was not present in the development environment at the time of verification. On Windows, download and run the official AWS CLI v2 MSI from [AWS CLI install/update instructions](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), then open a new PowerShell window and verify with `aws --version`.

4. For local use, configure an approved IAM Identity Center profile (recommended):

   ```powershell
   aws configure sso --profile drainpulse
   aws sso login --profile drainpulse
   $env:AWS_PROFILE = "drainpulse"
   aws sts get-caller-identity
   ```

   Keep that PowerShell session open when starting the backend so Boto3 can use the same profile. For a deployed backend, prefer an EC2/ECS/EKS workload role. Do not use root credentials, commit access keys, or put secrets in this `.env`.

5. In **IAM → Policies → Create policy → JSON**, create a narrowly scoped policy for the runtime identity. This policy permits only object upload, retrieval, and cleanup under this application's prefix:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "DrainPulseEvidenceObjects",
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::drainpulseai-evidence-vk-2026/uploads/*"
       }
     ]
   }
   ```

   In the IAM Console, attach this policy to the approved Identity Center permission set or workload role used by the backend. Do not create an IAM identity or access key without your organization's approval. The API does not need `s3:ListBucket`; `aws s3 ls s3://drainpulseai-evidence-vk-2026 --region ap-southeast-2` requires that additional permission. Grant `s3:ListBucket` on the bucket resource only if needed for a separate verification identity, with an `s3:prefix` condition limited to `uploads/*`.

6. Install backend dependencies and restart the API so it reads `backend\.env` at process startup. The API creates the `stored_files` table and adds the nullable incident-photo reference to an existing SQLite database.

7. Once the approved profile is active, verify it and the bucket before submitting an evidence photo:

   ```powershell
   aws sts get-caller-identity
   aws s3 ls s3://drainpulseai-evidence-vk-2026 --region ap-southeast-2
   ```

## Upload API

- `POST /api/files/upload` accepts multipart fields `file`, `purpose`, and optional `related_asset_id`.
- Supported purposes are `incident_photo` (JPEG, PNG, WebP), `inspection_image` (JPEG, PNG, WebP), and `infrastructure_document` (PDF). The API checks the declared MIME type against the filename extension and file signature, and limits uploads to 10 MiB.
- Incident reports accept an optional `photo_file_id`; inspection updates accept an optional `inspection_file_id`. Existing JSON report submissions and external `photo_url` values remain supported.
- `GET /api/files/{file_id}/download-url` returns a private, 10-minute presigned URL after tenant access is checked. Report responses similarly provide temporary URLs for S3-backed photos. Objects are never made public.
- Infrastructure documents can be uploaded with `purpose=infrastructure_document`; optional `related_asset_id` associates a document with a drainage asset.

Tests mock S3 API calls and need no AWS credentials. A live bucket upload must only be reported after confirming AWS identity, bucket access, a successful upload, and the object's presence. AWS CDK was not added because this repository has no existing infrastructure-as-code project to extend.

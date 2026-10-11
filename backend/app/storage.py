from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError, PartialCredentialsError
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
SIGNED_URL_TTL_SECONDS = 600

IMAGE_TYPES = {
    ".jpg": ("image/jpeg", lambda data: data.startswith(b"\xff\xd8\xff")),
    ".jpeg": ("image/jpeg", lambda data: data.startswith(b"\xff\xd8\xff")),
    ".png": ("image/png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    ".webp": ("image/webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
}
PURPOSE_TYPES = {
    "incident_photo": set(IMAGE_TYPES),
    "inspection_image": set(IMAGE_TYPES),
    "infrastructure_document": {".pdf"},
}


class UploadValidationError(ValueError):
    pass


class StorageConfigurationError(RuntimeError):
    pass


class StorageOperationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ValidatedUpload:
    extension: str
    content_type: str
    original_filename: str


def validate_upload(filename: str, content_type: str | None, body: bytes, purpose: str) -> ValidatedUpload:
    if purpose not in PURPOSE_TYPES:
        raise UploadValidationError("Unsupported file purpose.")
    if not body:
        raise UploadValidationError("The uploaded file is empty.")
    if len(body) > MAX_UPLOAD_BYTES:
        raise UploadValidationError(f"Files must be {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB or smaller.")

    normalized_name = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not normalized_name or len(normalized_name) > 255:
        raise UploadValidationError("A valid filename of 255 characters or fewer is required.")
    if any(ord(char) < 32 for char in normalized_name):
        raise UploadValidationError("The filename contains unsupported characters.")

    extension = os.path.splitext(normalized_name)[1].lower()
    if extension not in PURPOSE_TYPES[purpose]:
        raise UploadValidationError("This file type is not allowed for the selected upload purpose.")

    if extension in IMAGE_TYPES:
        expected_type, signature_check = IMAGE_TYPES[extension]
    else:
        expected_type, signature_check = "application/pdf", lambda data: data.startswith(b"%PDF-")
    if content_type != expected_type or not signature_check(body):
        raise UploadValidationError("The file contents do not match the allowed file type.")

    safe_name = re.sub(r"\s+", " ", normalized_name)
    return ValidatedUpload(extension, expected_type, safe_name)


def build_object_key(tenant_id: str, purpose: str, extension: str) -> str:
    tenant_hash = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:24]
    return f"uploads/{tenant_hash}/{purpose}/{uuid.uuid4().hex}{extension}"


def _bucket_name() -> str:
    backend = os.getenv("STORAGE_BACKEND", "s3").strip().lower()
    if backend != "s3":
        raise StorageConfigurationError(
            f"Unsupported STORAGE_BACKEND '{backend}'. This deployment requires STORAGE_BACKEND=s3."
        )
    bucket = os.getenv("AWS_S3_BUCKET", "").strip()
    if not bucket:
        raise StorageConfigurationError("AWS_S3_BUCKET is not configured.")
    return bucket


def _client():
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    endpoint_url = os.getenv("AWS_ENDPOINT_URL_S3") or None
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=endpoint_url,
        config=Config(signature_version="s3v4"),
    )


def _raise_storage_error(exc: BotoCoreError | ClientError, operation: str) -> None:
    if isinstance(exc, ClientError):
        error = exc.response.get("Error", {})
        code = str(error.get("Code", ""))
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code in {"AccessDenied", "AccessDeniedException", "403"} or status == 403:
            detail = "AWS denied S3 access. Check the runtime identity's permissions for this bucket and object prefix."
        elif code in {"InvalidAccessKeyId", "SignatureDoesNotMatch", "ExpiredToken", "InvalidToken"}:
            detail = "AWS credentials are invalid or expired. Refresh the configured AWS credential provider."
        elif code in {"NoSuchBucket", "PermanentRedirect", "AuthorizationHeaderMalformed"}:
            detail = "The configured S3 bucket or Region is incorrect, or the bucket is unavailable."
        else:
            detail = f"S3 {operation} failed (AWS error {code or 'unknown'})."
    elif isinstance(exc, (NoCredentialsError, PartialCredentialsError)):
        detail = "AWS credentials are unavailable or incomplete. Configure an IAM role, AWS profile, or standard AWS credential provider."
    else:
        detail = f"Could not reach S3 for {operation}. Check network connectivity, Region, and endpoint configuration."
    raise StorageOperationError(detail) from exc


def store_object(object_key: str, body: bytes, content_type: str) -> None:
    bucket = _bucket_name()
    try:
        _client().put_object(
            Bucket=bucket,
            Key=object_key,
            Body=body,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
    except (BotoCoreError, ClientError) as exc:
        _raise_storage_error(exc, "upload")


def delete_object(object_key: str) -> None:
    bucket = _bucket_name()
    try:
        _client().delete_object(Bucket=bucket, Key=object_key)
    except (BotoCoreError, ClientError) as exc:
        _raise_storage_error(exc, "delete")


def create_download_url(object_key: str, filename: str, content_type: str) -> str:
    bucket = _bucket_name()
    disposition = "inline" if content_type.startswith("image/") else "attachment"
    safe_filename = quote(filename.replace('"', ""), safe="")
    try:
        return _client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket,
                "Key": object_key,
                "ResponseContentType": content_type,
                "ResponseContentDisposition": f'{disposition}; filename="{safe_filename}"',
            },
            ExpiresIn=SIGNED_URL_TTL_SECONDS,
        )
    except (BotoCoreError, ClientError) as exc:
        _raise_storage_error(exc, "presigned URL generation")

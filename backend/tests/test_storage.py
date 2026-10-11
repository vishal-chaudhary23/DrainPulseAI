import pytest
from botocore.exceptions import ClientError, NoCredentialsError
from botocore.stub import Stubber

from app import storage
from app.storage import UploadValidationError, build_object_key, create_download_url, store_object, validate_upload


def test_validate_supported_private_upload_types():
    image = validate_upload("field-photo.JPG", "image/jpeg", b"\xff\xd8\xffimage", "inspection_image")
    document = validate_upload("culvert-record.pdf", "application/pdf", b"%PDF-1.7 data", "infrastructure_document")

    assert image.content_type == "image/jpeg"
    assert image.extension == ".jpg"
    assert document.content_type == "application/pdf"


@pytest.mark.parametrize(
    ("filename", "content_type", "body", "purpose"),
    [
        ("evidence.jpg", "image/jpeg", b"not-a-jpeg", "incident_photo"),
        ("evidence.png", "image/jpeg", b"\x89PNG\r\n\x1a\nimage", "incident_photo"),
        ("plan.pdf", "application/pdf", b"%PDF-1.4", "inspection_image"),
        ("evidence.svg", "image/svg+xml", b"<svg/>", "incident_photo"),
    ],
)
def test_rejects_invalid_or_unsupported_uploads(filename, content_type, body, purpose):
    with pytest.raises(UploadValidationError):
        validate_upload(filename, content_type, body, purpose)


def test_sanitizes_client_path_from_filename():
    upload = validate_upload("../field-photo.jpg", "image/jpeg", b"\xff\xd8\xffimage", "incident_photo")

    assert upload.original_filename == "field-photo.jpg"


def test_object_key_uses_opaque_tenant_prefix_and_random_name():
    first = build_object_key("tenant-a", "incident_photo", ".png")
    second = build_object_key("tenant-a", "incident_photo", ".png")

    assert first.startswith("uploads/")
    assert "/incident_photo/" in first
    assert first.endswith(".png")
    assert first != second
    assert "tenant-a" not in first


def test_boto3_stores_private_object_with_encryption(monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "drainpulse-test-private")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test-access-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test-secret-key")
    client = storage._client()
    monkeypatch.setattr(storage, "_client", lambda: client)
    body = b"\xff\xd8\xffsample"
    expected = {
        "Bucket": "drainpulse-test-private",
        "Key": "uploads/tenant-hash/incident_photo/photo.jpg",
        "Body": body,
        "ContentType": "image/jpeg",
        "ServerSideEncryption": "AES256",
    }

    with Stubber(client) as stubber:
        stubber.add_response("put_object", {}, expected)
        store_object(expected["Key"], body, "image/jpeg")
        stubber.assert_no_pending_responses()


def test_boto3_generates_temporary_private_download_url(monkeypatch):
    from urllib.parse import parse_qs, urlparse

    monkeypatch.setenv("AWS_S3_BUCKET", "drainpulse-test-private")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test-access-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test-secret-key")

    url = create_download_url("uploads/tenant-hash/incident_photo/photo.jpg", "field photo.jpg", "image/jpeg")
    parsed = urlparse(url)

    assert parsed.scheme == "https"
    assert parsed.netloc == "drainpulse-test-private.s3.amazonaws.com"
    assert parse_qs(parsed.query)["X-Amz-Expires"] == ["600"]
    assert "X-Amz-Signature" in parse_qs(parsed.query)


def test_s3_mode_is_required_and_never_falls_back_to_local_storage(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("AWS_S3_BUCKET", "drainpulse-test-private")

    with pytest.raises(storage.StorageConfigurationError, match="STORAGE_BACKEND=s3"):
        storage._bucket_name()


def test_missing_aws_credentials_have_actionable_error(monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "drainpulse-test-private")
    monkeypatch.setattr(storage, "_client", lambda: (_ for _ in ()).throw(NoCredentialsError()))

    with pytest.raises(storage.StorageOperationError, match="AWS credentials are unavailable"):
        store_object("uploads/test/image.jpg", b"\xff\xd8\xffimage", "image/jpeg")


def test_s3_access_denied_has_actionable_error(monkeypatch):
    monkeypatch.setenv("AWS_S3_BUCKET", "drainpulse-test-private")
    client = storage._client()
    monkeypatch.setattr(storage, "_client", lambda: client)
    expected = {
        "Bucket": "drainpulse-test-private",
        "Key": "uploads/test/image.jpg",
        "Body": b"\xff\xd8\xffimage",
        "ContentType": "image/jpeg",
        "ServerSideEncryption": "AES256",
    }

    with Stubber(client) as stubber:
        stubber.add_client_error(
            "put_object",
            service_error_code="AccessDenied",
            service_message="Access Denied",
            http_status_code=403,
            expected_params=expected,
        )
        with pytest.raises(storage.StorageOperationError, match="AWS denied S3 access"):
            store_object(expected["Key"], expected["Body"], expected["ContentType"])

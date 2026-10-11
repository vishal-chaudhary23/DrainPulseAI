from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["service"] == "DrainPulse AI"


def test_dashboard_summary_has_core_metrics():
    with TestClient(app) as client:
        response = client.get("/api/dashboard")
        assert response.status_code == 200
        payload = response.json()
        assert payload["summary"]["total_assets"] >= 1
        assert "risk_index" in payload["summary"]
        assert len(payload["top_assets"]) >= 1


def test_report_submission_and_asset_lookup():
    with TestClient(app) as client:
        report_response = client.post(
            "/api/submit-report",
            json={
                "title": "Blocked inlet near Vasant Kunj",
                "description": "Plastic litter and silt near the culvert mouth.",
                "lat": 28.542,
                "lon": 77.155,
                "severity": "medium",
                "reporter_type": "citizen",
                "status": "new",
                "photo_url": "/images/test.jpg",
            },
        )
        assert report_response.status_code == 200

        assets_response = client.get("/api/assets")
        assert assets_response.status_code == 200
        assert len(assets_response.json()) >= 1


def test_private_incident_photo_upload_and_signed_report_url(monkeypatch):
    from app import main
    from app.database import SessionLocal
    from app.models import IncidentReport, StoredFile

    monkeypatch.setattr(main, "store_object", lambda object_key, body, content_type: None)
    monkeypatch.setattr(
        main,
        "create_download_url",
        lambda object_key, filename, content_type: f"https://private.example/{object_key}?expires=600",
    )
    report_title = "S3 upload test incident"
    file_id = None
    report_id = None

    try:
        with TestClient(app) as client:
            upload = client.post(
                "/api/files/upload",
                data={"purpose": "incident_photo"},
                files={"file": ("evidence.jpg", b"\xff\xd8\xffsample image bytes", "image/jpeg")},
            )
            assert upload.status_code == 200
            uploaded = upload.json()
            file_id = uploaded["id"]
            assert uploaded["download_url"].startswith("https://private.example/uploads/")
            assert uploaded["expires_in"] == 600

            report_response = client.post(
                "/api/submit-report",
                json={
                    "title": report_title,
                    "description": "S3 integration test.",
                    "lat": 28.5,
                    "lon": 77.2,
                    "severity": "medium",
                    "reporter_type": "citizen",
                    "status": "new",
                    "photo_file_id": file_id,
                },
            )
            assert report_response.status_code == 200
            report = report_response.json()
            report_id = report["id"]
            assert report["photo_file_id"] == file_id
            assert report["photo_url"].startswith("https://private.example/uploads/")

            reports = client.get("/api/reports")
            assert reports.status_code == 200
            saved = next(item for item in reports.json() if item["id"] == report_id)
            assert saved["photo_url"].startswith("https://private.example/uploads/")

            unauthorized_download = client.get(
                f"/api/files/{file_id}/download-url",
                headers={"x-tenant-id": "other-tenant"},
            )
            assert unauthorized_download.status_code == 403

            cannot_delete_attached_photo = client.delete(f"/api/files/{file_id}")
            assert cannot_delete_attached_photo.status_code == 409
    finally:
        with SessionLocal() as db:
            if report_id is not None:
                report = db.get(IncidentReport, report_id)
                if report is not None:
                    db.delete(report)
            if file_id is not None:
                stored_file = db.get(StoredFile, file_id)
                if stored_file is not None:
                    db.delete(stored_file)
            db.commit()


def test_upload_rejects_mismatched_content_signature():
    with TestClient(app) as client:
        response = client.post(
            "/api/files/upload",
            data={"purpose": "incident_photo"},
            files={"file": ("evidence.jpg", b"not a JPEG", "image/jpeg")},
        )
        assert response.status_code == 400
        assert "contents do not match" in response.json()["detail"]


def test_upload_reports_missing_s3_configuration(monkeypatch):
    monkeypatch.delenv("AWS_S3_BUCKET", raising=False)

    with TestClient(app) as client:
        response = client.post(
            "/api/files/upload",
            data={"purpose": "incident_photo"},
            files={"file": ("evidence.jpg", b"\xff\xd8\xffsample image bytes", "image/jpeg")},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "AWS_S3_BUCKET is not configured."


def test_upload_reports_s3_permission_failure_without_saving_metadata(monkeypatch):
    from app import main
    from app.database import SessionLocal
    from app.models import StoredFile
    from app.storage import StorageOperationError

    monkeypatch.setenv("AWS_S3_BUCKET", "drainpulse-test-private")
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setattr(
        main,
        "store_object",
        lambda object_key, body, content_type: (_ for _ in ()).throw(
            StorageOperationError("AWS denied S3 access. Check the runtime identity's permissions.")
        ),
    )
    with SessionLocal() as db:
        before_count = db.query(StoredFile).count()

    with TestClient(app) as client:
        response = client.post(
            "/api/files/upload",
            data={"purpose": "incident_photo"},
            files={"file": ("evidence.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
        )

    assert response.status_code == 502
    assert "AWS denied S3 access" in response.json()["detail"]
    with SessionLocal() as db:
        assert db.query(StoredFile).count() == before_count


def test_inspection_photo_is_attached_to_the_asset(monkeypatch):
    from app import main
    from app.database import SessionLocal
    from app.models import DrainAsset, StoredFile

    monkeypatch.setattr(main, "store_object", lambda object_key, body, content_type: None)
    monkeypatch.setattr(
        main,
        "create_download_url",
        lambda object_key, filename, content_type: f"https://private.example/{object_key}?expires=600",
    )
    with SessionLocal() as db:
        asset = db.get(DrainAsset, 1)
        previous_state = (asset.status, asset.priority, asset.notes, asset.condition_score)

    file_id = None
    try:
        with TestClient(app) as client:
            upload = client.post(
                "/api/files/upload",
                data={"purpose": "inspection_image", "related_asset_id": "1"},
                files={"file": ("inspection.png", b"\x89PNG\r\n\x1a\nsample image bytes", "image/png")},
            )
            assert upload.status_code == 200
            file_id = upload.json()["id"]

            update = client.post(
                "/api/inspections",
                json={
                    "asset_id": 1,
                    "status": "inspection",
                    "priority": "high",
                    "inspection_file_id": file_id,
                },
            )
            assert update.status_code == 200

        with SessionLocal() as db:
            stored_file = db.get(StoredFile, file_id)
            assert stored_file.related_type == "drain_asset"
            assert stored_file.related_id == 1
    finally:
        with SessionLocal() as db:
            if file_id is not None:
                stored_file = db.get(StoredFile, file_id)
                if stored_file is not None:
                    db.delete(stored_file)
            asset = db.get(DrainAsset, 1)
            asset.status, asset.priority, asset.notes, asset.condition_score = previous_state
            db.commit()


def test_blockage_assessment_endpoint():
    with TestClient(app) as client:
        response = client.post(
            "/api/assess-blockage",
            json={
                "drain_id": 1,
                "visible_waste": 80,
                "silt_depth": 60,
                "standing_water": 45,
                "flow_obstruction": 75,
                "description": "Debris and standing water at the inlet.",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] in {"low", "moderate", "high", "critical"}
        assert 0 <= payload["score"] <= 100
        assert 0 <= payload["confidence"] <= 1


def test_auth_session_and_tenant_context_are_applied():
    with TestClient(app) as client:
        login = client.post(
            "/api/auth/login",
            json={"email": "tenant-a@drainpulse.local", "role": "supervisor", "tenant_id": "tenant-a"},
        )
        assert login.status_code == 200
        token = login.json()["token"]

        session = client.get(
            "/api/auth/session",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert session.status_code == 200
        assert session.json()["tenant_id"] == "tenant-a"
        assert session.json()["role"] == "supervisor"

        assets = client.get(
            "/api/assets",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert assets.status_code == 200
        for asset in assets.json():
            assert asset["tenant_id"] in {"default", "tenant-a"}

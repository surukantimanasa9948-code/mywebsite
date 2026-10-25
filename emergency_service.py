import random
from datetime import datetime
from backend.extensions import db
from backend.models import EmergencyReport, IncidentAssignment, IncidentHistory, Notification

class EmergencyService:
    VALID_STATUSES = ['Reported', 'Acknowledged', 'Responding', 'Resolved']
    VALID_TYPES = ['Fire', 'Medical', 'Accident', 'Electrical Hazard', 'Security Issue', 'Other']
    VALID_SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

    @staticmethod
    def generate_reference_no(floor_number):
        year = datetime.utcnow().year
        suffix = random.randint(1000, 9999)
        return f"EMG-{year}-F{floor_number}-{suffix}"

    @staticmethod
    def classify_severity(emergency_type, description=""):
        """
        Rule-based severity classification according to configurable safety guidelines.
        Clearly transparent: rule-based calculation, not AI verified.
        """
        text = (description + " " + emergency_type).lower()
        if emergency_type == "Fire" or any(w in text for w in ["trapped", "explosion", "smoke filling", "unconscious", "heart attack"]):
            return "Critical", "Rule-based: Detected life-safety threat or active fire/smoke keywords."
        elif emergency_type in ["Electrical Hazard", "Accident"] or any(w in text for w in ["bleeding", "chemical", "short circuit", "spark"]):
            return "High", "Rule-based: High-risk hazard requiring rapid containment."
        elif emergency_type in ["Medical", "Security Issue"] or any(w in text for w in ["pain", "suspicious", "fight", "injury"]):
            return "Medium", "Rule-based: Standard urgent campus response protocol."
        else:
            return "Low", "Rule-based: Routine safety report or non-immediate inquiry."

    @staticmethod
    def create_report(data, reporter_user=None):
        """
        Creates an emergency report with validation, idempotency check, and history logging.
        """
        idempotency_key = data.get("idempotency_key")
        if idempotency_key:
            existing = EmergencyReport.query.filter_by(idempotency_key=idempotency_key).first()
            if existing:
                return existing, False, "Duplicate report detected via idempotency key."

        emergency_type = data.get("emergency_type", "").strip()
        if emergency_type not in EmergencyService.VALID_TYPES:
            raise ValueError(f"Invalid emergency type. Must be one of: {', '.join(EmergencyService.VALID_TYPES)}")

        floor_id = data.get("floor_id") or data.get("floor_number")
        try:
            floor_id = int(floor_id)
        except (TypeError, ValueError):
            raise ValueError("Valid floor number (1 to 5) is required.")

        if not (1 <= floor_id <= 5):
            raise ValueError("Floor number must be between 1 and 5.")

        description = data.get("description", "").strip()
        if not description:
            raise ValueError("Incident description is required.")

        room_id = data.get("room_id")
        reported_location = data.get("room_code") or data.get("reported_location") or data.get("room_number") or ""
        location_details = data.get("location_details", "").strip()

        # Reporter Details
        reporter_id = reporter_user.id if reporter_user else data.get("reporter_id")
        reporter_name = reporter_user.name if reporter_user else (data.get("reporter_name") or "Campus Community Member")
        reporter_role = reporter_user.role if reporter_user else (data.get("reporter_role") or "Student")
        reporter_phone = data.get("reporter_phone", "")

        # Severity
        severity = data.get("severity")
        if not severity or severity not in EmergencyService.VALID_SEVERITIES:
            severity, rule_reason = EmergencyService.classify_severity(emergency_type, description)
        else:
            rule_reason = "Explicit severity specified by reporter."

        # Unique Reference Number
        ref_no = EmergencyService.generate_reference_no(floor_id)

        # Handle original creation timestamp for offline sync
        created_at = datetime.utcnow()
        if "created_at" in data and data["created_at"]:
            try:
                created_at = datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
            except Exception:
                pass

        report = EmergencyReport(
            reference_no=ref_no,
            reporter_id=reporter_id,
            reporter_name=reporter_name,
            reporter_role=reporter_role,
            reporter_phone=reporter_phone,
            emergency_type=emergency_type,
            description=description,
            floor_id=floor_id,
            room_id=room_id,
            reported_location=reported_location,
            location_details=location_details,
            severity=severity,
            status="Reported",
            photo_url=data.get("photo_url"),
            idempotency_key=idempotency_key,
            is_demo_data=data.get("is_demo_data", False),
            created_at=created_at,
            updated_at=datetime.utcnow()
        )
        db.session.add(report)
        db.session.flush()

        # Initial history entry
        history_entry = IncidentHistory(
            report_id=report.id,
            previous_status="None",
            new_status="Reported",
            changed_by_user_id=reporter_id,
            performed_by=reporter_name,
            notes=f"Emergency SOS submitted. {rule_reason}",
            timestamp=datetime.utcnow()
        )
        db.session.add(history_entry)

        # Create in-app notification for security staff
        notif = Notification(
            target_role="Security Staff",
            title=f"New {severity} Emergency: {emergency_type}",
            message=f"{emergency_type} reported on Floor {floor_id} ({reported_location}). Ref: {ref_no}",
            report_id=report.id
        )
        db.session.add(notif)
        db.session.commit()

        return report, True, "Emergency report successfully created."

    @staticmethod
    def update_status(report_id, new_status, performed_by_user, notes=""):
        report = EmergencyReport.query.get(report_id)
        if not report:
            return None, "Emergency report not found."

        if new_status not in EmergencyService.VALID_STATUSES:
            return None, f"Invalid status. Must be one of: {', '.join(EmergencyService.VALID_STATUSES)}"

        previous_status = report.status
        now = datetime.utcnow()

        report.status = new_status
        report.updated_at = now

        if new_status == "Acknowledged" and not report.acknowledged_at:
            report.acknowledged_at = now
        elif new_status == "Responding" and not report.responding_at:
            report.responding_at = now
        elif new_status == "Resolved" and not report.resolved_at:
            report.resolved_at = now
            # Calculate real response time in seconds
            delta = int((now - report.created_at).total_seconds())
            report.response_time_seconds = max(delta, 30)

        # History log
        history_entry = IncidentHistory(
            report_id=report.id,
            previous_status=previous_status,
            new_status=new_status,
            changed_by_user_id=performed_by_user.id if performed_by_user else None,
            performed_by=performed_by_user.name if performed_by_user else "Security Staff",
            notes=notes if notes else f"Status changed from {previous_status} to {new_status}.",
            timestamp=now
        )
        db.session.add(history_entry)

        # In-app notification
        notif = Notification(
            user_id=report.reporter_id,
            target_role=None,
            title=f"Incident {report.reference_no} Updated",
            message=f"Incident status updated to {new_status}. {notes}",
            report_id=report.id
        )
        db.session.add(notif)
        db.session.commit()

        return report, "Status updated successfully."

    @staticmethod
    def assign_staff(report_id, assigned_staff_id, assigned_staff_name, assigned_by_user, notes=""):
        report = EmergencyReport.query.get(report_id)
        if not report:
            return None, "Emergency report not found."

        now = datetime.utcnow()
        assignment = IncidentAssignment(
            report_id=report.id,
            assigned_staff_id=assigned_staff_id,
            assigned_staff_name=assigned_staff_name,
            assignment_timestamp=now,
            response_notes=notes
        )
        db.session.add(assignment)

        # History entry
        history_entry = IncidentHistory(
            report_id=report.id,
            previous_status=report.status,
            new_status=report.status,
            changed_by_user_id=assigned_by_user.id if assigned_by_user else None,
            performed_by=assigned_by_user.name if assigned_by_user else "Supervisor",
            notes=f"Assigned to {assigned_staff_name}. {notes}".strip(),
            timestamp=now
        )
        db.session.add(history_entry)
        db.session.commit()

        return assignment, "Personnel assigned successfully."

    @staticmethod
    def sync_offline_reports(reports_list, user=None):
        """
        Synchronizes queued reports from an offline client device.
        Prevents duplicates via idempotency_key, validates each report,
        and returns individual sync statuses.
        """
        results = []
        for item in reports_list:
            try:
                report, created, msg = EmergencyService.create_report(item, reporter_user=user)
                results.append({
                    "idempotency_key": item.get("idempotency_key"),
                    "reference_no": report.reference_no,
                    "status": "synchronized" if created else "already_exists",
                    "report_id": report.id,
                    "message": msg
                })
            except Exception as e:
                results.append({
                    "idempotency_key": item.get("idempotency_key"),
                    "status": "failed",
                    "error": str(e)
                })
        return results

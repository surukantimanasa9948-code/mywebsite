import os
import uuid
from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.utils import secure_filename
from models import IncidentModel
from config import Config

incident_bp = Blueprint("incidents", __name__, url_prefix="/api/incidents")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@incident_bp.route("", methods=["GET"])
def list_incidents():
    floor_num = request.args.get("floor", type=int)
    emergency_type = request.args.get("type", type=str)
    status = request.args.get("status", type=str)
    severity = request.args.get("severity", type=str)
    search = request.args.get("search", type=str)

    incidents = IncidentModel.list_all(
        floor_num=floor_num,
        emergency_type=emergency_type,
        status=status,
        severity=severity,
        search=search
    )
    return jsonify({"incidents": incidents, "total": len(incidents)}), 200

@incident_bp.route("", methods=["POST"])
def create_incident():
    """
    Emergency SOS submission endpoint.
    Accepts JSON or multipart/form-data.
    """
    if request.is_json:
        data = request.get_json()
        photo_url = data.get("photo_url")
    else:
        data = request.form
        photo_url = None
        if "photo" in request.files:
            file = request.files["photo"]
            if file and file.filename and allowed_file(file.filename):
                os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
                ext = file.filename.rsplit(".", 1)[1].lower()
                unique_name = f"incident_{uuid.uuid4().hex[:12]}.{ext}"
                save_path = os.path.join(Config.UPLOAD_FOLDER, unique_name)
                file.save(save_path)
                photo_url = f"/static/uploads/{unique_name}"

    emergency_type = data.get("emergency_type", "").strip()
    raw_floor = data.get("floor_number")
    try:
        floor_number = int(raw_floor) if raw_floor is not None else None
    except (TypeError, ValueError):
        floor_number = None
    room_code = data.get("room_code", "").strip()
    description = data.get("description", "").strip()
    location_details = data.get("location_details", "").strip()
    reporter_phone = data.get("reporter_phone", "").strip()

    # Validation
    valid_types = ("Fire", "Medical", "Accident", "Electrical Hazard", "Security Issue", "Other")
    if not emergency_type or emergency_type not in valid_types:
        return jsonify({"error": f"Invalid emergency type. Must be one of: {', '.join(valid_types)}"}), 400

    if not floor_number or not (1 <= floor_number <= 5):
        return jsonify({"error": "Valid floor number (1 to 5) is required"}), 400

    if not room_code:
        return jsonify({"error": "Room code or specific location is required"}), 400

    if not description:
        return jsonify({"error": "Incident description is required"}), 400

    # User context or fallback
    reporter_id = session.get("user_id")
    reporter_name = session.get("user_name") or data.get("reporter_name", "Campus Community Member")
    reporter_role = session.get("user_role") or data.get("reporter_role", "student")

    new_incident = IncidentModel.create(
        emergency_type=emergency_type,
        floor_number=floor_number,
        room_code=room_code,
        description=description,
        reporter_name=reporter_name,
        reporter_role=reporter_role,
        reporter_phone=reporter_phone,
        reporter_id=reporter_id,
        photo_url=photo_url,
        location_details=location_details,
        is_demo=0
    )

    return jsonify({
        "success": True,
        "message": "Emergency report submitted successfully to Campus Security Operations.",
        "incident": new_incident,
        "reference_no": new_incident["reference_no"],
        "status": new_incident["status"],
        "notice": "DEMONSTRATION SYSTEM: For actual immediate life-threatening danger, contact 911 / 112 directly."
    }), 201

@incident_bp.route("/<int:incident_id>", methods=["GET"])
def get_incident_detail(incident_id):
    incident = IncidentModel.get_by_id(incident_id)
    if not incident:
        return jsonify({"error": "Incident not found"}), 404

    logs = IncidentModel.get_logs(incident_id)
    return jsonify({"incident": incident, "timeline": logs}), 200

@incident_bp.route("/ref/<ref_no>", methods=["GET"])
def get_incident_by_ref(ref_no):
    incident = IncidentModel.get_by_ref(ref_no)
    if not incident:
        return jsonify({"error": "Incident report reference not found"}), 404

    logs = IncidentModel.get_logs(incident["id"])
    return jsonify({"incident": incident, "timeline": logs}), 200

@incident_bp.route("/<int:incident_id>/status", methods=["POST"])
def update_status(incident_id):
    # Security staff or Admin authorization
    user_role = session.get("user_role", "security")
    performer = session.get("user_name", "Duty Officer")

    data = request.get_json(silent=True) or request.form
    new_status = data.get("status", "").strip()
    notes = data.get("notes", "").strip()

    valid_statuses = ("Reported", "Acknowledged", "Responding", "Resolved")
    if new_status not in valid_statuses:
        return jsonify({"error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"}), 400

    updated = IncidentModel.update_status(incident_id, new_status, performer, notes)
    if not updated:
        return jsonify({"error": "Incident not found"}), 404

    return jsonify({
        "message": f"Incident {updated['reference_no']} status updated to {new_status}",
        "incident": updated
    }), 200

@incident_bp.route("/<int:incident_id>/assign", methods=["POST"])
def assign_responder(incident_id):
    performer = session.get("user_name", "Security Dispatcher")
    data = request.get_json(silent=True) or request.form
    assigned_to = data.get("assigned_to", "").strip()
    notes = data.get("notes", "").strip()

    if not assigned_to:
        return jsonify({"error": "Assigned responder name or team is required"}), 400

    updated = IncidentModel.assign_responder(incident_id, assigned_to, performer, notes)
    if not updated:
        return jsonify({"error": "Incident not found"}), 404

    return jsonify({
        "message": f"Incident assigned to {assigned_to}",
        "incident": updated
    }), 200

@incident_bp.route("/<int:incident_id>/notes", methods=["POST"])
def add_note(incident_id):
    performer = session.get("user_name", "Responder")
    data = request.get_json(silent=True) or request.form
    note_text = data.get("notes", "").strip()

    if not note_text:
        return jsonify({"error": "Note text is required"}), 400

    IncidentModel.add_note(incident_id, note_text, performer)
    logs = IncidentModel.get_logs(incident_id)
    return jsonify({"message": "Response note appended", "timeline": logs}), 201

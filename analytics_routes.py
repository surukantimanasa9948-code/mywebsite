from flask import Blueprint, jsonify
from database import get_db

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")

@analytics_bp.route("/dashboard", methods=["GET"])
def get_dashboard_stats():
    db = get_db()

    # Total classrooms
    classroom_count = db.execute("SELECT COUNT(*) as c FROM rooms WHERE category = 'classroom'").fetchone()["c"]

    # Total floors
    floor_count = db.execute("SELECT COUNT(*) as c FROM floors").fetchone()["c"]

    # Active emergencies (Reported, Acknowledged, Responding)
    active_emergencies = db.execute(
        "SELECT COUNT(*) as c FROM incidents WHERE status IN ('Reported', 'Acknowledged', 'Responding')"
    ).fetchone()["c"]

    # Open incident reports
    open_reports = db.execute(
        "SELECT COUNT(*) as c FROM incidents WHERE status != 'Resolved'"
    ).fetchone()["c"]

    # Available safety resources
    available_resources = db.execute(
        "SELECT COUNT(*) as c FROM safety_resources WHERE status = 'operational'"
    ).fetchone()["c"]

    total_resources = db.execute(
        "SELECT COUNT(*) as c FROM safety_resources"
    ).fetchone()["c"]

    # Average response time calculated only from actual recorded timestamps / response_time_seconds
    avg_resp = db.execute(
        """SELECT AVG(response_time_seconds) as avg_sec, COUNT(*) as count 
           FROM incidents 
           WHERE response_time_seconds > 0 AND status IN ('Responding', 'Resolved')"""
    ).fetchone()

    avg_seconds = round(avg_resp["avg_sec"] or 0)
    avg_minutes = round(avg_seconds / 60.0, 1) if avg_seconds else 0

    # Incident counts by status
    status_rows = db.execute(
        "SELECT status, COUNT(*) as count FROM incidents GROUP BY status"
    ).fetchall()
    status_counts = {r["status"]: r["count"] for r in status_rows}

    # Incident counts by type
    type_rows = db.execute(
        "SELECT emergency_type, COUNT(*) as count FROM incidents GROUP BY emergency_type"
    ).fetchall()
    type_counts = {r["emergency_type"]: r["count"] for r in type_rows}

    # Incident counts by floor
    floor_rows = db.execute(
        "SELECT floor_number, COUNT(*) as count FROM incidents GROUP BY floor_number ORDER BY floor_number"
    ).fetchall()
    floor_counts = {r["floor_number"]: r["count"] for r in floor_rows}

    # Recent 6 incidents
    recent_incidents = db.execute(
        "SELECT * FROM incidents ORDER BY reported_at DESC LIMIT 6"
    ).fetchall()

    # Emergency drill participation
    drills = db.execute(
        "SELECT * FROM emergency_drills ORDER BY drill_date DESC"
    ).fetchall()

    return jsonify({
        "stats": {
            "total_classrooms": classroom_count,
            "total_floors": floor_count,
            "active_emergencies": active_emergencies,
            "open_reports": open_reports,
            "available_resources": available_resources,
            "total_resources": total_resources,
            "avg_response_time_seconds": avg_seconds,
            "avg_response_time_minutes": avg_minutes,
            "response_status_label": "High Readiness" if active_emergencies == 0 else ("Guarded Response" if active_emergencies <= 2 else "Elevated Alert")
        },
        "breakdowns": {
            "by_status": status_counts,
            "by_type": type_counts,
            "by_floor": floor_counts
        },
        "recent_incidents": recent_incidents,
        "drills": drills
    }), 200

@analytics_bp.route("/drills", methods=["GET"])
def get_drills():
    db = get_db()
    drills = db.execute("SELECT * FROM emergency_drills ORDER BY drill_date DESC").fetchall()
    return jsonify({"drills": drills, "total": len(drills)}), 200

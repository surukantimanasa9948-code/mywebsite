from flask import Blueprint, request, jsonify, session
from models import FloorModel, RoomModel, SafetyResourceModel, BlockedRouteModel
from routes.auth_routes import role_required

campus_bp = Blueprint("campus", __name__, url_prefix="/api")

# ----------------- Floors -----------------
@campus_bp.route("/floors", methods=["GET"])
def get_floors():
    floors = FloorModel.list_all()
    return jsonify({"floors": floors, "total": len(floors)}), 200

@campus_bp.route("/floors/<int:floor_num>", methods=["GET"])
def get_floor_detail(floor_num):
    floor = FloorModel.get_by_number(floor_num)
    if not floor:
        return jsonify({"error": f"Floor {floor_num} not found"}), 404
    rooms = RoomModel.list_by_floor(floor_num)
    resources = SafetyResourceModel.list_all(floor_num=floor_num)
    blocked = BlockedRouteModel.list_active(floor_num=floor_num)
    return jsonify({
        "floor": floor,
        "rooms": rooms,
        "resources": resources,
        "blocked_routes": blocked
    }), 200

# ----------------- Rooms -----------------
@campus_bp.route("/rooms", methods=["GET"])
def get_rooms():
    floor_num = request.args.get("floor", type=int)
    category = request.args.get("category", type=str)
    search = request.args.get("search", type=str)

    if search:
        rooms = RoomModel.search(search, floor_num)
    elif floor_num:
        rooms = RoomModel.list_by_floor(floor_num)
    else:
        rooms = RoomModel.list_all()

    if category:
        rooms = [r for r in rooms if r["category"].lower() == category.lower()]

    return jsonify({"rooms": rooms, "total": len(rooms)}), 200

@campus_bp.route("/rooms/<room_code>", methods=["GET"])
def get_room_by_code(room_code):
    room = RoomModel.get_by_code(room_code)
    if not room:
        return jsonify({"error": f"Room {room_code} not found"}), 404
    return jsonify({"room": room}), 200

@campus_bp.route("/rooms/<int:room_id>", methods=["PUT"])
def update_room(room_id):
    # Admin can configure room labels, capacities, descriptions
    if session.get("user_role") not in ("admin", "security"):
        return jsonify({"error": "Admin authorization required"}), 403

    data = request.get_json(silent=True) or request.form
    name = data.get("name", "").strip()
    category = data.get("category", "").strip()
    capacity = data.get("capacity", 40)
    description = data.get("description", "").strip()

    if not name or not category:
        return jsonify({"error": "Room name and category are required"}), 400

    RoomModel.update(room_id, name, category, capacity, description)
    return jsonify({"message": "Room configuration updated successfully"}), 200

# ----------------- Safety Resources -----------------
@campus_bp.route("/resources", methods=["GET"])
def get_resources():
    floor_num = request.args.get("floor", type=int)
    category = request.args.get("category", type=str)
    status = request.args.get("status", type=str)

    resources = SafetyResourceModel.list_all(floor_num=floor_num, category=category, status=status)
    return jsonify({"resources": resources, "total": len(resources)}), 200

@campus_bp.route("/resources", methods=["POST"])
def create_resource():
    if session.get("user_role") not in ("admin", "security"):
        return jsonify({"error": "Admin authorization required"}), 403

    data = request.get_json(silent=True) or request.form
    code = data.get("resource_code", "").strip()
    try:
        floor = int(data.get("floor_number"))
    except (TypeError, ValueError):
        floor = None
    loc = data.get("location_desc", "").strip()
    cat = data.get("category", "").strip()
    stat = data.get("status", "operational")
    spec = data.get("specifications", "")
    notes = data.get("notes", "")

    if not code or not floor or not loc or not cat:
        return jsonify({"error": "Resource code, floor, location, and category are required"}), 400

    new_res = SafetyResourceModel.create(code, floor, loc, cat, stat, spec, notes=notes)
    return jsonify({"message": "Safety resource registered", "resource": new_res}), 201

@campus_bp.route("/resources/<int:resource_id>", methods=["PUT"])
def update_resource(resource_id):
    if session.get("user_role") not in ("admin", "security"):
        return jsonify({"error": "Admin authorization required"}), 403

    data = request.get_json(silent=True) or request.form
    stat = data.get("status", "operational")
    spec = data.get("specifications", "")
    notes = data.get("notes", "")

    updated = SafetyResourceModel.update(resource_id, stat, spec, notes)
    if not updated:
        return jsonify({"error": "Resource not found"}), 404
    return jsonify({"message": "Safety resource updated", "resource": updated}), 200

# ----------------- Blocked Routes Management -----------------
@campus_bp.route("/routes/blocked", methods=["GET"])
def list_blocked_routes():
    floor_num = request.args.get("floor", type=int)
    blocked = BlockedRouteModel.list_active(floor_num=floor_num)
    return jsonify({"blocked_routes": blocked, "total": len(blocked)}), 200

@campus_bp.route("/routes/blocked", methods=["POST"])
def add_blocked_route():
    if session.get("user_role") not in ("admin", "security"):
        return jsonify({"error": "Admin or Security authorization required"}), 403

    try:
        floor_num = int(data.get("floor_number"))
    except (TypeError, ValueError):
        floor_num = None
    node = data.get("node_or_corridor", "").strip()
    reason = data.get("reason", "Hazard / Maintenance Blockade").strip()
    reporter = session.get("user_name", "Safety Staff")

    if not floor_num or not node:
        return jsonify({"error": "Floor number and node/corridor identifier are required"}), 400

    BlockedRouteModel.block_route(floor_num, node, reason, reporter)
    return jsonify({"message": f"Route segment {node} on Floor {floor_num} flagged as BLOCKED"}), 201

@campus_bp.route("/routes/blocked/<int:route_id>", methods=["DELETE"])
def remove_blocked_route(route_id):
    if session.get("user_role") not in ("admin", "security"):
        return jsonify({"error": "Admin or Security authorization required"}), 403

    BlockedRouteModel.unblock_route(route_id)
    return jsonify({"message": "Route blockade cleared. Corridor reopened for navigation."}), 200

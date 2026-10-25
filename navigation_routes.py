from flask import Blueprint, request, jsonify
from models import RoomModel, BlockedRouteModel, CampusGraph

nav_bp = Blueprint("navigation", __name__, url_prefix="/api/navigation")

def resolve_to_node(identifier, default_floor=1):
    """
    Resolves a room code (e.g. 'CR-204', 'LAB-101', 'SEM-201') or node ID
    to a graph node ID (e.g. 'N_2_4').
    """
    if not identifier:
        return None, None

    identifier = str(identifier).strip()
    
    # Direct node match
    if identifier.startswith("N_"):
        parts = identifier.split("_")
        fl = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else default_floor
        return identifier, fl

    # Check room in database
    room = RoomModel.get_by_code(identifier)
    if room:
        return room["corridor_node"], room["floor_number"]

    # Special aliases
    if identifier.lower() in ("entrance", "main entrance", "main_entrance"):
        return "N_GROUND_MAIN_ENTRANCE", 1
    if identifier.lower() in ("assembly", "assembly point", "safe zone"):
        return "N_ASSEMBLY_POINT", 1

    return None, None

@nav_bp.route("/route", methods=["POST"])
def get_route():
    data = request.get_json(silent=True) or request.form
    start_id = data.get("start")
    dest_id = data.get("destination")
    raw_floor = data.get("floor", 1)
    try:
        current_floor = int(raw_floor)
    except (TypeError, ValueError):
        current_floor = 1

    if not start_id or not dest_id:
        return jsonify({"error": "Start point and destination are required"}), 400

    start_node, start_floor = resolve_to_node(start_id, current_floor)
    dest_node, dest_floor = resolve_to_node(dest_id, current_floor)

    if not start_node:
        return jsonify({"error": f"Could not find or resolve starting point '{start_id}'"}), 404
    if not dest_node:
        return jsonify({"error": f"Could not find or resolve destination '{dest_id}'"}), 404

    # Fetch currently active blocked nodes
    active_blocked = BlockedRouteModel.list_active()
    blocked_set = set(b["node_or_corridor"] for b in active_blocked)

    path_result = CampusGraph.find_shortest_path(start_node, dest_node, blocked_nodes=blocked_set)

    if not path_result:
        # Check if unreachable due to blockades
        unblocked_path = CampusGraph.find_shortest_path(start_node, dest_node, blocked_nodes=set())
        if unblocked_path:
            return jsonify({
                "error": "Destination is currently unreachable due to active emergency blockades along the corridor.",
                "blocked_nodes": list(blocked_set)
            }), 409
        return jsonify({"error": "No viable path found between locations"}), 404

    # Fetch start and destination room details if applicable
    start_room = RoomModel.get_by_code(start_id) if not start_id.startswith("N_") else None
    dest_room = RoomModel.get_by_code(dest_id) if not dest_id.startswith("N_") else None

    return jsonify({
        "success": True,
        "start": {
            "id": start_id,
            "node": start_node,
            "floor": start_floor,
            "name": start_room["name"] if start_room else start_node
        },
        "destination": {
            "id": dest_id,
            "node": dest_node,
            "floor": dest_floor,
            "name": dest_room["name"] if dest_room else dest_node
        },
        "path": path_result["path_nodes"],
        "coordinates": path_result["coordinates"],
        "distance_meters": path_result["total_distance_meters"],
        "estimated_seconds": path_result["estimated_time_seconds"],
        "directions": path_result["directions"],
        "is_rerouted": path_result["is_rerouted"],
        "active_blockades_avoided": len(blocked_set)
    }), 200

@nav_bp.route("/evacuate", methods=["POST"])
def get_evacuation_route():
    data = request.get_json(silent=True) or request.form
    start_id = data.get("start")
    raw_floor = data.get("floor", 1)
    try:
        current_floor = int(raw_floor)
    except (TypeError, ValueError):
        current_floor = 1

    if not start_id:
        return jsonify({"error": "Starting location is required for evacuation route"}), 400

    start_node, start_floor = resolve_to_node(start_id, current_floor)
    if not start_node:
        return jsonify({"error": f"Invalid starting location '{start_id}'"}), 404

    # Fetch active blocked nodes
    active_blocked = BlockedRouteModel.list_active()
    blocked_set = set(b["node_or_corridor"] for b in active_blocked)

    evac_result = CampusGraph.find_evacuation_path(start_node, blocked_nodes=blocked_set)

    if not evac_result:
        return jsonify({
            "error": "Emergency alert: All primary evacuation exits are obstructed. Shelter in place in a room with an exterior window and notify campus security immediately.",
            "blocked_nodes": list(blocked_set)
        }), 409

    start_room = RoomModel.get_by_code(start_id) if not start_id.startswith("N_") else None

    return jsonify({
        "success": True,
        "mode": "EVACUATION",
        "start": {
            "id": start_id,
            "node": start_node,
            "floor": start_floor,
            "name": start_room["name"] if start_room else start_node
        },
        "destination": "Designated Outdoor Assembly Safe Zone / Verified Ground Exit",
        "path": evac_result["path_nodes"],
        "coordinates": evac_result["coordinates"],
        "distance_meters": evac_result["total_distance_meters"],
        "estimated_seconds": evac_result["estimated_time_seconds"],
        "directions": evac_result["directions"],
        "is_rerouted": evac_result["is_rerouted"],
        "instructions": [
            "Remain calm and walk briskly along illuminated exit signs.",
            "Do NOT use elevators during an evacuation.",
            "Proceed down the designated stairwell to ground level.",
            "Assemble at the Central Quadrangle Safety Lawn for headcount."
        ]
    }), 200

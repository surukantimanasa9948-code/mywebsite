import math
import heapq
from backend.models import Room, BlockedRoute

class RouteService:
    @staticmethod
    def build_floor_nodes(floor_num):
        """
        Creates node coordinates for a floor's semi-circular arc:
        Center (500, 480), Radius 340, from 170 deg (West) to 10 deg (East).
        """
        cx, cy, r = 500, 480, 340
        nodes = {}

        # West Exit / Stairwell Node
        rad_w = math.radians(170)
        nodes[f"N_{floor_num}_W_EXIT"] = {
            "id": f"N_{floor_num}_W_EXIT",
            "floor": floor_num,
            "x": round(cx + r * math.cos(rad_w), 1),
            "y": round(cy - r * math.sin(rad_w), 1),
            "name": f"Floor {floor_num} West Stairwell & Exit"
        }

        # 16 corridor waypoint nodes along the semi-circle
        for i in range(1, 17):
            angle_deg = 160 - (i - 1) * (140.0 / 15.0)
            rad = math.radians(angle_deg)
            nodes[f"N_{floor_num}_{i}"] = {
                "id": f"N_{floor_num}_{i}",
                "floor": floor_num,
                "x": round(cx + r * math.cos(rad), 1),
                "y": round(cy - r * math.sin(rad), 1),
                "name": f"Floor {floor_num} Corridor Waypoint {i}"
            }

        # Central Atrium Node
        nodes[f"N_{floor_num}_CENTER"] = {
            "id": f"N_{floor_num}_CENTER",
            "floor": floor_num,
            "x": 500.0,
            "y": round(cy - (r - 40), 1),
            "name": f"Floor {floor_num} Central Atrium & Elevators"
        }

        # East Exit / Stairwell Node
        rad_e = math.radians(10)
        nodes[f"N_{floor_num}_E_EXIT"] = {
            "id": f"N_{floor_num}_E_EXIT",
            "floor": floor_num,
            "x": round(cx + r * math.cos(rad_e), 1),
            "y": round(cy - r * math.sin(rad_e), 1),
            "name": f"Floor {floor_num} East Stairwell & Exit"
        }

        # Ground Floor Special Egress Nodes
        if floor_num == 1:
            nodes["N_GROUND_MAIN_ENTRANCE"] = {
                "id": "N_GROUND_MAIN_ENTRANCE",
                "floor": 1,
                "x": 500.0,
                "y": 480.0,
                "name": "Campus Main Entrance Portal"
            }
            nodes["N_ASSEMBLY_POINT"] = {
                "id": "N_ASSEMBLY_POINT",
                "floor": 1,
                "x": 500.0,
                "y": 620.0,
                "name": "Designated Outdoor Assembly Safe Zone"
            }

        return nodes

    @staticmethod
    def get_full_graph():
        nodes = {}
        adj = {}

        # 1. Generate nodes for all 5 floors
        for f in range(1, 6):
            f_nodes = RouteService.build_floor_nodes(f)
            nodes.update(f_nodes)

        for nid in nodes:
            adj[nid] = []

        # 2. Add horizontal edges along semi-circular corridor for each floor
        for f in range(1, 6):
            w1 = f"N_{f}_1"
            w_exit = f"N_{f}_W_EXIT"
            adj[w_exit].append((w1, 15, "Corridor West Section"))
            adj[w1].append((w_exit, 15, "Corridor West Section"))

            for i in range(1, 16):
                curr_node = f"N_{f}_{i}"
                next_node = f"N_{f}_{i+1}"
                adj[curr_node].append((next_node, 10, "Corridor Arc Segment"))
                adj[next_node].append((curr_node, 10, "Corridor Arc Segment"))

            w16 = f"N_{f}_16"
            e_exit = f"N_{f}_E_EXIT"
            adj[w16].append((e_exit, 15, "Corridor East Section"))
            adj[e_exit].append((w16, 15, "Corridor East Section"))

            c_node = f"N_{f}_CENTER"
            w8 = f"N_{f}_8"
            w9 = f"N_{f}_9"
            adj[c_node].append((w8, 8, "Central Atrium Corridor"))
            adj[w8].append((c_node, 8, "Central Atrium Corridor"))
            adj[c_node].append((w9, 8, "Central Atrium Corridor"))
            adj[w9].append((c_node, 8, "Central Atrium Corridor"))

        # 3. Vertical edges (Staircases and Elevators)
        for f in range(1, 5):
            adj[f"N_{f}_W_EXIT"].append((f"N_{f+1}_W_EXIT", 25, "West Staircase"))
            adj[f"N_{f+1}_W_EXIT"].append((f"N_{f}_W_EXIT", 25, "West Staircase"))

            adj[f"N_{f}_E_EXIT"].append((f"N_{f+1}_E_EXIT", 25, "East Staircase"))
            adj[f"N_{f+1}_E_EXIT"].append((f"N_{f}_E_EXIT", 25, "East Staircase"))

            adj[f"N_{f}_CENTER"].append((f"N_{f+1}_CENTER", 20, "Central Elevator / Stairs"))
            adj[f"N_{f+1}_CENTER"].append((f"N_{f}_CENTER", 20, "Central Elevator / Stairs"))

        # 4. Ground floor discharge pathways to Assembly Point
        adj["N_1_CENTER"].append(("N_GROUND_MAIN_ENTRANCE", 15, "Main Atrium Exit Door"))
        adj["N_GROUND_MAIN_ENTRANCE"].append(("N_1_CENTER", 15, "Main Atrium Entrance"))
        adj["N_GROUND_MAIN_ENTRANCE"].append(("N_ASSEMBLY_POINT", 20, "Assembly Courtyard Walkway"))
        adj["N_ASSEMBLY_POINT"].append(("N_GROUND_MAIN_ENTRANCE", 20, "Courtyard Pathway"))

        adj["N_1_W_EXIT"].append(("N_ASSEMBLY_POINT", 35, "West Ground Evacuation Walkway"))
        adj["N_ASSEMBLY_POINT"].append(("N_1_W_EXIT", 35, "West Lawn Pathway"))

        adj["N_1_E_EXIT"].append(("N_ASSEMBLY_POINT", 35, "East Ground Evacuation Walkway"))
        adj["N_ASSEMBLY_POINT"].append(("N_1_E_EXIT", 35, "East Lawn Pathway"))

        return nodes, adj

    @staticmethod
    def resolve_location(identifier, default_floor=1):
        """
        Resolves room ID, room number/code (e.g., 'CR-204', '204', 'LAB-101', 'SEM-201'),
        or node ID to a valid graph node.
        """
        if not identifier:
            return None, None, None

        identifier = str(identifier).strip()

        # Direct node identifier
        if identifier.startswith("N_"):
            parts = identifier.split("_")
            fl = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else default_floor
            return identifier, fl, identifier

        # Lookup room in DB
        room = None
        if identifier.isdigit():
            # Check by room_id or room_number
            room = Room.query.get(int(identifier))
            if not room:
                room = Room.query.filter_by(room_number=f"CR-{identifier}").first()

        if not room:
            room = Room.query.filter(
                (Room.room_number.ilike(identifier)) | (Room.room_name.ilike(f"%{identifier}%"))
            ).first()

        if room:
            return room.corridor_node, room.floor.floor_number if room.floor else 1, room.room_name

        # Standard Aliases
        if identifier.lower() in ["entrance", "main entrance", "main_entrance"]:
            return "N_GROUND_MAIN_ENTRANCE", 1, "Main Campus Entrance"
        if identifier.lower() in ["assembly", "assembly point", "safe zone", "lawn"]:
            return "N_ASSEMBLY_POINT", 1, "Outdoor Assembly Safe Area"

        return None, None, None

    @staticmethod
    def calculate_route(start_id, dest_id, current_floor=1):
        start_node, start_floor, start_name = RouteService.resolve_location(start_id, current_floor)
        dest_node, dest_floor, dest_name = RouteService.resolve_location(dest_id, current_floor)

        if not start_node:
            return None, f"Could not find or resolve starting point '{start_id}'."
        if not dest_node:
            return None, f"Could not find or resolve destination '{dest_id}'."

        # Fetch active blocked nodes
        active_blocked = BlockedRoute.query.filter_by(is_active=True).all()
        blocked_nodes = set(b.node_or_corridor for b in active_blocked)

        nodes, adj = RouteService.get_full_graph()

        if start_node not in nodes or dest_node not in nodes:
            return None, "Routing endpoints are outside configured campus graph."

        # Priority Queue: (cost, node, path, directions)
        pq = [(0, start_node, [start_node], [])]
        visited = set()

        while pq:
            cost, u, path, directions = heapq.heappop(pq)

            if u in visited:
                continue
            visited.add(u)

            if u == dest_node:
                coords = [
                    {
                        "id": n,
                        "x": nodes[n]["x"],
                        "y": nodes[n]["y"],
                        "floor": nodes[n]["floor"],
                        "name": nodes[n]["name"]
                    } for n in path
                ]
                return {
                    "success": True,
                    "start": {"id": start_id, "node": start_node, "floor": start_floor, "name": start_name},
                    "destination": {"id": dest_id, "node": dest_node, "floor": dest_floor, "name": dest_name},
                    "path": path,
                    "coordinates": coords,
                    "distance_meters": round(cost * 1.5, 1),
                    "estimated_seconds": max(round(cost * 1.8), 15),
                    "directions": directions,
                    "is_rerouted": len(blocked_nodes) > 0,
                    "active_blockades_avoided": len(blocked_nodes)
                }, None

            for v, weight, desc in adj.get(u, []):
                if v in blocked_nodes and v != dest_node:
                    continue  # Blocked route avoidance
                if v not in visited:
                    heapq.heappush(
                        pq,
                        (cost + weight, v, path + [v], directions + [f"Follow {desc} to {nodes[v]['name']}"])
                    )

        # Check if unreachable solely due to blockades
        unblocked_pq = [(0, start_node, [start_node], [])]
        unblocked_visited = set()
        unblocked_possible = False
        while unblocked_pq:
            c, u, p, d = heapq.heappop(unblocked_pq)
            if u == dest_node:
                unblocked_possible = True
                break
            if u in unblocked_visited:
                continue
            unblocked_visited.add(u)
            for v, w, desc in adj.get(u, []):
                if v not in unblocked_visited:
                    heapq.heappush(unblocked_pq, (c + w, v, p + [v], []))

        if unblocked_possible:
            return None, "Destination is currently unreachable due to active corridor emergency blockades."
        return None, "No viable path found between the specified locations."

    @staticmethod
    def calculate_evacuation(start_id, current_floor=1):
        start_node, start_floor, start_name = RouteService.resolve_location(start_id, current_floor)
        if not start_node:
            return None, f"Invalid evacuation starting location '{start_id}'."

        active_blocked = BlockedRoute.query.filter_by(is_active=True).all()
        blocked_nodes = set(b.node_or_corridor for b in active_blocked)

        # Potential safe egress destinations prioritized by safety
        target_exits = ["N_ASSEMBLY_POINT", "N_1_W_EXIT", "N_1_E_EXIT", "N_GROUND_MAIN_ENTRANCE"]

        best_res = None
        min_distance = float('inf')

        for target in target_exits:
            if target in blocked_nodes:
                continue
            res, err = RouteService.calculate_route(start_node, target, start_floor)
            if res and res["distance_meters"] < min_distance:
                min_distance = res["distance_meters"]
                best_res = res

        if not best_res:
            return None, "Emergency alert: All primary evacuation exits are obstructed. Shelter in place in an exterior room and notify campus security immediately."

        best_res["mode"] = "EVACUATION"
        best_res["instructions"] = [
            "Remain calm and walk briskly along illuminated exit signs.",
            "Do NOT use elevators during an emergency evacuation.",
            "Descend the designated fire stairwell to ground level.",
            "Assemble at the Central Quadrangle Safety Lawn for headcount."
        ]
        return best_res, None

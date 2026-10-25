import unittest
import json
from app import create_app
from seed_data import seed_all

class CampusSafetyApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_all()
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.client = cls.app.test_client()

    def test_01_health_check(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("Smart Campus. Safer Tomorrow.", data["tagline"])

    def test_02_workflow_1_user_login(self):
        # Valid login
        res = self.client.post("/api/auth/login", json={
            "email": "security@campus.edu",
            "password": "security123"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["user"]["role"], "security")
        self.assertEqual(data["user"]["email"], "security@campus.edu")

        # Invalid login
        res_bad = self.client.post("/api/auth/login", json={
            "email": "security@campus.edu",
            "password": "wrongpassword"
        })
        self.assertEqual(res_bad.status_code, 401)

    def test_03_workflow_2_floor_selection_and_classroom_search(self):
        # 5 floors
        res_floors = self.client.get("/api/floors")
        self.assertEqual(res_floors.status_code, 200)
        floors = res_floors.get_json()["floors"]
        self.assertEqual(len(floors), 5)

        # Floor 2 details
        res_f2 = self.client.get("/api/floors/2")
        self.assertEqual(res_f2.status_code, 200)
        f2_data = res_f2.get_json()
        self.assertGreaterEqual(len(f2_data["rooms"]), 16)

        # Search for classroom 204
        res_search = self.client.get("/api/rooms?floor=2&search=204")
        self.assertEqual(res_search.status_code, 200)
        rooms = res_search.get_json()["rooms"]
        self.assertTrue(any("204" in r["room_code"] for r in rooms))

    def test_04_workflow_3_destination_routing_and_evacuation(self):
        # Route from Room 204 to Seminar Hall A (SEM-201)
        res_route = self.client.post("/api/navigation/route", json={
            "start": "CR-204",
            "destination": "SEM-201",
            "floor": 2
        })
        self.assertEqual(res_route.status_code, 200)
        data = res_route.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(len(data["coordinates"]), 2)
        self.assertGreater(data["distance_meters"], 0)

        # Evacuation route
        res_evac = self.client.post("/api/navigation/evacuate", json={
            "start": "CR-204",
            "floor": 2
        })
        self.assertEqual(res_evac.status_code, 200)
        evac_data = res_evac.get_json()
        self.assertEqual(evac_data["mode"], "EVACUATION")
        self.assertGreaterEqual(len(evac_data["path"]), 2)

    def test_05_workflow_4_to_7_sos_reporting_and_security_management(self):
        # Workflow 4: Submit emergency report
        sos_payload = {
            "emergency_type": "Fire",
            "floor_number": 3,
            "room_code": "CR-305",
            "description": "Small trash can smoldering in back corner of classroom 305.",
            "reporter_name": "Test Student",
            "reporter_phone": "+1-555-9999"
        }
        res_sos = self.client.post("/api/incidents", json=sos_payload)
        self.assertEqual(res_sos.status_code, 201)
        incident = res_sos.get_json()["incident"]
        ref_no = incident["reference_no"]
        inc_id = incident["id"]
        self.assertEqual(incident["status"], "Reported")
        self.assertIn("F3", ref_no)

        # Workflow 5: Report appears in incident list
        res_list = self.client.get("/api/incidents")
        self.assertEqual(res_list.status_code, 200)
        all_incidents = res_list.get_json()["incidents"]
        self.assertTrue(any(i["reference_no"] == ref_no for i in all_incidents))

        # Workflow 6: Security staff updates status
        res_ack = self.client.post(f"/api/incidents/{inc_id}/status", json={
            "status": "Acknowledged",
            "notes": "Security dispatcher dispatched campus patrol."
        })
        self.assertEqual(res_ack.status_code, 200)
        self.assertEqual(res_ack.get_json()["incident"]["status"], "Acknowledged")

        # Assign responder
        res_assign = self.client.post(f"/api/incidents/{inc_id}/assign", json={
            "assigned_to": "Officer Miller",
            "notes": "Officer Miller en route."
        })
        self.assertEqual(res_assign.status_code, 200)

        # Update to Resolved
        res_resolve = self.client.post(f"/api/incidents/{inc_id}/status", json={
            "status": "Resolved",
            "notes": "Extinguished with portable CO2 unit. Room ventilated."
        })
        self.assertEqual(res_resolve.status_code, 200)
        self.assertEqual(res_resolve.get_json()["incident"]["status"], "Resolved")

        # Workflow 7: Dashboard reflects updated stats
        res_dash = self.client.get("/api/analytics/dashboard")
        self.assertEqual(res_dash.status_code, 200)
        dash_data = res_dash.get_json()
        self.assertEqual(dash_data["stats"]["total_classrooms"], 80)
        self.assertEqual(dash_data["stats"]["total_floors"], 5)

if __name__ == "__main__":
    unittest.main()

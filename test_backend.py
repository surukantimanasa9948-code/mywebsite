import unittest
import json
from datetime import datetime
from backend.app import create_app
from backend.config import TestingConfig
from backend.extensions import db
from backend.models import User, Floor, Room, SafetyResource, EmergencyReport, BlockedRoute
from backend.seed import _do_seed

class BackendComprehensiveTests(unittest.TestCase):
    def setUp(self):
        # Create app configured with in-memory database
        self.app = create_app(TestingConfig)
        self.app_context = self.app.app_context()
        self.app_context.push()
        self.client = self.app.test_client()

        # Seed in-memory database
        _do_seed()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    # 1. Database initialization test
    def test_01_database_initialization(self):
        self.assertEqual(Floor.query.count(), 5)
        self.assertEqual(Room.query.filter(Room.room_type == 'Classroom').count(), 80)
        self.assertEqual(Room.query.count(), 120)
        self.assertEqual(SafetyResource.query.count(), 50)
        self.assertEqual(User.query.count(), 6)

    # 2. Registration and login test
    def test_02_registration_and_login(self):
        # Register new student
        res_reg = self.client.post('/api/auth/register', json={
            "name": "Jane Doe",
            "email": "jane.doe@campus.edu",
            "password": "securepassword123",
            "role": "student",
            "department": "Biotechnology"
        })
        self.assertEqual(res_reg.status_code, 201)
        data = res_reg.get_json()
        self.assertEqual(data["user"]["email"], "jane.doe@campus.edu")
        self.assertIn("access_token", data)

        # Login
        res_login = self.client.post('/api/auth/login', json={
            "email": "jane.doe@campus.edu",
            "password": "securepassword123"
        })
        self.assertEqual(res_login.status_code, 200)
        login_data = res_login.get_json()
        self.assertEqual(login_data["user"]["role"], "Student")

    # 3. Unauthorized access test
    def test_03_unauthorized_access(self):
        # Without logging in as admin, try to create safety resource
        res = self.client.post('/api/resources', json={
            "resource_code": "FE-TEST-1",
            "resource_name": "Test Extinguisher",
            "resource_type": "fire_extinguisher",
            "floor_id": 1,
            "location_desc": "Corridor"
        })
        # Should be 401 Unauthorized or 403 Forbidden
        self.assertIn(res.status_code, [401, 403])

    # 4. Role permissions (RBAC) test
    def test_04_role_permissions(self):
        # Switch to Student demo session
        self.client.post('/api/auth/demo-switch', json={"role": "student"})

        # Try to update incident status as student (only security/admin allowed)
        report = EmergencyReport.query.first()
        res_stud = self.client.post(f'/api/emergencies/{report.id}/status', json={
            "status": "Acknowledged"
        })
        self.assertEqual(res_stud.status_code, 403)

        # Switch to Security Staff session
        self.client.post('/api/auth/demo-switch', json={"role": "security"})
        res_sec = self.client.post(f'/api/emergencies/{report.id}/status', json={
            "status": "Acknowledged",
            "notes": "Security dispatched."
        })
        self.assertEqual(res_sec.status_code, 200)
        self.assertEqual(res_sec.get_json()["report"]["status"], "Acknowledged")

    # 5. Room search and floor retrieval test
    def test_05_room_search_and_floor_retrieval(self):
        # List floors
        res_fl = self.client.get('/api/floors')
        self.assertEqual(res_fl.status_code, 200)
        self.assertEqual(len(res_fl.get_json()["floors"]), 5)

        # Search room 204
        res_search = self.client.get('/api/rooms/search?q=204')
        self.assertEqual(res_search.status_code, 200)
        rooms = res_search.get_json()["rooms"]
        self.assertTrue(any("204" in r["room_number"] for r in rooms))

        # Get specific room
        res_room = self.client.get('/api/rooms/CR-204')
        self.assertEqual(res_room.status_code, 200)
        self.assertEqual(res_room.get_json()["room"]["room_number"], "CR-204")

    # 6. SOS report creation test
    def test_06_sos_report_creation(self):
        payload = {
            "emergency_type": "Fire",
            "floor_id": 3,
            "room_code": "CR-305",
            "description": "Trash bin smoking in Room 305.",
            "reporter_name": "Test Student",
            "severity": "Critical"
        }
        res = self.client.post('/api/emergencies', json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertEqual(data["report"]["status"], "Reported")
        self.assertIn("F3", data["reference_no"])

    # 7. Duplicate report prevention (idempotency key test)
    def test_07_duplicate_report_prevention(self):
        idempotency_key = "client-uuid-9999-xxxx"
        payload = {
            "emergency_type": "Medical",
            "floor_id": 2,
            "room_code": "CR-204",
            "description": "Student fainted during lecture.",
            "idempotency_key": idempotency_key
        }
        # First submission
        res1 = self.client.post('/api/emergencies', json=payload)
        self.assertEqual(res1.status_code, 201)
        ref1 = res1.get_json()["reference_no"]

        # Duplicate retry with same idempotency key
        res2 = self.client.post('/api/emergencies', json=payload)
        self.assertIn(res2.status_code, [200, 201])
        ref2 = res2.get_json()["reference_no"]
        self.assertEqual(ref1, ref2)  # Returns existing report without re-inserting

    # 8. Incident assignment test
    def test_08_incident_assignment(self):
        self.client.post('/api/auth/demo-switch', json={"role": "security"})
        report = EmergencyReport.query.filter_by(status='Reported').first()

        res = self.client.post(f'/api/emergencies/{report.id}/assign', json={
            "assigned_to": "Officer Miller",
            "notes": "Officer Miller dispatched with medical kit."
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["assignment"]["assigned_staff_name"], "Officer Miller")

    # 9. Status updates and incident history test
    def test_09_status_updates_and_history(self):
        self.client.post('/api/auth/demo-switch', json={"role": "security"})
        report = EmergencyReport.query.filter_by(status='Reported').first()

        # Update to Responding
        res_resp = self.client.post(f'/api/emergencies/{report.id}/status', json={
            "status": "Responding",
            "notes": "Patrol arrived on floor."
        })
        self.assertEqual(res_resp.status_code, 200)

        # Update to Resolved
        res_res = self.client.post(f'/api/emergencies/{report.id}/status', json={
            "status": "Resolved",
            "notes": "Situation contained."
        })
        self.assertEqual(res_res.status_code, 200)

        # Verify history log entries
        res_det = self.client.get(f'/api/emergencies/{report.id}')
        history = res_det.get_json()["timeline"]
        self.assertTrue(any("Responding" in h["new_status"] for h in history))
        self.assertTrue(any("Resolved" in h["new_status"] for h in history))

    # 10. Safety resource management test (CRUD)
    def test_10_safety_resource_management(self):
        self.client.post('/api/auth/demo-switch', json={"role": "admin"})

        # Create
        res_create = self.client.post('/api/resources', json={
            "resource_code": "FE-999",
            "resource_name": "Test CO2 Extinguisher",
            "resource_type": "fire_extinguisher",
            "floor_id": 2,
            "location_desc": "Outside Room 208"
        })
        self.assertEqual(res_create.status_code, 201)
        res_id = res_create.get_json()["resource"]["id"]

        # Update
        res_update = self.client.patch(f'/api/resources/{res_id}', json={
            "status": "under_inspection",
            "notes": "Annual inspection in progress."
        })
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.get_json()["resource"]["status"], "under_inspection")

        # Delete
        res_del = self.client.delete(f'/api/resources/{res_id}')
        self.assertEqual(res_del.status_code, 200)

    # 11. Dashboard calculations & response time test
    def test_11_dashboard_calculations(self):
        res = self.client.get('/api/dashboard/stats')
        self.assertEqual(res.status_code, 200)
        stats = res.get_json()["stats"]
        self.assertEqual(stats["total_classrooms"], 80)
        self.assertEqual(stats["total_floors"], 5)
        self.assertGreaterEqual(stats["total_resources"], 50)
        self.assertIn("avg_response_time_minutes", stats)

    # 12. Route blocking and alternative routes test
    def test_12_route_blocking_and_rerouting(self):
        # 1. Normal route from Room 204 to Seminar Hall A (SEM-201)
        res_norm = self.client.get('/api/routes?from=CR-204&to=SEM-201&floor=2')
        self.assertEqual(res_norm.status_code, 200)
        data_norm = res_norm.get_json()
        self.assertFalse(data_norm["is_rerouted"])

        # 2. Block a waypoint along the corridor
        self.client.post('/api/auth/demo-switch', json={"role": "admin"})
        res_block = self.client.post('/api/routes/blocked', json={
            "floor_number": 2,
            "node_or_corridor": "N_2_6",
            "reason": "Simulated corridor hazard"
        })
        self.assertEqual(res_block.status_code, 201)

        # 3. Request route again - should still find a valid path or avoid blocked node
        res_reroute = self.client.get('/api/routes?from=CR-204&to=SEM-201&floor=2')
        self.assertEqual(res_reroute.status_code, 200)
        data_reroute = res_reroute.get_json()
        self.assertTrue(data_reroute["is_rerouted"])

    # 13. Offline synchronization test
    def test_13_offline_synchronization(self):
        queued_reports = [
            {
                "idempotency_key": "offline-key-001",
                "emergency_type": "Accident",
                "floor_id": 1,
                "room_code": "LAB-101",
                "description": "Offline report 1: minor spill.",
                "created_at": "2026-10-25T10:00:00Z"
            },
            {
                "idempotency_key": "offline-key-002",
                "emergency_type": "Medical",
                "floor_id": 3,
                "room_code": "CR-310",
                "description": "Offline report 2: sprained ankle.",
                "created_at": "2026-10-25T10:05:00Z"
            }
        ]
        res = self.client.post('/api/sync/emergencies', json={"reports": queued_reports})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["results"]), 2)
        self.assertEqual(data["results"][0]["status"], "synchronized")

    # 14. Invalid input and missing fields test
    def test_14_invalid_inputs(self):
        # Missing emergency type
        res_bad1 = self.client.post('/api/emergencies', json={
            "floor_id": 2,
            "description": "Something happened"
        })
        self.assertEqual(res_bad1.status_code, 400)

        # Invalid floor number
        res_bad2 = self.client.post('/api/emergencies', json={
            "emergency_type": "Fire",
            "floor_id": 99,
            "description": "Invalid floor"
        })
        self.assertEqual(res_bad2.status_code, 400)

        # Route with nonexistent location
        res_bad3 = self.client.get('/api/routes?from=NONEXISTENT_ROOM_XYZ&to=SEM-201')
        self.assertEqual(res_bad3.status_code, 404)

if __name__ == '__main__':
    unittest.main()

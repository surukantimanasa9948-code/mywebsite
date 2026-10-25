import math
from datetime import datetime, timedelta, date
from backend.extensions import db
from backend.models import (
    User, Floor, Room, SafetyResource, EmergencyReport,
    IncidentAssignment, IncidentHistory, EmergencyDrill
)

def calculate_svg_pos(cx, cy, radius, angle_deg):
    rad = math.radians(angle_deg)
    return round(cx + radius * math.cos(rad), 1), round(cy - radius * math.sin(rad), 1)

def seed_database(app=None):
    if app:
        with app.app_context():
            _do_seed()
    else:
        _do_seed()

def _do_seed():
    print("[Seed] Dropping and re-creating all database tables via SQLAlchemy ORM...")
    db.drop_all()
    db.create_all()

    # 1. Seed Users (Roles: Student, Faculty, Security Staff, Administrator)
    print("[Seed] Populating users with hashed passwords...")
    users = [
        User(name="Campus Administrator", email="admin@campus.edu", role="Administrator", department="Safety & Operations", phone="+1-555-0101"),
        User(name="Chief Security Officer", email="security@campus.edu", role="Security Staff", department="Campus Police & Security", phone="+1-555-0102"),
        User(name="Dr. Eleanor Vance", email="faculty@campus.edu", role="Faculty", department="Department of Computer Science", phone="+1-555-0103"),
        User(name="Alex Rivera (Student Rep)", email="student@campus.edu", role="Student", department="School of Engineering", phone="+1-555-0104"),
        User(name="Officer David Miller", email="david.security@campus.edu", role="Security Staff", department="Quick Response Unit", phone="+1-555-0105"),
        User(name="Prof. Robert Chen", email="robert.chen@campus.edu", role="Faculty", department="Department of Physics", phone="+1-555-0106")
    ]
    passwords = ["admin123", "security123", "faculty123", "student123", "security123", "faculty123"]
    for u, p in zip(users, passwords):
        u.set_password(p)
        db.session.add(u)
    db.session.commit()

    # 2. Seed Floors (1 to 5)
    print("[Seed] Populating 5 floors of the semi-circular block...")
    floors = [
        Floor(floor_number=1, name="Ground Floor", subtitle="Administration, Medical Room & Foundational Labs",
              floor_plan_data="Main campus entrance, central health center, physics and applied science laboratories.",
              evacuation_plan_summary="Direct ground-level egress via Main Portal, West Emergency Discharge, and East Emergency Exit to the Assembly Safe Zone."),
        Floor(floor_number=2, name="Second Floor", subtitle="Academic Wing A & Seminar Hall A",
              floor_plan_data="16 lecture classrooms, chemistry laboratory, and the 250-seat Dr. APJ Abdul Kalam Auditorium.",
              evacuation_plan_summary="Proceed along semi-circular corridor to either East or West stairwells. Do NOT use elevators during fire emergencies."),
        Floor(floor_number=3, name="Third Floor", subtitle="Advanced Computing & Faculty Hub",
              floor_plan_data="16 lecture classrooms, computer science laboratories, AI center, and faculty offices.",
              evacuation_plan_summary="Use central or wing stairwells. Follow illuminated floor signage towards West and East exit stairwells."),
        Floor(floor_number=4, name="Fourth Floor", subtitle="Electronics Wing & Seminar Hall B",
              floor_plan_data="16 lecture classrooms, electronics and signal processing laboratories, and Sir C.V. Raman Memorial Hall.",
              evacuation_plan_summary="Evacuate via West or East fire-rated stairwells. Evacuation chairs available at both stairwell landings."),
        Floor(floor_number=5, name="Fifth Floor", subtitle="Robotics, IoT & Research Center",
              floor_plan_data="16 lecture classrooms, advanced robotics laboratory, and autonomous systems research wing.",
              evacuation_plan_summary="Priority evacuation via West and East pressurized stairwells. Follow warden instructions to ground assembly area.")
    ]
    for fl in floors:
        db.session.add(fl)
    db.session.commit()

    floor_map = {fl.floor_number: fl.id for fl in Floor.query.all()}

    # 3. Seed Rooms: 80 Classrooms, 10 Labs, 10 Washrooms, 2 Seminar Halls, Medical Room, Exits, Stairs
    print("[Seed] Populating 80 classrooms, 10 labs, 10 washrooms, 2 seminar halls, and amenities...")
    cx, cy = 500, 480
    r_outer_rooms = 390
    r_inner_rooms = 280

    for f in range(1, 6):
        fid = floor_map[f]
        # 16 Classrooms per floor = 80 total
        for i in range(1, 17):
            room_num = f * 100 + i
            room_code = f"CR-{room_num}"
            angle = 160 - (i - 1) * (140.0 / 15.0)
            x, y = calculate_svg_pos(cx, cy, r_outer_rooms, angle)
            wing = "West" if angle > 115 else ("Center" if angle >= 65 else "East")
            c_node = f"N_{f}_{i}"

            room = Room(
                room_number=room_code,
                room_name=f"Classroom {room_num}",
                floor_id=fid,
                room_type="Classroom",
                wing=wing,
                capacity=45,
                corridor_node=c_node,
                svg_x=x,
                svg_y=y,
                svg_angle=round(angle, 1),
                is_accessible=True,
                description=f"Smart Lecture Hall {room_num} with tiered seating, multimedia projector, and dual emergency egress access."
            )
            db.session.add(room)

        # 2 Laboratories per floor = 10 total
        lab_data = {
            1: [
                ("LAB-101", "Physics Laboratory", "West", 135, f"N_{1}_4", "Equipped with optics benches, lasers, and fire blanket safety station."),
                ("LAB-102", "Applied Mechanics Lab", "East", 45, f"N_{1}_13", "Mechanical testing equipment, emergency shutoff switches installed.")
            ],
            2: [
                ("LAB-201", "Chemistry Laboratory", "West", 135, f"N_{2}_4", "Equipped with chemical fume hoods, eye-wash station, and neutralization kit."),
                ("LAB-202", "Material Science Lab", "East", 45, f"N_{2}_13", "High-temperature furnaces and material characterization benches.")
            ],
            3: [
                ("LAB-301", "Advanced Computing Lab", "West", 135, f"N_{3}_4", "60 workstations, high-speed servers, and FM-200 clean agent fire suppression."),
                ("LAB-302", "AI & Data Systems Lab", "East", 45, f"N_{3}_13", "GPU computing cluster, redundant power supply, and heat sensors.")
            ],
            4: [
                ("LAB-401", "Electronics & Signal Lab", "West", 135, f"N_{4}_4", "Oscilloscopes, ESD safe workstations, and Class C fire extinguishers."),
                ("LAB-402", "Embedded Systems & IoT Lab", "East", 45, f"N_{4}_13", "Microcontroller benches, soldering stations with localized smoke exhaust.")
            ],
            5: [
                ("LAB-501", "Robotics & Automation Lab", "West", 135, f"N_{5}_4", "Robotic arms, automated guided vehicle arena, optical safety perimeter."),
                ("LAB-502", "Autonomous Systems Lab", "East", 45, f"N_{5}_13", "Drone testing cage, lithium battery safety storage chamber.")
            ]
        }
        for code, name, wing, angle, c_node, desc in lab_data[f]:
            x, y = calculate_svg_pos(cx, cy, r_inner_rooms, angle)
            db.session.add(Room(
                room_number=code, room_name=name, floor_id=fid, room_type="Laboratory",
                wing=wing, capacity=35, corridor_node=c_node, svg_x=x, svg_y=y,
                svg_angle=round(angle, 1), is_accessible=True, description=desc
            ))

        # Restrooms on every floor
        xf, yf = calculate_svg_pos(cx, cy, r_inner_rooms + 20, 168)
        db.session.add(Room(
            room_number=f"WR-F-{f}", room_name=f"Female Restroom - Floor {f}", floor_id=fid,
            room_type="Washroom", wing="West", capacity=8, corridor_node=f"N_{f}_1",
            svg_x=xf, svg_y=yf, svg_angle=168.0, is_accessible=True,
            description="Accessible female washroom facility with emergency pull cord."
        ))
        xm, ym = calculate_svg_pos(cx, cy, r_inner_rooms + 20, 12)
        db.session.add(Room(
            room_number=f"WR-M-{f}", room_name=f"Male Restroom - Floor {f}", floor_id=fid,
            room_type="Washroom", wing="East", capacity=8, corridor_node=f"N_{f}_16",
            svg_x=xm, svg_y=ym, svg_angle=12.0, is_accessible=True,
            description="Accessible male washroom facility with emergency pull cord."
        ))

        # Stairwells & Elevators
        xw, yw = calculate_svg_pos(cx, cy, 340, 172)
        db.session.add(Room(
            room_number=f"ST-W-{f}", room_name=f"West Staircase & Emergency Exit (F{f})", floor_id=fid,
            room_type="Staircase", wing="West", capacity=20, corridor_node=f"N_{f}_W_EXIT",
            svg_x=xw, svg_y=yw, svg_angle=172.0, is_accessible=True,
            description="Fire-rated pressurized stairwell leading directly to ground evacuation route."
        ))
        xe, ye = calculate_svg_pos(cx, cy, 340, 8)
        db.session.add(Room(
            room_number=f"ST-E-{f}", room_name=f"East Staircase & Emergency Exit (F{f})", floor_id=fid,
            room_type="Staircase", wing="East", capacity=20, corridor_node=f"N_{f}_E_EXIT",
            svg_x=xe, svg_y=ye, svg_angle=8.0, is_accessible=True,
            description="Fire-rated pressurized stairwell leading directly to east ground exit."
        ))
        db.session.add(Room(
            room_number=f"ELEV-{f}", room_name=f"Central Elevators & Stairs (F{f})", floor_id=fid,
            room_type="Elevator", wing="Center", capacity=16, corridor_node=f"N_{f}_CENTER",
            svg_x=500.0, svg_y=180.0, svg_angle=90.0, is_accessible=True,
            description="Central atrium glass elevators and grand staircase (Elevators automatically ground during alarms)."
        ))

    # Seminar Halls on designated floors (Floor 2 & Floor 4)
    db.session.add(Room(
        room_number="SEM-201", room_name="Seminar Hall A (Dr. APJ Abdul Kalam Auditorium)",
        floor_id=floor_map[2], room_type="Seminar Hall", wing="Center", capacity=250,
        corridor_node="N_2_CENTER", svg_x=500.0, svg_y=240.0, svg_angle=90.0, is_accessible=True,
        description="Tiered 250-seat multimedia auditorium with dual acoustic emergency exits."
    ))
    db.session.add(Room(
        room_number="SEM-401", room_name="Seminar Hall B (Sir C.V. Raman Memorial Hall)",
        floor_id=floor_map[4], room_type="Seminar Hall", wing="Center", capacity=220,
        corridor_node="N_4_CENTER", svg_x=500.0, svg_y=240.0, svg_angle=90.0, is_accessible=True,
        description="Conference & symposium hall with integrated audio-visual safety broadcast system."
    ))

    # Ground Floor Special: Health Center & Main Entrance Portal
    db.session.add(Room(
        room_number="MED-101", room_name="Campus Health Center & Medical Room",
        floor_id=floor_map[1], room_type="Medical", wing="Center", capacity=10,
        corridor_node="N_1_CENTER", svg_x=500.0, svg_y=240.0, svg_angle=90.0, is_accessible=True,
        description="On-duty medical triage, certified nurse, emergency beds, oxygen cylinders, and trauma kit."
    ))
    db.session.add(Room(
        room_number="ENT-101", room_name="Main Campus Entrance Portal",
        floor_id=floor_map[1], room_type="Exit", wing="Center", capacity=100,
        corridor_node="N_GROUND_MAIN_ENTRANCE", svg_x=500.0, svg_y=480.0, svg_angle=90.0, is_accessible=True,
        description="Primary building entrance and security check post with automated turnstiles."
    ))
    db.session.add(Room(
        room_number="ASM-001", room_name="Outdoor Assembly Safe Area",
        floor_id=floor_map[1], room_type="Assembly", wing="Outdoor", capacity=1000,
        corridor_node="N_ASSEMBLY_POINT", svg_x=500.0, svg_y=620.0, svg_angle=90.0, is_accessible=True,
        description="Designated open green lawn safe zone clear of building collapse perimeter and hazards."
    ))
    db.session.commit()

    # 4. Seed 50+ Safety Resources
    print("[Seed] Populating safety resources across all 5 floors...")
    for f in range(1, 6):
        fid = floor_map[f]
        # Extinguishers
        fe_spots = [
            (f"FE-{f}01", "Fire Extinguisher FE-01", "West Corridor near Room 104", "fire_extinguisher", "operational", "10lb CO2 Extinguisher (Inspected)", f"N_{f}_3", 145),
            (f"FE-{f}02", "Fire Extinguisher FE-02", "Central Lobby opposite Elevators", "fire_extinguisher", "operational", "Class ABC Dry Chemical Multi-Purpose", f"N_{f}_CENTER", 90),
            (f"FE-{f}03", "Fire Extinguisher FE-03", "East Corridor near Room 112", "fire_extinguisher", "operational", "Class ABC Dry Chemical Multi-Purpose", f"N_{f}_14", 35),
            (f"FE-{f}04", "Fire Extinguisher FE-04", "Laboratory Corridor Safety Station", "fire_extinguisher", "operational", "Foam Extinguisher (AFFF) for chemical safety", f"N_{f}_8", 105)
        ]
        for rcode, rname, loc, cat, stat, spec, cnode, angle in fe_spots:
            rx, ry = calculate_svg_pos(cx, cy, 335, angle)
            db.session.add(SafetyResource(
                resource_code=rcode, resource_name=rname, resource_type=cat, floor_id=fid,
                location_desc=loc, status=stat, last_verified=date.today() - timedelta(days=20),
                next_inspection=date.today() + timedelta(days=160), specifications=spec,
                corridor_node=cnode, svg_x=rx, svg_y=ry, notes="Pressure gauge in green range."
            ))

        # Alarms
        fa_spots = [
            (f"FA-{f}01", "Fire Alarm Pull Station West", "West Staircase Landing Entrance", "fire_alarm", f"N_{f}_W_EXIT", 168),
            (f"FA-{f}02", "Fire Alarm Pull Station East", "East Staircase Landing Entrance", "fire_alarm", f"N_{f}_E_EXIT", 12)
        ]
        for rcode, rname, loc, cat, cnode, angle in fa_spots:
            rx, ry = calculate_svg_pos(cx, cy, 345, angle)
            db.session.add(SafetyResource(
                resource_code=rcode, resource_name=rname, resource_type=cat, floor_id=fid,
                location_desc=loc, status="operational", last_verified=date.today() - timedelta(days=30),
                next_inspection=date.today() + timedelta(days=150), specifications="Dual-action manual pull station & strobe siren",
                corridor_node=cnode, svg_x=rx, svg_y=ry, notes="Connected to main fire indicator panel."
            ))

        # First Aid
        fak_spots = [
            (f"FAK-{f}01", "Lab First Aid Kit", "Floor Laboratory Safety Station", "first_aid", f"N_{f}_4", 135),
            (f"FAK-{f}02", "Staff First Aid Kit", "Staff / Corridor First Aid Station", "first_aid", f"N_{f}_CENTER", 90)
        ]
        for rcode, rname, loc, cat, cnode, angle in fak_spots:
            rx, ry = calculate_svg_pos(cx, cy, 325, angle)
            db.session.add(SafetyResource(
                resource_code=rcode, resource_name=rname, resource_type=cat, floor_id=fid,
                location_desc=loc, status="operational", last_verified=date.today() - timedelta(days=15),
                next_inspection=date.today() + timedelta(days=165), specifications="OSHA compliant Class A 50-person trauma kit",
                corridor_node=cnode, svg_x=rx, svg_y=ry, notes="Supplies verified by campus health team."
            ))

        # Evacuation Chair
        rx_ec, ry_ec = calculate_svg_pos(cx, cy, 355, 170)
        db.session.add(SafetyResource(
            resource_code=f"EC-{f}01", resource_name="Evacuation Transit Chair", resource_type="evacuation_chair",
            floor_id=fid, location_desc=f"Floor {f} West Stairwell Landing", status="operational",
            last_verified=date.today() - timedelta(days=25), next_inspection=date.today() + timedelta(days=155),
            specifications="Tracked stair descent transit chair for mobility-impaired individuals",
            corridor_node=f"N_{f}_W_EXIT", svg_x=rx_ec, svg_y=ry_ec, notes="Tested load capacity 160kg."
        ))

    # AEDs
    db.session.add(SafetyResource(
        resource_code="AED-101", resource_name="Philips HeartStart AED", resource_type="aed", floor_id=floor_map[1],
        location_desc="Main Atrium next to Health Center", status="operational", last_verified=date.today() - timedelta(days=10),
        next_inspection=date.today() + timedelta(days=170), specifications="Voice-guided automatic defibrillator",
        corridor_node="N_1_CENTER", svg_x=500.0, svg_y=220.0, notes="Battery level 98%."
    ))
    db.session.add(SafetyResource(
        resource_code="AED-301", resource_name="Zoll AED Plus CPR Unit", resource_type="aed", floor_id=floor_map[3],
        location_desc="Central Computer Wing Atrium", status="operational", last_verified=date.today() - timedelta(days=10),
        next_inspection=date.today() + timedelta(days=170), specifications="CPR feedback and adult/pediatric electrode pads",
        corridor_node="N_3_CENTER", svg_x=500.0, svg_y=200.0, notes="Self-test status green."
    ))
    db.session.add(SafetyResource(
        resource_code="AED-501", resource_name="Medtronic LifePak CR2", resource_type="aed", floor_id=floor_map[5],
        location_desc="Dean's Research Corridor Hub", status="operational", last_verified=date.today() - timedelta(days=10),
        next_inspection=date.today() + timedelta(days=170), specifications="Connected wireless diagnostic defibrillator",
        corridor_node="N_5_CENTER", svg_x=500.0, svg_y=200.0, notes="Self-test status green."
    ))

    # Medical Room on Floor 1
    db.session.add(SafetyResource(
        resource_code="MED-RES-1", resource_name="Campus Health Center Facilities", resource_type="medical_room",
        floor_id=floor_map[1], location_desc="Campus Health Center (MED-101)", status="operational",
        last_verified=date.today(), next_inspection=date.today() + timedelta(days=180),
        specifications="Triage beds, oxygen concentrator, trauma kits, emergency burn dressings",
        corridor_node="N_1_CENTER", svg_x=500.0, svg_y=240.0, notes="Staffed nurse on duty."
    ))
    # Assembly Safe Area
    db.session.add(SafetyResource(
        resource_code="ASM-RES-1", resource_name="Primary Assembly Safe Zone", resource_type="assembly_point",
        floor_id=floor_map[1], location_desc="Central Quadrangle Safety Lawn", status="operational",
        last_verified=date.today(), next_inspection=date.today() + timedelta(days=180),
        specifications="Perimeter emergency lighting post, megaphone, first-aid muster station",
        corridor_node="N_ASSEMBLY_POINT", svg_x=500.0, svg_y=620.0, notes="Capacity 1,500 people."
    ))
    db.session.commit()

    # 5. Seed Realistic Demo Incidents (is_demo_data=True)
    print("[Seed] Populating realistic sample incidents (DEMO DATA)...")
    now = datetime.utcnow()
    user_alex = User.query.filter_by(email="student@campus.edu").first()
    user_eleanor = User.query.filter_by(email="faculty@campus.edu").first()
    user_sec = User.query.filter_by(email="security@campus.edu").first()
    user_chen = User.query.filter_by(email="robert.chen@campus.edu").first()
    user_admin = User.query.filter_by(email="admin@campus.edu").first()

    inc1 = EmergencyReport(
        reference_no="EMG-2026-F2-1084", reporter_id=user_alex.id, reporter_name=user_alex.name,
        reporter_role="Student", reporter_phone=user_alex.phone, emergency_type="Fire",
        severity="Critical", floor_id=floor_map[2], reported_location="LAB-201",
        location_details="Chemistry Laboratory - Fume Hood 3",
        description="Minor smoke observed from electrical hotplate under fume hood. Fire blanket deployed by lab instructor; require safety verification before classes resume.",
        status="Reported", is_demo_data=True, created_at=now - timedelta(minutes=15), updated_at=now - timedelta(minutes=15)
    )
    inc2 = EmergencyReport(
        reference_no="EMG-2026-F3-2291", reporter_id=user_eleanor.id, reporter_name=user_eleanor.name,
        reporter_role="Faculty", reporter_phone=user_eleanor.phone, emergency_type="Medical",
        severity="High", floor_id=floor_map[3], reported_location="CR-308",
        location_details="Classroom 308 - Row 3",
        description="Student experienced severe allergic reaction symptoms with shortness of breath. First aid kit administered; medical team requested on floor 3 immediately.",
        status="Acknowledged", is_demo_data=True, created_at=now - timedelta(minutes=30),
        acknowledged_at=now - timedelta(minutes=26), updated_at=now - timedelta(minutes=26), response_time_seconds=240
    )
    inc3 = EmergencyReport(
        reference_no="EMG-2026-F4-3410", reporter_id=user_sec.id, reporter_name=user_sec.name,
        reporter_role="Security Staff", reporter_phone=user_sec.phone, emergency_type="Electrical Hazard",
        severity="Medium", floor_id=floor_map[4], reported_location="CR-412",
        location_details="East Corridor Junction near Room 412",
        description="Water leakage from air conditioning unit pooling near the corridor electrical sub-distribution panel. Caution tape placed; electrical engineer dispatched.",
        status="Responding", is_demo_data=True, created_at=now - timedelta(hours=1, minutes=15),
        acknowledged_at=now - timedelta(hours=1, minutes=10), responding_at=now - timedelta(hours=1, minutes=2),
        updated_at=now - timedelta(hours=1, minutes=2), response_time_seconds=780
    )
    inc4 = EmergencyReport(
        reference_no="EMG-2026-F1-0492", reporter_id=user_chen.id, reporter_name=user_chen.name,
        reporter_role="Faculty", reporter_phone=user_chen.phone, emergency_type="Accident",
        severity="Medium", floor_id=floor_map[1], reported_location="LAB-101",
        location_details="Physics Laboratory - Optics Darkroom",
        description="Glass prism fell and shattered during experiment setup. Student sustained minor finger cut. Cleaned and bandaged with first-aid kit FAK-101.",
        status="Resolved", is_demo_data=True, created_at=now - timedelta(days=1, hours=3),
        acknowledged_at=now - timedelta(days=1, hours=2, minutes=56), responding_at=now - timedelta(days=1, hours=2, minutes=50),
        resolved_at=now - timedelta(days=1, hours=2, minutes=10), updated_at=now - timedelta(days=1, hours=2, minutes=10),
        response_time_seconds=3000
    )
    inc5 = EmergencyReport(
        reference_no="EMG-2026-F5-7712", reporter_id=user_admin.id, reporter_name=user_admin.name,
        reporter_role="Administrator", reporter_phone=user_admin.phone, emergency_type="Security Issue",
        severity="Low", floor_id=floor_map[5], reported_location="ST-E-5",
        location_details="Fifth Floor East Fire Exit Door",
        description="Fire exit door magnetic latch indicator displayed tamper warning. Inspected by security patrol; latch realigned and tested successfully.",
        status="Resolved", is_demo_data=True, created_at=now - timedelta(days=2, hours=6),
        acknowledged_at=now - timedelta(days=2, hours=5, minutes=55), responding_at=now - timedelta(days=2, hours=5, minutes=45),
        resolved_at=now - timedelta(days=2, hours=5, minutes=15), updated_at=now - timedelta(days=2, hours=5, minutes=15),
        response_time_seconds=2700
    )

    db.session.add_all([inc1, inc2, inc3, inc4, inc5])
    db.session.commit()

    # Seed Incident History Logs
    logs = [
        IncidentHistory(report_id=inc1.id, previous_status="None", new_status="Reported", changed_by_user_id=user_alex.id, performed_by=user_alex.name, notes="Emergency SOS submitted via digital dashboard.", timestamp=inc1.created_at),
        IncidentHistory(report_id=inc2.id, previous_status="None", new_status="Reported", changed_by_user_id=user_eleanor.id, performed_by=user_eleanor.name, notes="Medical SOS initiated for acute respiratory distress.", timestamp=inc2.created_at),
        IncidentHistory(report_id=inc2.id, previous_status="Reported", new_status="Acknowledged", changed_by_user_id=user_sec.id, performed_by=user_sec.name, notes="Alert transmitted to campus duty medical officer.", timestamp=inc2.acknowledged_at),
        IncidentHistory(report_id=inc3.id, previous_status="None", new_status="Reported", changed_by_user_id=user_sec.id, performed_by=user_sec.name, notes="Water pooling report logged.", timestamp=inc3.created_at),
        IncidentHistory(report_id=inc3.id, previous_status="Reported", new_status="Acknowledged", changed_by_user_id=user_sec.id, performed_by=user_sec.name, notes="Facilities notification dispatched.", timestamp=inc3.acknowledged_at),
        IncidentHistory(report_id=inc3.id, previous_status="Acknowledged", new_status="Responding", changed_by_user_id=user_sec.id, performed_by="Facilities Team", notes="Technicians on floor 4 with isolators.", timestamp=inc3.responding_at),
        IncidentHistory(report_id=inc4.id, previous_status="None", new_status="Reported", changed_by_user_id=user_chen.id, performed_by=user_chen.name, notes="Minor lab laceration report.", timestamp=inc4.created_at),
        IncidentHistory(report_id=inc4.id, previous_status="Responding", new_status="Resolved", changed_by_user_id=user_sec.id, performed_by=user_sec.name, notes="Student bandaged and cleared.", timestamp=inc4.resolved_at)
    ]
    db.session.add_all(logs)

    # Seed Assignments
    db.session.add(IncidentAssignment(report_id=inc2.id, assigned_staff_id=user_sec.id, assigned_staff_name="Officer David Miller", assignment_timestamp=inc2.acknowledged_at, response_notes="Assigned to quick medical check."))
    db.session.add(IncidentAssignment(report_id=inc3.id, assigned_staff_id=user_sec.id, assigned_staff_name="Facilities Response Team", assignment_timestamp=inc3.acknowledged_at, response_notes="Assigned for moisture extraction and breaker checks."))
    db.session.commit()

    # 6. Seed Emergency Drills
    print("[Seed] Populating emergency drill participation logs...")
    drills = [
        EmergencyDrill(title="Fall 2025 Full-Campus Fire Evacuation Drill", drill_date=date(2025, 10, 14), drill_type="Fire Drill", evacuation_time_seconds=264, participants_count=1180, status="Completed", lead_officer="Chief Security Officer", notes="Academic block cleared in 4m 24s. Headcount matched with zero discrepancies."),
        EmergencyDrill(title="Spring 2026 Severe Weather & Earthquake Shelter Drill", drill_date=date(2026, 3, 20), drill_type="Earthquake / Shelter-in-Place", evacuation_time_seconds=185, participants_count=940, status="Completed", lead_officer="Director of Safety", notes="Classrooms executed drop-cover-hold protocol within 3 minutes."),
        EmergencyDrill(title="Winter 2025 Lab Chemical Spill Containment Drill", drill_date=date(2025, 12, 5), drill_type="Hazardous Material", evacuation_time_seconds=310, participants_count=160, status="Completed", lead_officer="Safety Officer Sharma", notes="Floor 2 chemistry labs practiced fume hood isolation and containment.")
    ]
    db.session.add_all(drills)
    db.session.commit()

    print("[Seed] Database seeding completed successfully with SQLAlchemy ORM!")

if __name__ == '__main__':
    from backend.app import create_app
    app = create_app()
    with app.app_context():
        _do_seed()

# Campus Emergency and Safety Management System — Backend & System Guide

> **“Smart Campus. Safer Tomorrow.”**

A complete, production-grade web application and backend for managing campus emergencies, indoor five-floor building navigation, safety equipment inspection, incident tracking, and safe evacuation routing.

The college layout models a **semi-circular academic block** with **five floors**, **80 uniquely identified classrooms**, 10 departmental laboratories, male and female washrooms on every floor, two seminar halls (**Seminar Hall A** on Floor 2 and **Seminar Hall B** on Floor 4), fire-rated staircases, elevators, emergency exits, and an outdoor central safety assembly area.

---

## 1. Technology Stack

- **Core Backend Framework**: Python 3 (3.10+ / 3.14), Flask 3.1
- **Database & ORM**: SQLite3 with **SQLAlchemy ORM** (`Flask-SQLAlchemy`)
- **Authentication & Security**: **Flask-JWT-Extended** (JSON Web Tokens) & secure session-based authentication; **Werkzeug** password hashing (`scrypt` / `pbkdf2:sha256`); role-based access control (RBAC) enforced on private endpoints
- **CORS Handling**: `Flask-CORS` for cross-origin resource sharing
- **Environment Management**: `python-dotenv` loading `.env` securely
- **Indoor Mapping & Egress**: Graph-based Dijkstra pathfinding along curved corridor nodes with dynamic obstacle/corridor blockade avoidance
- **Frontend Integration**: Vanilla HTML5, CSS3 (Light Blue, White, Navy Blue palette), Vanilla ES6 JavaScript, SVG interactive floor plans, and Service Worker offline caching

---

## 2. Database Design & Tables

The SQLite database is managed via **SQLAlchemy ORM** (`backend/models.py`) with foreign keys, index constraints, and transactional consistency:

1. **`users`**:
   - `id`: Integer, Primary Key, Autoincrement
   - `name`: String(120), Nullable=False
   - `email`: String(120), Unique=True, Index=True
   - `password_hash`: String(256), Nullable=False
   - `role`: String(30), Default='Student' (Student, Faculty, Security Staff, Administrator)
   - `department`: String(100)
   - `phone`: String(30)
   - `account_status`: String(20), Default='active'
   - `created_at`: DateTime, Default=UTC Now

2. **`floors`**:
   - `id`: Integer, Primary Key
   - `floor_number`: Integer, Unique=True, Index=True (1 to 5)
   - `name`: String(100), Nullable=False
   - `subtitle`: String(150)
   - `floor_plan_data`: Text
   - `evacuation_plan_summary`: Text

3. **`rooms`**:
   - `id`: Integer, Primary Key
   - `room_number`: String(30), Unique=True, Index=True (e.g. `CR-101` to `CR-516`)
   - `room_name`: String(150), Nullable=False
   - `floor_id`: Integer, ForeignKey('floors.id')
   - `room_type`: String(50), Nullable=False (Classroom, Laboratory, Seminar Hall, Washroom, Office, Staircase, Medical, Exit, Elevator, Assembly)
   - `wing`: String(30), Default='Center' (West, Center, East, Outdoor)
   - `capacity`: Integer, Default=40
   - `corridor_node`: String(50), Nullable=False
   - `svg_x`: Float, `svg_y`: Float, `svg_angle`: Float
   - `is_accessible`: Boolean, Default=True
   - `description`: Text
   - *(Contains exactly 80 classrooms, 10 labs, 10 washrooms, 2 seminar halls, medical room, entrance, stairwells, and outdoor safe zone)*

4. **`emergencies`** (Emergency Reports):
   - `id`: Integer, Primary Key
   - `reference_no`: String(40), Unique=True, Index=True (e.g. `EMG-2026-F2-1084`)
   - `reporter_id`: Integer, ForeignKey('users.id'), Nullable=True
   - `reporter_name`: String(120), Nullable=False
   - `reporter_role`: String(50), Default='Student'
   - `reporter_phone`: String(30)
   - `emergency_type`: String(50), Nullable=False (Fire, Medical, Accident, Electrical Hazard, Security Issue, Other)
   - `description`: Text, Nullable=False
   - `floor_id`: Integer, ForeignKey('floors.id'), Nullable=False
   - `room_id`: Integer, ForeignKey('rooms.id'), Nullable=True
   - `reported_location`: String(150)
   - `location_details`: String(255)
   - `severity`: String(20), Default='Medium' (Low, Medium, High, Critical)
   - `status`: String(20), Default='Reported' (Reported, Acknowledged, Responding, Resolved)
   - `photo_url`: String(255)
   - `idempotency_key`: String(100), Unique=True, Index=True (for offline deduplication)
   - `is_demo_data`: Boolean, Default=False
   - `created_at`: DateTime, `updated_at`: DateTime
   - `acknowledged_at`: DateTime, `responding_at`: DateTime, `resolved_at`: DateTime
   - `response_time_seconds`: Integer, Default=0

5. **`safety_resources`**:
   - `id`: Integer, Primary Key
   - `resource_code`: String(30), Unique=True, Index=True (e.g. `FE-101`, `AED-101`)
   - `resource_name`: String(120), Nullable=False
   - `resource_type`: String(50), Nullable=False (fire_extinguisher, fire_alarm, first_aid, aed, medical_room, emergency_exit, evacuation_chair, assembly_point)
   - `floor_id`: Integer, ForeignKey('floors.id')
   - `location_desc`: String(200), Nullable=False
   - `status`: String(30), Default='operational' (operational, under_inspection, maintenance_needed)
   - `last_verified`: Date, `next_inspection`: Date
   - `specifications`: String(255), `notes`: Text

6. **`incident_assignments`**:
   - `id`: Integer, Primary Key
   - `report_id`: Integer, ForeignKey('emergencies.id')
   - `assigned_staff_id`: Integer, ForeignKey('users.id')
   - `assigned_staff_name`: String(120), Nullable=False
   - `assignment_timestamp`: DateTime, Default=UTC Now
   - `response_notes`: Text

7. **`incident_history`**:
   - `id`: Integer, Primary Key
   - `report_id`: Integer, ForeignKey('emergencies.id')
   - `previous_status`: String(30), `new_status`: String(30)
   - `changed_by_user_id`: Integer, ForeignKey('users.id')
   - `performed_by`: String(120), Nullable=False
   - `notes`: Text, `timestamp`: DateTime

8. **`notifications`**:
   - `id`: Integer, Primary Key
   - `user_id`: Integer, ForeignKey('users.id'), Nullable=True
   - `target_role`: String(30) (Student, Faculty, Security Staff, Administrator)
   - `title`: String(150), `message`: Text
   - `report_id`: Integer, ForeignKey('emergencies.id')
   - `is_read`: Boolean, Default=False, `created_at`: DateTime

9. **`blocked_routes`**:
   - `id`: Integer, Primary Key
   - `floor_number`: Integer, `node_or_corridor`: String(100)
   - `reason`: String(255), `reported_by`: String(120)
   - `is_active`: Boolean, Default=True
   - `created_at`: DateTime, `cleared_at`: DateTime

10. **`emergency_drills`**:
    - `id`: Integer, Primary Key
    - `title`: String(150), `drill_date`: Date, `drill_type`: String(80)
    - `evacuation_time_seconds`: Integer, `participants_count`: Integer
    - `status`: String(30), `lead_officer`: String(120), `notes`: Text

---

## 3. Project Structure

```
c:\IP proj\
├── backend/
│   ├── __init__.py
│   ├── app.py                     # Flask application factory
│   ├── config.py                  # Configurations (Dev, Testing, Prod)
│   ├── extensions.py              # db = SQLAlchemy(), jwt = JWTManager(), cors = CORS()
│   ├── models.py                  # SQLAlchemy ORM database models
│   ├── seed.py                    # Comprehensive database seeder
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py                # /api/auth (Login, Register, Logout, Me, Demo Switch)
│   │   ├── floors.py              # /api/floors
│   │   ├── rooms.py               # /api/rooms & /api/rooms/search
│   │   ├── emergencies.py         # /api/emergencies & /api/sync/emergencies
│   │   ├── resources.py           # /api/resources
│   │   ├── dashboard.py           # /api/dashboard & /api/analytics
│   │   ├── routes_api.py          # /api/routes?from=...&to=... & blocked routes
│   │   └── notifications.py       # /api/notifications
│   └── services/
│       ├── __init__.py
│       ├── emergency_service.py   # SOS lifecycle, rule-based severity, response times
│       ├── route_service.py       # Semi-circular graph Dijkstra & evacuation routing
│       └── notification_service.py# In-app notifications & external interface
├── tests/
│   ├── __init__.py
│   └── test_backend.py            # Automated test suite covering 14 core cases
├── static/
│   ├── css/
│   ├── js/
│   └── favicon.svg
├── templates/
│   ├── index.html
│   └── offline.html
├── app.py                         # Root entry point running the application
├── requirements.txt               # Dependencies
├── .env.example                   # Environment configuration template
├── .env                           # Local environment file
├── .gitignore                     # Git ignore rules
└── README.md
```

---

## 4. REST API Documentation

### Authentication & Authorization
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user account with hashed password | Public |
| `POST` | `/api/auth/login` | Authenticate user, returns JWT token & starts session | Public |
| `POST` | `/api/auth/logout` | Terminate session & clear tokens | Public |
| `GET` | `/api/auth/me` | Retrieve profile of authenticated user | Session or JWT |
| `POST` | `/api/auth/demo-switch` | One-click role switch for demonstration | Public |

### Campus Information
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/floors` | List all 5 campus floors with details | Public |
| `GET` | `/api/floors/<floor_id>` | Detailed floor plan, rooms, resources, and blockades | Public |
| `GET` | `/api/floors/<floor_id>/rooms` | List all rooms on a specific floor | Public |
| `GET` | `/api/rooms` | Filter rooms (`?floor_id=X&type=Y&search=Z`) | Public |
| `GET` | `/api/rooms/search?q=<query>` | Live room search by room number, name, or description | Public |
| `GET` | `/api/rooms/<room_id>` | Detail of specific room by ID or code (e.g. `CR-204`) | Public |
| `PATCH`| `/api/rooms/<room_id>` | Configure room name, capacity, type (Administrator only) | Administrator |

### Emergency SOS Reporting
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/emergencies` | Submit emergency SOS report (supports photo attachment & idempotency key) | Public / User |
| `GET` | `/api/emergencies` | List all emergencies (`?floor_id=X&type=Y&status=Z&severity=W`) | Public / Staff |
| `GET` | `/api/emergencies/<report_id>` | Get report details with full activity timeline audit log | Public / Staff |
| `PATCH`| `/api/emergencies/<report_id>/status`| Update status (`Reported` → `Acknowledged` → `Responding` → `Resolved`) | Security / Admin |
| `POST` | `/api/emergencies/<report_id>/assign`| Assign report to response personnel or quick unit | Security / Admin |
| `POST` | `/api/emergencies/<report_id>/notes` | Append timestamped responder note to audit log | Authenticated |
| `POST` | `/api/sync/emergencies` | Synchronize queued offline reports with idempotency deduplication | Public / User |

### Safety Resources
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/resources` | List safety resources (`?floor_id=X&category=Y&status=Z`) | Public |
| `GET` | `/api/resources/<resource_id>` | Detail of specific safety resource | Public |
| `POST` | `/api/resources` | Register new safety equipment (fire extinguisher, AED, etc.) | Security / Admin |
| `PATCH`| `/api/resources/<resource_id>` | Update inspection status, last verified date, notes | Security / Admin |
| `DELETE`| `/api/resources/<resource_id>`| Delete safety resource record | Administrator |

### Campus Route & Evacuation Backend
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/routes?from=<room_id>&to=<room_id>` | Calculate shortest corridor route avoiding blocked paths | Public |
| `POST` | `/api/navigation/evacuate` | Calculate verified safe evacuation route to ground exit or assembly lawn | Public |
| `GET` | `/api/routes/blocked` | List active corridor and stairwell blockades | Public |
| `POST` | `/api/routes/blocked` | Flag corridor or exit as BLOCKED (triggers real-time rerouting) | Security / Admin |
| `DELETE`| `/api/routes/blocked/<id>` | Clear corridor blockade and reopen path | Security / Admin |

### Dashboard & Analytics
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard/stats` | Real-time KPI counts (Classrooms, Floors, Active, Resources, Response Time) | Public |
| `GET` | `/api/dashboard/recent-incidents`| List 6 most recent emergency incident records | Public |
| `GET` | `/api/analytics/incidents-by-type`| Aggregated count of incidents grouped by emergency type | Public |
| `GET` | `/api/analytics/incidents-by-floor`| Aggregated count of incidents grouped by floor | Public |
| `GET` | `/api/analytics/response-times`| Real calculated average response times from database timestamps | Public |
| `GET` | `/api/analytics/dashboard` | Aggregated statistics, drill logs, and charts for frontend | Public |
| `GET` | `/api/notifications` | Get in-app notifications for authenticated user/role | Public / User |

---

## 5. Offline Support & Sync Mechanism

The system supports seamless offline resilience:
- **Client Queue**: When a device loses internet connectivity, emergency reports are saved locally in the browser/client storage (`localStorage.campus_offline_incidents`) with status `Pending Sync (Offline)` and an `idempotency_key`.
- **Sync Endpoint (`POST /api/sync/emergencies`)**: When connectivity resumes, the client automatically posts queued reports in a batch.
- **Idempotency**: The backend checks `EmergencyReport.idempotency_key` to guarantee duplicate retries do not create multiple database records.
- **Timestamp Integrity**: The original report creation time (`created_at`) is preserved while the server records receipt time.
- **Important Physical Limitation Disclosure**:
  > *Note: A backend server cannot receive a transmission from a device that has no network connection. When a device is offline, reports remain securely buffered on the client device until a wireless, cellular, or local intranet connection is re-established.*

---

## 6. Installation & Execution Instructions

### Step 1: Install Dependencies
```powershell
python -m pip install -r requirements.txt
```

### Step 2: Initialize & Seed Database
Executes the SQLAlchemy ORM seeder to create all tables and populate 80 classrooms, 10 labs, 10 washrooms, 2 seminar halls, 50 safety resources, demo accounts, and drill records:
```powershell
python -c "from backend.app import create_app; from backend.seed import _do_seed; app = create_app(); app.app_context().push(); _do_seed()"
```

### Step 3: Run the Automated Test Suite
Runs the 14 comprehensive test cases against an isolated in-memory SQLite database:
```powershell
python -m unittest tests/test_backend.py
```
*(All 14 tests execute and pass with 0 errors and 0 failures.)*

### Step 4: Start the Flask Application
```powershell
python app.py
```

### Step 5: Access the Web Application
Open your web browser and navigate to:
**[http://127.0.0.1:5000](http://127.0.0.1:5000)** or **[http://localhost:5000](http://localhost:5000)**

---

## 7. Demo Accounts & Credentials

| Role | Email | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@campus.edu` | `admin123` | Full system control: configure rooms, manage safety resources, delete records, mark blockades, view audit analytics |
| **Security Staff** | `security@campus.edu` | `security123` | Operational console: assign responders, update incident status (`Reported` → `Resolved`), append officer notes |
| **Faculty** | `faculty@campus.edu` | `faculty123` | View campus map, search rooms, submit emergency SOS reports, track personal incidents |
| **Student** | `student@campus.edu` | `student123` | View campus map, search rooms, submit emergency SOS reports, track personal incidents |

*(Use the **Role Switcher** pills in the header to switch roles instantly with a single click during evaluation).*

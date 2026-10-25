from flask import Blueprint, request, jsonify, session
from functools import wraps
from models import UserModel

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Authentication required", "status": 401}), 401
        return f(*args, **kwargs)
    return decorated_function

def role_required(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if "user_id" not in session:
                return jsonify({"error": "Authentication required", "status": 401}), 401
            user_role = session.get("user_role")
            if user_role not in allowed_roles:
                return jsonify({
                    "error": f"Access denied. Required roles: {', '.join(allowed_roles)}. Your role: {user_role}",
                    "status": 403
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or request.form
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = UserModel.authenticate(email, password)
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    session["user_id"] = user["id"]
    session["user_name"] = user["name"]
    session["user_email"] = user["email"]
    session["user_role"] = user["role"]
    session.permanent = True

    return jsonify({
        "message": "Login successful",
        "user": user
    }), 200

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or request.form
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")
    role = data.get("role", "student").strip().lower()
    department = data.get("department", "General").strip()
    phone = data.get("phone", "").strip()

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400

    if role not in ("student", "faculty", "security", "admin"):
        return jsonify({"error": "Invalid role specified"}), 400

    existing = UserModel.get_by_email(email)
    if existing:
        return jsonify({"error": "An account with this email already exists"}), 409

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long"}), 400

    new_user = UserModel.create(name, email, password, role, department, phone)
    session["user_id"] = new_user["id"]
    session["user_name"] = new_user["name"]
    session["user_email"] = new_user["email"]
    session["user_role"] = new_user["role"]

    return jsonify({
        "message": "Registration successful",
        "user": new_user
    }), 201

@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    if "user_id" in session:
        user = UserModel.get_by_id(session["user_id"])
        if user:
            return jsonify({"authenticated": True, "user": user}), 200
    
    # Return default demo student profile for seamless out-of-the-box demonstration
    default_user = UserModel.get_by_email("student@campus.edu")
    if default_user:
        return jsonify({
            "authenticated": False,
            "guest": True,
            "suggested_user": {
                "id": default_user["id"],
                "name": default_user["name"],
                "email": default_user["email"],
                "role": default_user["role"],
                "department": default_user["department"],
                "phone": default_user["phone"]
            }
        }), 200

    return jsonify({"authenticated": False}), 200

@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"}), 200

@auth_bp.route("/demo-switch", methods=["POST"])
def demo_switch():
    """
    Convenience endpoint for college demonstration: allows switching active role
    between student, faculty, security, and admin instantly.
    """
    data = request.get_json(silent=True) or request.form
    target_role = data.get("role", "student").strip().lower()

    role_emails = {
        "admin": "admin@campus.edu",
        "security": "security@campus.edu",
        "faculty": "faculty@campus.edu",
        "student": "student@campus.edu"
    }

    email = role_emails.get(target_role)
    if not email:
        return jsonify({"error": "Invalid demo role"}), 400

    user = UserModel.get_by_email(email)
    if not user:
        return jsonify({"error": f"Demo account for {target_role} not found"}), 404

    session["user_id"] = user["id"]
    session["user_name"] = user["name"]
    session["user_email"] = user["email"]
    session["user_role"] = user["role"]

    return jsonify({
        "message": f"Switched to demo {target_role.upper()} session",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "department": user["department"],
            "phone": user["phone"]
        }
    }), 200

@auth_bp.route("/users", methods=["GET"])
@role_required(["admin"])
def list_users():
    users = UserModel.list_all()
    return jsonify({"users": users, "total": len(users)}), 200

import os
from pathlib import Path
from flask import Flask, render_template, send_from_directory, jsonify
from backend.config import Config
from backend.extensions import db, jwt, cors
from backend.routes import (
    auth_bp, floors_bp, rooms_bp, emergencies_bp,
    sync_bp, resources_bp, dashboard_bp, analytics_bp,
    routes_bp, nav_bp, notifications_bp
)

def create_app(config_class=Config):
    base_dir = Path(__file__).resolve().parent.parent

    app = Flask(
        __name__,
        static_folder=str(base_dir / "static"),
        template_folder=str(base_dir / "templates")
    )
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, supports_credentials=True)

    # Ensure uploads directory exists
    os.makedirs(app.config.get("UPLOAD_FOLDER", str(base_dir / "static" / "uploads")), exist_ok=True)

    # Register Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(floors_bp)
    app.register_blueprint(rooms_bp)
    app.register_blueprint(emergencies_bp)
    app.register_blueprint(sync_bp)
    app.register_blueprint(resources_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(routes_bp)
    app.register_blueprint(nav_bp)
    app.register_blueprint(notifications_bp)

    # Backward-compatibility alias for /api/incidents -> /api/emergencies
    app.register_blueprint(emergencies_bp, url_prefix='/api/incidents', name='incidents')

    # Frontend routes
    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/sw.js')
    def service_worker():
        response = send_from_directory(str(base_dir / "static"), 'sw.js')
        response.headers['Service-Worker-Allowed'] = '/'
        response.headers['Cache-Control'] = 'no-cache'
        return response

    @app.route('/offline.html')
    def offline_page():
        return render_template('offline.html')

    # System Health Check
    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({
            "status": "healthy",
            "system": "Campus Emergency and Safety Management System",
            "tagline": "Smart Campus. Safer Tomorrow.",
            "backend": "Python Flask with SQLAlchemy ORM",
            "database": "SQLite",
            "version": "2.0.0"
        }), 200

    # Error Handlers
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request", "details": str(e), "status": 400}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"error": "Unauthorized access", "status": 401}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden", "status": 403}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found", "status": 404}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error occurred", "status": 500}), 500

    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    print(f"Starting Campus Safety Backend on http://{Config.HOST}:{Config.PORT}")
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)

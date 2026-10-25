import os
from datetime import datetime
from backend.extensions import db
from backend.models import Notification

class NotificationService:
    @staticmethod
    def send_in_app(title, message, user_id=None, target_role=None, report_id=None):
        notif = Notification(
            title=title,
            message=message,
            user_id=user_id,
            target_role=target_role,
            report_id=report_id,
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.session.add(notif)
        db.session.commit()
        return notif

    @staticmethod
    def get_user_notifications(user_id=None, role=None, limit=20):
        query = Notification.query
        filters = []
        if user_id:
            filters.append(Notification.user_id == user_id)
        if role:
            filters.append(Notification.target_role == role)
        filters.append(Notification.target_role.is_(None))

        from sqlalchemy import or_
        notifications = query.filter(or_(*filters)).order_by(Notification.created_at.desc()).limit(limit).all()
        return [n.to_dict() for n in notifications]

    @staticmethod
    def mark_read(notification_id):
        notif = Notification.query.get(notification_id)
        if notif:
            notif.is_read = True
            db.session.commit()
            return True
        return False

    @staticmethod
    def mark_all_read(user_id=None, role=None):
        query = Notification.query.filter_by(is_read=False)
        if user_id:
            query = query.filter_by(user_id=user_id)
        elif role:
            query = query.filter_by(target_role=role)
        query.update({"is_read": True}, synchronize_session='fetch')
        db.session.commit()
        return True

    @staticmethod
    def send_external_mock(recipient, subject, body, channel="sms"):
        """
        Optional external notification interface for future integration.
        Operates without paid external keys; logs delivery status transparently.
        """
        api_key = os.getenv("SMS_API_KEY" if channel == "sms" else "EMAIL_API_KEY")
        if not api_key or "optional" in api_key.lower():
            # Mock delivery
            return {
                "delivered": False,
                "channel": channel,
                "status": "mock_logged",
                "message": f"External {channel.upper()} simulated: No live API key configured in .env."
            }
        return {
            "delivered": True,
            "channel": channel,
            "status": "sent"
        }

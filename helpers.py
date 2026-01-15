from flask import flash, redirect, render_template, request, session
from functools import wraps


def apology(message, code=400):
    """Render message as an apology to user."""
    def escape(s):
        """Escape special characters for display."""
        for old, new in [("-", "--"), (" ", "-"), ("_", "__"), ("?", "~q"),
                         ("%", "~p"), ("#", "~h"), ("/", "~s"), ("\"", "''")]:
            s = s.replace(old, new)
        return s
    return render_template("apology.html", top=code, bottom=escape(message)), code


def login_required(f):
    """Decorate routes to require login."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None:
            flash("Please log in to continue.")
            return redirect(f"/login?next={request.path}")
        return f(*args, **kwargs)
    return decorated_function


def format_time(minutes):
    """Convert minutes to readable format."""
    if not minutes:
        return "Not specified"
    
    hours = minutes // 60
    mins = minutes % 60
    
    if hours == 0:
        return f"{mins}m"
    elif mins == 0:
        return f"{hours}h"
    else:
        return f"{hours}h {mins}m"


def get_mood_emoji(mood):
    """Get emoji for mood."""
    mood_emojis = {
        "happy": "😊",
        "anxious": "😰", 
        "tired": "😴",
        "frustrated": "😤",
        "focused": "🎯",
        "overwhelmed": "😵‍💫",
        "bored": "😑",
        "excited": "🤩"
    }
    return mood_emojis.get(mood.lower(), "😐")


def get_energy_color(level):
    """Get color for energy level."""
    if level >= 8:
        return "success"
    elif level >= 6:
        return "warning"
    elif level >= 4:
        return "info"
    else:
        return "danger"
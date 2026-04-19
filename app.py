import logging
import os
import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from cs50 import SQL
from flask import Flask, Response, flash, jsonify, redirect, render_template, request, session
from flask_session import Session
from werkzeug.security import check_password_hash, generate_password_hash

from helpers import apology, login_required, format_time, get_mood_emoji, get_energy_color

# Configure application
app = Flask(__name__)

# Core security/config
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or os.urandom(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# Configure session to use filesystem (instead of signed cookies)
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"

# Keep server-side session files out of the repo and away from project root
session_dir = Path(app.instance_path) / "flask_session"
session_dir.mkdir(parents=True, exist_ok=True)
app.config["SESSION_FILE_DIR"] = str(session_dir)
Session(app)

# Configure CS50 Library to use SQLite database
# cs50.SQL requires that the SQLite file already exists.
db_path = Path(__file__).resolve().with_name("procrastination.db")
db_path.touch(exist_ok=True)
db = SQL(f"sqlite:///{db_path}")

# Logging (minimal but useful)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("procrastination")


PRODUCTIVITY_QUOTES = [
    {
        "text": "Start with the next smallest step. Momentum is built, not found.",
        "author": "ProcrastiNation",
    },
    {
        "text": "A focused hour today is worth a perfect plan tomorrow.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Clarity comes from action, not endless analysis.",
        "author": "ProcrastiNation",
    },
    {
        "text": "When in doubt, reduce the task size and begin.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Discipline is remembering what you want most.",
        "author": "ProcrastiNation",
    },
    {
        "text": "You do not need motivation to start; starting creates motivation.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Done is a daily habit, not a one-time event.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Protect your peak hours like your most valuable asset.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Small wins compound into serious confidence.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Choose progress over pressure.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Complex goals are completed one focused block at a time.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Your calendar reveals your priorities more than your intentions.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Perfection delays. Consistency delivers.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Attention is finite. Spend it on what moves the needle.",
        "author": "ProcrastiNation",
    },
    {
        "text": "If it matters, schedule it before distractions do.",
        "author": "ProcrastiNation",
    },
    {
        "text": "A clear finish line turns effort into results.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Focus is saying no to the noise.",
        "author": "ProcrastiNation",
    },
    {
        "text": "The fastest way forward is often the simplest next action.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Energy management is time management with better outcomes.",
        "author": "ProcrastiNation",
    },
    {
        "text": "Keep promises to your future self in 25-minute increments.",
        "author": "ProcrastiNation",
    },
]

WIZARD_MOOD_OPTIONS = [
    {"key": "overwhelmed", "label": "Overwhelmed", "emoji": "😰"},
    {"key": "anxious", "label": "Anxious", "emoji": "😟"},
    {"key": "bored", "label": "Bored", "emoji": "😑"},
    {"key": "tired", "label": "Tired", "emoji": "😴"},
    {"key": "distracted", "label": "Distracted", "emoji": "🤔"},
]

WIZARD_TRIGGER_OPTIONS = [
    "Too big",
    "Unclear",
    "Not motivated",
    "Fear of failure",
    "Too tired",
    "Something else",
]

WIZARD_ENV_OPTIONS = [
    {"key": "home", "label": "Home", "emoji": "🏠"},
    {"key": "cafe", "label": "Cafe", "emoji": "☕"},
    {"key": "office", "label": "Office", "emoji": "🏢"},
    {"key": "phone", "label": "Phone", "emoji": "📱"},
    {"key": "bed", "label": "Bed", "emoji": "🛏"},
]

TASK_STATUS_LABELS = {
    "pending": "Pending",
    "in_progress": "In Progress",
    "completed": "Done",
    "abandoned": "Abandoned",
}


def _get_user_initials(username: str) -> str:
    if not username:
        return "?"
    parts = [p for p in username.replace("_", " ").split(" ") if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return username[:2].upper()


def _activity_streak_days(user_id: int) -> int:
    """Consecutive-day streak based on logging procrastination episodes.

    Counts consecutive days ending today, or (if no log today) ending yesterday.
    """
    rows = db.execute(
        """
        SELECT date(timestamp) as day
        FROM procrastination_logs
        WHERE user_id = ?
        GROUP BY date(timestamp)
        ORDER BY day DESC
        LIMIT 370
        """,
        user_id,
    )

    day_set = {r["day"] for r in rows if r.get("day")}
    if not day_set:
        return 0

    today = datetime.utcnow().date()
    start = today
    if start.isoformat() not in day_set:
        start = today.fromordinal(today.toordinal() - 1)
        if start.isoformat() not in day_set:
            return 0

    streak = 0
    cursor = start
    while cursor.isoformat() in day_set:
        streak += 1
        cursor = cursor.fromordinal(cursor.toordinal() - 1)
    return streak


def _time_of_day_greeting(now: datetime) -> str:
    if now.hour < 12:
        return "Good morning"
    if now.hour < 18:
        return "Good afternoon"
    return "Good evening"


def _first_name(username: str) -> str:
    if not username:
        return "there"
    parts = [p for p in username.replace("_", " ").split(" ") if p]
    if not parts:
        return "there"
    return parts[0].capitalize()


def _parse_sqlite_datetime(value):
    if not value:
        return None
    raw = str(value)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _deadline_countdown(deadline_raw):
    deadline_dt = _parse_sqlite_datetime(deadline_raw)
    if not deadline_dt:
        return "No deadline", "none"

    delta = deadline_dt - datetime.utcnow()
    total_seconds = int(delta.total_seconds())
    abs_seconds = abs(total_seconds)

    if total_seconds < 0:
        if abs_seconds < 3600:
            return f"Overdue by {max(1, abs_seconds // 60)}m", "overdue"
        if abs_seconds < 86400:
            return f"Overdue by {abs_seconds // 3600}h", "overdue"
        return f"Overdue by {abs_seconds // 86400}d", "overdue"

    if total_seconds < 3600:
        return f"Due in {max(1, total_seconds // 60)}m", "soon"
    if total_seconds < 86400:
        return f"Due in {total_seconds // 3600}h", "soon"
    return f"Due in {total_seconds // 86400}d", "normal"


def _calculate_focus_score(tasks_completed: int, procrastination_count: int) -> int:
    total_events = tasks_completed + procrastination_count
    if total_events <= 0:
        return 0
    return int(round((tasks_completed / total_events) * 100))


def _next_board_order(user_id: int, status: str) -> int:
    row = db.execute(
        """
        SELECT COALESCE(MAX(board_order), 0) AS max_order
        FROM tasks
        WHERE user_id = ? AND status = ?
        """,
        user_id,
        status,
    )
    return int(row[0]["max_order"]) + 1


def _fetch_active_tasks_for_log(user_id: int):
    tasks = db.execute(
        """
        SELECT id, title, description, importance, deadline
        FROM tasks
        WHERE user_id = ? AND status IN ('pending', 'in_progress')
        ORDER BY importance DESC, deadline ASC, id DESC
        """,
        user_id,
    )
    for task in tasks:
        task["importance"] = int(task.get("importance") or 0)
        task["deadline_countdown"], task["deadline_state"] = _deadline_countdown(task.get("deadline"))
    return tasks


def _build_log_insight(mood: str, energy_level: int) -> str:
    if energy_level <= 3 and mood in {"tired", "overwhelmed"}:
        return "Your pattern points to energy overload. Try a 10-minute reset, then restart with the smallest concrete action."
    if mood == "overwhelmed":
        return "This looks like scope friction. Break the task into one 15-minute chunk and only commit to that first chunk."
    if mood == "anxious":
        return "Anxiety usually spikes when success criteria are fuzzy. Define what 'done for today' means in one sentence before continuing."
    if mood == "bored" and energy_level >= 6:
        return "You had enough energy but low stimulation. Raise challenge slightly or add a timer sprint to make it engaging."
    if mood == "tired":
        return "Fatigue was likely the main blocker. Shift this task to your peak-energy window and keep it lighter right now."
    if mood == "distracted":
        return "This signals context switching. Reduce open tabs and protect one distraction-free block for your next attempt."
    if energy_level >= 8:
        return "Energy is available. Your best lever now is clarity: pick one deliverable and finish it before switching."
    return "You captured a valuable signal. Repeating this log over time will help isolate your highest-impact trigger."


def _task_status_label(status: str) -> str:
    return TASK_STATUS_LABELS.get(status, "Unknown")


def _task_importance_band(importance: int) -> str:
    if importance >= 5:
        return "critical"
    if importance == 4:
        return "high"
    if importance == 3:
        return "medium"
    return "low"


def _task_deadline_meta(deadline_raw):
    deadline_dt = _parse_sqlite_datetime(deadline_raw)
    if not deadline_dt:
        return {
            "deadline_countdown": "No deadline",
            "deadline_state": "none",
            "due_category": "any",
            "deadline_sort": 9999999999,
            "deadline_input": "",
        }

    today = datetime.utcnow().date()
    due_date = deadline_dt.date()
    deadline_input = deadline_dt.strftime("%Y-%m-%dT%H:%M")

    if due_date < today:
        days = (today - due_date).days
        label = f"OVERDUE {days} day{'s' if days != 1 else ''}"
        return {
            "deadline_countdown": label,
            "deadline_state": "overdue",
            "due_category": "overdue",
            "deadline_sort": int(deadline_dt.timestamp()),
            "deadline_input": deadline_input,
        }

    if due_date == today:
        return {
            "deadline_countdown": "Due today",
            "deadline_state": "today",
            "due_category": "today",
            "deadline_sort": int(deadline_dt.timestamp()),
            "deadline_input": deadline_input,
        }

    days = (due_date - today).days
    week_end = today + timedelta(days=(6 - today.weekday()))
    due_category = "week" if due_date <= week_end else "later"

    return {
        "deadline_countdown": f"Due in {days} day{'s' if days != 1 else ''}",
        "deadline_state": "soon" if days <= 3 else "normal",
        "due_category": due_category,
        "deadline_sort": int(deadline_dt.timestamp()),
        "deadline_input": deadline_input,
    }


def _serialize_task_for_tasks_page(task):
    importance = int(task.get("importance") or 3)
    importance = max(1, min(5, importance))

    created_dt = _parse_sqlite_datetime(task.get("created_at"))
    created_sort = int(created_dt.timestamp()) if created_dt else 0
    created_label = created_dt.strftime("%b %d, %Y") if created_dt else "Unknown"

    description = (task.get("description") or "").strip()
    description_snippet = description
    if len(description_snippet) > 140:
        description_snippet = f"{description_snippet[:137].rstrip()}..."

    deadline_meta = _task_deadline_meta(task.get("deadline"))
    status = task.get("status") or "pending"

    return {
        "id": int(task["id"]),
        "title": task.get("title") or "Untitled",
        "description": description,
        "description_snippet": description_snippet,
        "estimated_time": task.get("estimated_time"),
        "estimated_label": format_time(task.get("estimated_time")),
        "importance": importance,
        "importance_band": _task_importance_band(importance),
        "status": status,
        "status_label": _task_status_label(status),
        "status_class": f"taskm-status-{status}",
        "created_sort": created_sort,
        "created_label": created_label,
        **deadline_meta,
    }


def _fetch_task_row_for_user(task_id: int, user_id: int):
    rows = db.execute(
        """
        SELECT id, title, description, estimated_time, importance, deadline, status, created_at, completed_at
        FROM tasks
        WHERE id = ? AND user_id = ?
        """,
        task_id,
        user_id,
    )
    return rows[0] if rows else None


def _parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None


def _week_start(day_value):
    return day_value - timedelta(days=day_value.weekday())


def _iter_dates(start, end):
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def _resolve_analytics_range(user_id: int, range_key: str):
    today = datetime.utcnow().date()
    key = (range_key or "week").lower()

    if key == "today":
        return key, "Today", today, today

    if key == "week":
        start = today - timedelta(days=today.weekday())
        return key, "This Week", start, today

    if key == "month":
        start = today.replace(day=1)
        return key, "This Month", start, today

    if key == "all":
        log_min = db.execute(
            "SELECT MIN(date(timestamp)) AS d FROM procrastination_logs WHERE user_id = ?",
            user_id,
        )[0]["d"]
        task_min = db.execute(
            "SELECT MIN(date(created_at)) AS d FROM tasks WHERE user_id = ?",
            user_id,
        )[0]["d"]
        complete_min = db.execute(
            """
            SELECT MIN(date(COALESCE(completed_at, created_at))) AS d
            FROM tasks
            WHERE user_id = ? AND status = 'completed'
            """,
            user_id,
        )[0]["d"]

        candidates = [d for d in [_parse_iso_date(log_min), _parse_iso_date(task_min), _parse_iso_date(complete_min)] if d]
        start = min(candidates) if candidates else (today - timedelta(days=29))
        return key, "All Time", start, today

    start = today - timedelta(days=today.weekday())
    return "week", "This Week", start, today


def _time_period(hour: int) -> str:
    if 5 <= hour <= 11:
        return "morning"
    if 12 <= hour <= 16:
        return "afternoon"
    if 17 <= hour <= 21:
        return "evening"
    return "late night"


def _generate_analytics_insights(
    weekday_hour_counts,
    mood_counts,
    low_energy_combo_counts,
    low_energy_count,
    logs_total,
    top_environment,
    tasks_added_total,
    tasks_completed_total,
    completion_rate,
):
    insights = []
    weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    if weekday_hour_counts:
        (peak_weekday, peak_hour), _peak_count = max(weekday_hour_counts.items(), key=lambda item: item[1])
        insights.append(
            f"You procrastinate most on {weekday_names[peak_weekday]} {_time_period(peak_hour)}s, peaking around {peak_hour:02d}:00."
        )

    if mood_counts and logs_total > 0:
        mood, count = max(mood_counts.items(), key=lambda item: item[1])
        percent = round((count / logs_total) * 100)
        insights.append(f"{mood.capitalize()} appears in {percent}% of logs in this range.")

    if low_energy_combo_counts:
        (combo_mood, bucket_hour), _combo_count = max(low_energy_combo_counts.items(), key=lambda item: item[1])
        insights.append(
            f"Low energy + {combo_mood} is your most common combo at {bucket_hour:02d}:00-{bucket_hour + 1:02d}:59."
        )
    elif low_energy_count > 0 and logs_total > 0:
        low_percent = round((low_energy_count / logs_total) * 100)
        insights.append(f"{low_percent}% of procrastination logs happened when your energy was 4 or lower.")

    if top_environment:
        insights.append(f"{top_environment['label']} is your highest-friction environment right now.")

    if tasks_added_total > 0:
        insights.append(
            f"You completed {tasks_completed_total} tasks against {tasks_added_total} tasks added in this period ({completion_rate}% completion)."
        )
        if completion_rate >= 75:
            insights.append("Your completion momentum is strong. Keep your current planning cadence.")
        elif completion_rate <= 40:
            insights.append("Your completion rate is under pressure. Try reducing task scope and prioritizing one must-finish task each day.")

    unique = []
    for text in insights:
        if text not in unique:
            unique.append(text)

    fallback = [
        "Pattern visibility improves quickly when you log consistently for a full week.",
        "Short, concrete task definitions usually reduce uncertainty-driven procrastination.",
        "Energy-aware scheduling can convert difficult windows into low-friction wins.",
    ]
    for text in fallback:
        if len(unique) >= 3:
            break
        unique.append(text)

    return unique[:5]


def _build_analytics_payload(user_id: int, range_key: str):
    key, label, start_date, end_date = _resolve_analytics_range(user_id, range_key)

    logs = db.execute(
        """
        SELECT timestamp, mood, energy_level, environment, trigger_reason, intended_task_text
        FROM procrastination_logs
        WHERE user_id = ?
          AND date(timestamp) BETWEEN date(?) AND date(?)
        ORDER BY timestamp ASC
        """,
        user_id,
        start_date.isoformat(),
        end_date.isoformat(),
    )

    daily_counts = defaultdict(int)
    hourly_counts = [0] * 24
    mood_counts = defaultdict(int)
    environment_counts = defaultdict(int)
    mood_energy_points = []
    weekday_hour_counts = defaultdict(int)
    low_energy_combo_counts = defaultdict(int)
    low_energy_count = 0

    for row in logs:
        stamp = _parse_sqlite_datetime(row.get("timestamp"))
        if not stamp:
            continue

        day = stamp.date()
        hour = stamp.hour
        mood = (row.get("mood") or "unknown").strip().lower()
        energy = int(row.get("energy_level") or 5)
        energy = max(1, min(10, energy))
        environment = (row.get("environment") or "").strip()

        daily_counts[day] += 1
        hourly_counts[hour] += 1
        mood_counts[mood] += 1
        weekday_hour_counts[(day.weekday(), hour)] += 1

        if environment:
            environment_counts[environment] += 1

        if energy <= 4:
            low_energy_count += 1
            bucket_hour = (hour // 2) * 2
            low_energy_combo_counts[(mood, bucket_hour)] += 1

        mood_energy_points.append(
            {
                "x": energy,
                "y": hour,
                "mood": mood,
                "timestamp": stamp.strftime("%Y-%m-%d %H:%M"),
                "date": day.isoformat(),
            }
        )

    heatmap_start = _week_start(start_date)
    heatmap_points = []
    for day in _iter_dates(heatmap_start, end_date):
        in_range = start_date <= day <= end_date
        week_index = (day - heatmap_start).days // 7
        heatmap_points.append(
            {
                "x": week_index,
                "y": day.weekday(),
                "v": int(daily_counts.get(day, 0)) if in_range else 0,
                "date": day.isoformat(),
                "in_range": in_range,
            }
        )
    heatmap_weeks = ((end_date - heatmap_start).days // 7) + 1

    mood_distribution = [
        {"mood": mood, "count": count}
        for mood, count in sorted(mood_counts.items(), key=lambda item: item[1], reverse=True)
    ]

    created_day_rows = db.execute(
        """
        SELECT date(created_at) AS day, COUNT(*) AS count
        FROM tasks
        WHERE user_id = ?
          AND date(created_at) BETWEEN date(?) AND date(?)
        GROUP BY date(created_at)
        """,
        user_id,
        start_date.isoformat(),
        end_date.isoformat(),
    )
    completed_day_rows = db.execute(
        """
        SELECT date(COALESCE(completed_at, created_at)) AS day, COUNT(*) AS count
        FROM tasks
        WHERE user_id = ?
          AND status = 'completed'
          AND date(COALESCE(completed_at, created_at)) BETWEEN date(?) AND date(?)
        GROUP BY date(COALESCE(completed_at, created_at))
        """,
        user_id,
        start_date.isoformat(),
        end_date.isoformat(),
    )

    created_per_week = defaultdict(int)
    completed_per_week = defaultdict(int)

    for row in created_day_rows:
        day = _parse_iso_date(row.get("day"))
        if not day:
            continue
        created_per_week[_week_start(day)] += int(row.get("count") or 0)

    for row in completed_day_rows:
        day = _parse_iso_date(row.get("day"))
        if not day:
            continue
        completed_per_week[_week_start(day)] += int(row.get("count") or 0)

    week_labels = []
    week_cursor = _week_start(start_date)
    while week_cursor <= end_date:
        week_labels.append(week_cursor)
        week_cursor += timedelta(days=7)

    tasks_added_series = [created_per_week.get(week, 0) for week in week_labels]
    tasks_completed_series = [completed_per_week.get(week, 0) for week in week_labels]
    tasks_added_total = int(sum(tasks_added_series))
    tasks_completed_total = int(sum(tasks_completed_series))

    completed_from_created = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM tasks
        WHERE user_id = ?
          AND date(created_at) BETWEEN date(?) AND date(?)
          AND status = 'completed'
        """,
        user_id,
        start_date.isoformat(),
        end_date.isoformat(),
    )[0]["count"]

    completion_rate = int(round((completed_from_created / tasks_added_total) * 100)) if tasks_added_total > 0 else 0
    completion_rate = max(0, min(100, completion_rate))

    top_environment = None
    if environment_counts:
        env, _count = max(environment_counts.items(), key=lambda item: item[1])
        top_environment = {"label": env}

    insights = _generate_analytics_insights(
        weekday_hour_counts=weekday_hour_counts,
        mood_counts=mood_counts,
        low_energy_combo_counts=low_energy_combo_counts,
        low_energy_count=low_energy_count,
        logs_total=len(mood_energy_points),
        top_environment=top_environment,
        tasks_added_total=tasks_added_total,
        tasks_completed_total=tasks_completed_total,
        completion_rate=completion_rate,
    )

    return {
        "range": key,
        "range_label": label,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "heatmap": {
            "points": heatmap_points,
            "weeks": heatmap_weeks,
        },
        "hourly": {
            "labels": list(range(24)),
            "counts": hourly_counts,
        },
        "mood_energy": {
            "points": mood_energy_points,
        },
        "mood_distribution": mood_distribution,
        "completion_trend": {
            "labels": [week.strftime("%b %d") for week in week_labels],
            "added": tasks_added_series,
            "completed": tasks_completed_series,
        },
        "completion_rate": completion_rate,
        "summary": {
            "logs_total": len(mood_energy_points),
            "tasks_added_total": tasks_added_total,
            "tasks_completed_total": tasks_completed_total,
        },
        "insights": insights,
    }


@app.context_processor
def inject_shell_context():
    user = None
    streak_days = 0
    if session.get("user_id"):
        username = session.get("username")
        if not username:
            rows = db.execute("SELECT username FROM users WHERE id = ?", session["user_id"])
            if rows:
                username = rows[0]["username"]
                session["username"] = username

        user = {
            "id": session.get("user_id"),
            "username": username or "User",
            "initials": _get_user_initials(username or "User"),
        }
        try:
            streak_days = _activity_streak_days(session["user_id"])
        except Exception:
            logger.exception("Failed to compute streak")
            streak_days = 0

    return {
        "current_user": user,
        "streak_days": streak_days,
    }


def generate_csrf_token():
    token = session.get("_csrf_token")
    if not token:
        token = os.urandom(16).hex()
        session["_csrf_token"] = token
    return token


@app.before_request
def csrf_protect():
    if request.method == "POST":
        sent = request.form.get("csrf_token")
        if not sent:
            sent = request.headers.get("X-CSRF-Token")
        expected = session.get("_csrf_token")
        if not sent or not expected or sent != expected:
            return apology("invalid or missing CSRF token", 400)


app.jinja_env.globals["csrf_token"] = generate_csrf_token
app.jinja_env.filters["format_time"] = format_time
app.jinja_env.filters["get_mood_emoji"] = get_mood_emoji
app.jinja_env.filters["get_energy_color"] = get_energy_color

# Create tables if they don't exist
with app.app_context():
    # Users table
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Tasks table
    db.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            estimated_time INTEGER,
            importance INTEGER CHECK (importance IN (1, 2, 3, 4, 5)),
            deadline DATETIME,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned')),
            board_order INTEGER DEFAULT 0,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    task_columns = {col["name"] for col in db.execute("SELECT name FROM pragma_table_info('tasks')")}
    if "board_order" not in task_columns:
        db.execute("ALTER TABLE tasks ADD COLUMN board_order INTEGER DEFAULT 0")
    if "completed_at" not in task_columns:
        db.execute("ALTER TABLE tasks ADD COLUMN completed_at DATETIME")

    db.execute(
        """
        UPDATE tasks
        SET board_order = id
        WHERE board_order IS NULL OR board_order = 0
        """
    )
    db.execute(
        """
        UPDATE tasks
        SET completed_at = created_at
        WHERE status = 'completed' AND completed_at IS NULL
        """
    )
    
    # Work sessions table
    db.execute("""
        CREATE TABLE IF NOT EXISTS work_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            completed BOOLEAN DEFAULT FALSE,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # Procrastination logs table
    db.execute("""
        CREATE TABLE IF NOT EXISTS procrastination_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            user_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            mood TEXT,
            energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
            environment TEXT,
            what_did_instead TEXT,
            trigger_reason TEXT,
            intended_task_text TEXT,
            FOREIGN KEY (task_id) REFERENCES tasks (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    log_columns = {col["name"] for col in db.execute("SELECT name FROM pragma_table_info('procrastination_logs')")}
    if "intended_task_text" not in log_columns:
        db.execute("ALTER TABLE procrastination_logs ADD COLUMN intended_task_text TEXT")


@app.after_request
def after_request(response):
    """Ensure responses aren't cached"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Expires"] = 0
    response.headers["Pragma"] = "no-cache"
    return response


@app.errorhandler(404)
def not_found(_e):
    return apology("page not found", 404)


@app.errorhandler(500)
def server_error(_e):
    return apology("internal error", 500)


@app.route("/")
@login_required
def index():
    """Show command-center dashboard with productivity insights."""
    user_id = session["user_id"]

    now = datetime.now()
    username = session.get("username") or ""
    greeting = _time_of_day_greeting(now)
    first_name = _first_name(username)
    current_streak = _activity_streak_days(user_id)

    tasks = db.execute(
        """
        SELECT id, title, description, estimated_time, importance, deadline, status, board_order
        FROM tasks
        WHERE user_id = ? AND status IN ('pending', 'in_progress', 'completed')
        ORDER BY
            CASE status
                WHEN 'pending' THEN 1
                WHEN 'in_progress' THEN 2
                WHEN 'completed' THEN 3
                ELSE 4
            END,
            CASE WHEN board_order IS NULL OR board_order = 0 THEN 99999 ELSE board_order END,
            id DESC
        """,
        user_id,
    )

    task_board = {
        "pending": [],
        "in_progress": [],
        "completed": [],
    }
    for task in tasks:
        task["importance"] = int(task.get("importance") or 0)
        task["deadline_countdown"], task["deadline_state"] = _deadline_countdown(task.get("deadline"))
        task_board[task["status"]].append(task)

    tasks_done_today = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM tasks
        WHERE user_id = ?
          AND status = 'completed'
          AND date(COALESCE(completed_at, created_at)) = date('now')
        """,
        user_id,
    )[0]["count"]

    today_logs = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM procrastination_logs
        WHERE user_id = ? AND date(timestamp) = date('now')
        """,
        user_id,
    )[0]["count"]

    today_focus_score = _calculate_focus_score(tasks_done_today, today_logs)

    completion_rows = db.execute(
        """
        SELECT date(COALESCE(completed_at, created_at)) AS day, COUNT(*) AS count
        FROM tasks
        WHERE user_id = ?
          AND status = 'completed'
          AND date(COALESCE(completed_at, created_at)) >= date('now', '-6 days')
        GROUP BY day
        """,
        user_id,
    )
    logs_rows = db.execute(
        """
        SELECT date(timestamp) AS day, COUNT(*) AS count
        FROM procrastination_logs
        WHERE user_id = ?
          AND date(timestamp) >= date('now', '-6 days')
        GROUP BY day
        """,
        user_id,
    )
    completions_by_day = {row["day"]: int(row["count"]) for row in completion_rows}
    logs_by_day = {row["day"]: int(row["count"]) for row in logs_rows}

    focus_scores = []
    today_utc = datetime.utcnow().date()
    for i in range(7):
        day_key = (today_utc - timedelta(days=i)).isoformat()
        focus_scores.append(
            _calculate_focus_score(
                completions_by_day.get(day_key, 0),
                logs_by_day.get(day_key, 0),
            )
        )
    avg_focus_score = round(sum(focus_scores) / len(focus_scores), 1)

    noisy_hours = db.execute(
        """
        SELECT COUNT(DISTINCT strftime('%Y-%m-%d %H', timestamp)) AS noisy_hours
        FROM procrastination_logs
        WHERE user_id = ?
          AND timestamp >= datetime('now', '-24 hours')
        """,
        user_id,
    )[0]["noisy_hours"]
    procrastination_free_hours = max(0, 24 - int(noisy_hours or 0))

    recent_pulse_logs = db.execute(
        """
        SELECT mood, energy_level, timestamp
        FROM procrastination_logs
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 3
        """,
        user_id,
    )
    for log in recent_pulse_logs:
        energy_level = int(log.get("energy_level") or 0)
        energy_level = max(1, min(10, energy_level))
        log["energy_level"] = energy_level
        log["energy_percent"] = energy_level * 10
        stamp = _parse_sqlite_datetime(log.get("timestamp"))
        log["timestamp_label"] = stamp.strftime("%b %d, %I:%M %p") if stamp else "Unknown time"

    quote_start_index = (now.timetuple().tm_yday + user_id) % len(PRODUCTIVITY_QUOTES)

    return render_template(
        "index.html",
        greeting=greeting,
        first_name=first_name,
        current_streak=current_streak,
        today_focus_score=today_focus_score,
        tasks_done_today=tasks_done_today,
        avg_focus_score=avg_focus_score,
        procrastination_free_hours=procrastination_free_hours,
        task_board=task_board,
        recent_pulse_logs=recent_pulse_logs,
        productivity_quotes=PRODUCTIVITY_QUOTES,
        quote_start_index=quote_start_index,
    )


@app.route("/api/tasks/reorder", methods=["POST"])
@login_required
def reorder_tasks():
    """Persist kanban column placement and ordering."""
    payload = request.get_json(silent=True) or {}
    columns = payload.get("columns")

    if not isinstance(columns, dict):
        return jsonify({"ok": False, "error": "Invalid payload"}), 400

    allowed_statuses = ["pending", "in_progress", "completed"]
    normalized = {}
    all_task_ids = []

    for status in allowed_statuses:
        raw_ids = columns.get(status, [])
        if not isinstance(raw_ids, list):
            return jsonify({"ok": False, "error": "Invalid column list"}), 400

        ids_for_status = []
        for raw_id in raw_ids:
            try:
                task_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            if task_id > 0 and task_id not in ids_for_status:
                ids_for_status.append(task_id)
                all_task_ids.append(task_id)
        normalized[status] = ids_for_status

    if all_task_ids:
        placeholders = ", ".join("?" for _ in all_task_ids)
        owned_rows = db.execute(
            f"SELECT id FROM tasks WHERE user_id = ? AND id IN ({placeholders})",
            session["user_id"],
            *all_task_ids,
        )
        owned_ids = {row["id"] for row in owned_rows}
        if len(owned_ids) != len(set(all_task_ids)):
            return jsonify({"ok": False, "error": "Task ownership mismatch"}), 403

    for status in allowed_statuses:
        for position, task_id in enumerate(normalized[status], start=1):
            if status == "completed":
                db.execute(
                    """
                    UPDATE tasks
                    SET status = 'completed',
                        board_order = ?,
                        completed_at = COALESCE(completed_at, datetime('now'))
                    WHERE id = ? AND user_id = ?
                    """,
                    position,
                    task_id,
                    session["user_id"],
                )
            else:
                db.execute(
                    """
                    UPDATE tasks
                    SET status = ?,
                        board_order = ?,
                        completed_at = NULL
                    WHERE id = ? AND user_id = ?
                    """,
                    status,
                    position,
                    task_id,
                    session["user_id"],
                )

    return jsonify({"ok": True})


@app.route("/add_task", methods=["GET", "POST"])
@login_required
def add_task():
    """Add a new task"""
    if request.method == "POST":
        title = request.form.get("title")
        description = request.form.get("description")
        estimated_time_raw = request.form.get("estimated_time")
        importance_raw = request.form.get("importance")
        deadline = request.form.get("deadline")

        if not title:
            return apology("must provide task title")

        estimated_time = None
        if estimated_time_raw:
            try:
                estimated_time = int(estimated_time_raw)
                if estimated_time <= 0:
                    return apology("estimated time must be positive", 400)
            except ValueError:
                return apology("estimated time must be a number", 400)

        try:
            importance = int(importance_raw) if importance_raw else None
        except ValueError:
            return apology("importance must be a number", 400)
        if importance not in [1, 2, 3, 4, 5]:
            return apology("importance must be between 1 and 5", 400)

        # Convert deadline to proper format if provided
        deadline_formatted = None
        if deadline:
            try:
                deadline_formatted = datetime.strptime(deadline, "%Y-%m-%dT%H:%M")
            except ValueError:
                return apology("invalid deadline format")

        next_order = _next_board_order(session["user_id"], "pending")

        try:
            db.execute("""
                INSERT INTO tasks (user_id, title, description, estimated_time, importance, deadline, board_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, session["user_id"], title, description, estimated_time, importance, deadline_formatted, next_order)
        except Exception:
            logger.exception("Failed to insert task")
            return apology("could not add task", 500)

        flash("✅ Task added successfully!")
        return redirect("/")
    
    return render_template("add_task.html")


@app.route("/tasks", methods=["GET", "POST"])
@login_required
def tasks():
    """Task management page with inline update and bulk operations."""
    user_id = session["user_id"]

    def wants_json() -> bool:
        accept = request.headers.get("Accept") or ""
        return request.headers.get("X-Requested-With") == "XMLHttpRequest" or "application/json" in accept

    def json_error(message: str, code: int = 400):
        if wants_json():
            return jsonify({"ok": False, "error": message}), code
        flash(message)
        return redirect("/tasks")

    if request.method == "POST":
        action = (request.form.get("action") or "").strip()

        if action in {"start_task", "complete_task", "delete_task", "edit_task"}:
            task_id_raw = (request.form.get("task_id") or "").strip()
            try:
                task_id = int(task_id_raw)
            except ValueError:
                return json_error("Invalid task id", 400)

            task_row = _fetch_task_row_for_user(task_id, user_id)
            if not task_row:
                return json_error("Task not found", 404)

            if action == "start_task":
                next_order = _next_board_order(user_id, "in_progress")
                db.execute(
                    """
                    UPDATE tasks
                    SET status = 'in_progress',
                        board_order = ?,
                        completed_at = NULL
                    WHERE id = ? AND user_id = ?
                    """,
                    next_order,
                    task_id,
                    user_id,
                )
                updated = _fetch_task_row_for_user(task_id, user_id)
                payload = {"ok": True, "task": _serialize_task_for_tasks_page(updated)}
                if wants_json():
                    return jsonify(payload)
                flash("Task started.")
                return redirect("/tasks")

            if action == "complete_task":
                next_order = _next_board_order(user_id, "completed")
                db.execute(
                    """
                    UPDATE tasks
                    SET status = 'completed',
                        board_order = ?,
                        completed_at = datetime('now')
                    WHERE id = ? AND user_id = ?
                    """,
                    next_order,
                    task_id,
                    user_id,
                )
                updated = _fetch_task_row_for_user(task_id, user_id)
                payload = {"ok": True, "task": _serialize_task_for_tasks_page(updated)}
                if wants_json():
                    return jsonify(payload)
                flash("Task completed.")
                return redirect("/tasks")

            if action == "delete_task":
                db.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", task_id, user_id)
                payload = {"ok": True, "deleted_ids": [task_id]}
                if wants_json():
                    return jsonify(payload)
                flash("Task deleted.")
                return redirect("/tasks")

            if action == "edit_task":
                title = (request.form.get("title") or "").strip()
                description = (request.form.get("description") or "").strip() or None
                estimated_raw = (request.form.get("estimated_time") or "").strip()
                importance_raw = (request.form.get("importance") or "").strip()
                deadline_raw = (request.form.get("deadline") or "").strip()

                if not title:
                    return json_error("Title is required", 400)

                estimated_time = None
                if estimated_raw:
                    try:
                        estimated_time = int(estimated_raw)
                    except ValueError:
                        return json_error("Estimated time must be a number", 400)
                    if estimated_time <= 0:
                        return json_error("Estimated time must be positive", 400)

                try:
                    importance = int(importance_raw) if importance_raw else 3
                except ValueError:
                    return json_error("Importance must be between 1 and 5", 400)
                if importance < 1 or importance > 5:
                    return json_error("Importance must be between 1 and 5", 400)

                deadline_value = None
                if deadline_raw:
                    try:
                        deadline_value = datetime.strptime(deadline_raw, "%Y-%m-%dT%H:%M")
                    except ValueError:
                        return json_error("Invalid deadline format", 400)

                db.execute(
                    """
                    UPDATE tasks
                    SET title = ?,
                        description = ?,
                        estimated_time = ?,
                        importance = ?,
                        deadline = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    title,
                    description,
                    estimated_time,
                    importance,
                    deadline_value,
                    task_id,
                    user_id,
                )

                updated = _fetch_task_row_for_user(task_id, user_id)
                payload = {"ok": True, "task": _serialize_task_for_tasks_page(updated)}
                if wants_json():
                    return jsonify(payload)
                flash("Task updated.")
                return redirect("/tasks")

        if action in {"bulk_complete", "bulk_delete"}:
            raw_ids = request.form.getlist("task_ids")
            task_ids = []
            for raw in raw_ids:
                try:
                    task_id = int(raw)
                except ValueError:
                    continue
                if task_id > 0 and task_id not in task_ids:
                    task_ids.append(task_id)

            if not task_ids:
                return json_error("No tasks selected", 400)

            placeholders = ", ".join("?" for _ in task_ids)
            owned_rows = db.execute(
                f"SELECT id FROM tasks WHERE user_id = ? AND id IN ({placeholders})",
                user_id,
                *task_ids,
            )
            owned_ids = [row["id"] for row in owned_rows]
            if not owned_ids:
                return json_error("No owned tasks found", 404)

            if action == "bulk_complete":
                base_order = _next_board_order(user_id, "completed")
                for offset, task_id in enumerate(owned_ids):
                    db.execute(
                        """
                        UPDATE tasks
                        SET status = 'completed',
                            board_order = ?,
                            completed_at = datetime('now')
                        WHERE id = ? AND user_id = ?
                        """,
                        base_order + offset,
                        task_id,
                        user_id,
                    )

                updated_rows = [_fetch_task_row_for_user(task_id, user_id) for task_id in owned_ids]
                updated_tasks = [_serialize_task_for_tasks_page(row) for row in updated_rows if row]
                payload = {"ok": True, "updated_ids": owned_ids, "updated_tasks": updated_tasks}
                if wants_json():
                    return jsonify(payload)
                flash(f"Marked {len(owned_ids)} tasks complete.")
                return redirect("/tasks")

            if action == "bulk_delete":
                delete_placeholders = ", ".join("?" for _ in owned_ids)
                db.execute(
                    f"DELETE FROM tasks WHERE user_id = ? AND id IN ({delete_placeholders})",
                    user_id,
                    *owned_ids,
                )
                payload = {"ok": True, "deleted_ids": owned_ids}
                if wants_json():
                    return jsonify(payload)
                flash(f"Deleted {len(owned_ids)} tasks.")
                return redirect("/tasks")

        return json_error("Unknown action", 400)

    rows = db.execute(
        """
        SELECT id, title, description, estimated_time, importance, deadline, status, created_at, completed_at
        FROM tasks
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        """,
        user_id,
    )

    serialized_tasks = [_serialize_task_for_tasks_page(row) for row in rows]
    return render_template("tasks.html", tasks=serialized_tasks, task_count=len(serialized_tasks))


@app.route("/api/tasks/quick_add", methods=["POST"])
@login_required
def quick_add_task():
    """Create a task from dashboard inline modal without full navigation."""
    payload = request.get_json(silent=True) or {}

    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip() or None
    estimated_time_raw = payload.get("estimated_time")
    importance_raw = payload.get("importance")
    deadline_raw = payload.get("deadline")

    if not title:
        return jsonify({"ok": False, "error": "Task title is required"}), 400

    estimated_time = None
    if estimated_time_raw not in (None, ""):
        try:
            estimated_time = int(estimated_time_raw)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "Estimated time must be a number"}), 400
        if estimated_time <= 0:
            return jsonify({"ok": False, "error": "Estimated time must be positive"}), 400

    try:
        importance = int(importance_raw) if importance_raw not in (None, "") else 3
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Importance must be between 1 and 5"}), 400
    if importance < 1 or importance > 5:
        return jsonify({"ok": False, "error": "Importance must be between 1 and 5"}), 400

    deadline_formatted = None
    if deadline_raw:
        try:
            deadline_formatted = datetime.strptime(deadline_raw, "%Y-%m-%dT%H:%M")
        except ValueError:
            return jsonify({"ok": False, "error": "Invalid deadline format"}), 400

    next_order = _next_board_order(session["user_id"], "pending")

    try:
        task_id = db.execute(
            """
            INSERT INTO tasks (user_id, title, description, estimated_time, importance, deadline, status, board_order)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            session["user_id"],
            title,
            description,
            estimated_time,
            importance,
            deadline_formatted,
            next_order,
        )
    except Exception:
        logger.exception("Failed to quick-add task")
        return jsonify({"ok": False, "error": "Could not create task"}), 500

    created = db.execute(
        """
        SELECT id, title, description, estimated_time, importance, deadline, status
        FROM tasks
        WHERE id = ? AND user_id = ?
        """,
        task_id,
        session["user_id"],
    )
    if not created:
        return jsonify({"ok": False, "error": "Task could not be loaded"}), 500

    task = created[0]
    countdown, deadline_state = _deadline_countdown(task.get("deadline"))

    return jsonify(
        {
            "ok": True,
            "task": {
                "id": task["id"],
                "title": task["title"],
                "description": task.get("description") or "",
                "estimated_time": task.get("estimated_time"),
                "importance": int(task.get("importance") or 0),
                "deadline_countdown": countdown,
                "deadline_state": deadline_state,
                "status": task["status"],
            },
        }
    ), 201


@app.route("/log_procrastination", methods=["GET", "POST"])
@login_required
def log_procrastination():
    """Log a procrastination episode with wizard flow and instant feedback."""
    user_id = session["user_id"]
    tasks = _fetch_active_tasks_for_log(user_id)

    if request.method == "POST":
        task_id_raw = (request.form.get("task_id") or "").strip()
        intended_task_text = (request.form.get("intended_task_text") or "").strip()
        mood = (request.form.get("mood") or "distracted").strip().lower()
        mood_keys = {m["key"] for m in WIZARD_MOOD_OPTIONS}
        if mood not in mood_keys:
            mood = "distracted"

        energy_level_raw = (request.form.get("energy_level") or "").strip()
        try:
            energy_level = int(energy_level_raw) if energy_level_raw else 5
        except ValueError:
            energy_level = 5
        energy_level = max(1, min(10, energy_level))

        environment = (request.form.get("environment") or "").strip().lower()
        allowed_environments = {e["key"] for e in WIZARD_ENV_OPTIONS}
        if environment not in allowed_environments:
            environment = None

        trigger_reason = (request.form.get("trigger_reason") or "").strip()
        if trigger_reason not in WIZARD_TRIGGER_OPTIONS:
            trigger_reason = None

        details = (request.form.get("details") or "").strip()
        details_value = details if details else None

        task_id = None
        if task_id_raw:
            try:
                candidate_task_id = int(task_id_raw)
            except ValueError:
                candidate_task_id = None

            if candidate_task_id:
                owned = db.execute(
                    """
                    SELECT id
                    FROM tasks
                    WHERE id = ? AND user_id = ? AND status IN ('pending', 'in_progress')
                    """,
                    candidate_task_id,
                    user_id,
                )
                if owned:
                    task_id = candidate_task_id

        try:
            db.execute("""
                INSERT INTO procrastination_logs 
                (task_id, user_id, mood, energy_level, environment, what_did_instead, trigger_reason, intended_task_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, task_id, user_id, mood, energy_level, environment, details_value, trigger_reason,
                intended_task_text if intended_task_text else None)
        except Exception:
            logger.exception("Failed to insert procrastination log")
            return apology("could not log procrastination", 500)

        selected_task_title = intended_task_text if intended_task_text else "Unspecified task"
        if task_id:
            matched = next((t for t in tasks if t["id"] == task_id), None)
            if matched:
                selected_task_title = matched["title"]

        insight = _build_log_insight(mood, energy_level)

        return render_template(
            "log_session.html",
            tasks=tasks,
            mood_options=WIZARD_MOOD_OPTIONS,
            trigger_options=WIZARD_TRIGGER_OPTIONS,
            environment_options=WIZARD_ENV_OPTIONS,
            logged=True,
            insight=insight,
            logged_mood=mood,
            logged_energy=energy_level,
            logged_task=selected_task_title,
        )

    return render_template(
        "log_session.html",
        tasks=tasks,
        mood_options=WIZARD_MOOD_OPTIONS,
        trigger_options=WIZARD_TRIGGER_OPTIONS,
        environment_options=WIZARD_ENV_OPTIONS,
        logged=False,
    )


@app.route("/analytics")
@login_required
def analytics():
    """Render analytics dashboard shell with initial data."""
    initial_range = request.args.get("range", "week")
    analytics_data = _build_analytics_payload(session["user_id"], initial_range)
    return render_template("analytics.html", analytics_data=analytics_data)


@app.route("/api/analytics")
@login_required
def analytics_api():
    """Range-aware analytics data endpoint used by the dashboard."""
    range_key = request.args.get("range", "week")
    payload = _build_analytics_payload(session["user_id"], range_key)
    return jsonify({"ok": True, **payload})


@app.route("/api/analytics/export")
@login_required
def analytics_export_csv():
    """Export analytics data for the selected range as CSV."""
    user_id = session["user_id"]
    range_key = request.args.get("range", "week")
    key, label, start_date, end_date = _resolve_analytics_range(user_id, range_key)

    logs = db.execute(
        """
        SELECT
            l.timestamp,
            l.mood,
            l.energy_level,
            l.environment,
            l.trigger_reason,
            l.intended_task_text,
            l.what_did_instead,
            t.title AS task_title
        FROM procrastination_logs l
        LEFT JOIN tasks t ON l.task_id = t.id
        WHERE l.user_id = ?
          AND date(l.timestamp) BETWEEN date(?) AND date(?)
        ORDER BY l.timestamp ASC
        """,
        user_id,
        start_date.isoformat(),
        end_date.isoformat(),
    )

    tasks = db.execute(
        """
        SELECT
            id,
            title,
            status,
            importance,
            estimated_time,
            deadline,
            created_at,
            completed_at
        FROM tasks
        WHERE user_id = ?
          AND (
            date(created_at) BETWEEN date(?) AND date(?)
            OR (
                status = 'completed'
                AND date(COALESCE(completed_at, created_at)) BETWEEN date(?) AND date(?)
            )
          )
        ORDER BY created_at ASC
        """,
        user_id,
        start_date.isoformat(),
        end_date.isoformat(),
        start_date.isoformat(),
        end_date.isoformat(),
    )

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["ProcrastiNation Analytics Export"])
    writer.writerow(["Range", label])
    writer.writerow(["Start", start_date.isoformat()])
    writer.writerow(["End", end_date.isoformat()])
    writer.writerow([])

    writer.writerow(["Procrastination Logs"])
    writer.writerow([
        "timestamp",
        "mood",
        "energy_level",
        "hour",
        "environment",
        "trigger_reason",
        "intended_task_text",
        "what_did_instead",
        "task_title",
    ])

    for row in logs:
        stamp = _parse_sqlite_datetime(row.get("timestamp"))
        writer.writerow([
            stamp.strftime("%Y-%m-%d %H:%M") if stamp else (row.get("timestamp") or ""),
            row.get("mood") or "",
            row.get("energy_level") or "",
            stamp.hour if stamp else "",
            row.get("environment") or "",
            row.get("trigger_reason") or "",
            row.get("intended_task_text") or "",
            row.get("what_did_instead") or "",
            row.get("task_title") or "",
        ])

    writer.writerow([])
    writer.writerow(["Tasks"])
    writer.writerow([
        "id",
        "title",
        "status",
        "importance",
        "estimated_time_minutes",
        "deadline",
        "created_at",
        "completed_at",
    ])

    for row in tasks:
        writer.writerow([
            row.get("id") or "",
            row.get("title") or "",
            row.get("status") or "",
            row.get("importance") or "",
            row.get("estimated_time") or "",
            row.get("deadline") or "",
            row.get("created_at") or "",
            row.get("completed_at") or "",
        ])

    csv_text = output.getvalue()
    output.close()

    filename = f"analytics_{key}_{start_date.isoformat()}_{end_date.isoformat()}.csv"
    response = Response(csv_text, mimetype="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@app.route("/healthz")
def healthz():
    """Simple health check."""
    return {"status": "ok"}, 200


@app.route("/complete_task/<int:task_id>", methods=["POST"])
@login_required
def complete_task(task_id):
    """Mark a task as completed"""
    try:
        next_order = _next_board_order(session["user_id"], "completed")
        db.execute(
            """
            UPDATE tasks
            SET status = 'completed',
                board_order = ?,
                completed_at = datetime('now')
            WHERE id = ? AND user_id = ?
            """,
            next_order,
            task_id,
            session["user_id"],
        )
    except Exception:
        logger.exception("Failed to complete task")
        return apology("could not update task", 500)
    flash("Task completed! Great job!")
    return redirect("/")


@app.route("/start_task/<int:task_id>", methods=["POST"])
@login_required
def start_task(task_id):
    """Mark a task as in progress."""
    try:
        next_order = _next_board_order(session["user_id"], "in_progress")
        db.execute(
            """
            UPDATE tasks
            SET status = 'in_progress',
                board_order = ?,
                completed_at = NULL
            WHERE id = ? AND user_id = ?
            """,
            next_order,
            task_id,
            session["user_id"],
        )
    except Exception:
        logger.exception("Failed to start task")
        return apology("could not update task", 500)
    flash("Task started. Focus mode on.")
    return redirect("/")


@app.route("/abandon_task/<int:task_id>", methods=["POST"])
@login_required
def abandon_task(task_id):
    """Mark a task as abandoned."""
    try:
        db.execute(
            """
            UPDATE tasks
            SET status = 'abandoned',
                board_order = 0,
                completed_at = NULL
            WHERE id = ? AND user_id = ?
            """,
            task_id,
            session["user_id"],
        )
    except Exception:
        logger.exception("Failed to abandon task")
        return apology("could not update task", 500)
    flash("Task abandoned. No guilt — adjust and move on.")
    return redirect("/")


@app.route("/reopen_task/<int:task_id>", methods=["POST"])
@login_required
def reopen_task(task_id):
    """Move a completed task back to pending."""
    try:
        next_order = _next_board_order(session["user_id"], "pending")
        db.execute(
            """
            UPDATE tasks
            SET status = 'pending',
                board_order = ?,
                completed_at = NULL
            WHERE id = ? AND user_id = ?
            """,
            next_order,
            task_id,
            session["user_id"],
        )
    except Exception:
        logger.exception("Failed to reopen task")
        return apology("could not update task", 500)
    flash("Task moved back to pending.")
    return redirect("/")


@app.route("/delete_task/<int:task_id>", methods=["POST"])
@login_required
def delete_task(task_id):
    """Delete a task."""
    try:
        db.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?",
                   task_id, session["user_id"])
    except Exception:
        logger.exception("Failed to delete task")
        return apology("could not delete task", 500)
    flash("Task deleted.")
    return redirect("/")


@app.route("/login", methods=["GET", "POST"])
def login():
    """Log user in"""
    session.clear()

    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")

        if not username:
            return apology("must provide username", 403)
        elif not password:
            return apology("must provide password", 403)

        rows = db.execute("SELECT * FROM users WHERE username = ?", username)

        if len(rows) != 1 or not check_password_hash(rows[0]["hash"], password):
            return apology("invalid username and/or password", 403)

        session["user_id"] = rows[0]["id"]
        session["username"] = rows[0]["username"]
        next_url = request.args.get("next")
        if next_url and isinstance(next_url, str) and next_url.startswith("/"):
            return redirect(next_url)
        return redirect("/")
    
    return render_template("login.html")


@app.route("/logout")
def logout():
    """Log user out"""
    session.clear()
    return redirect("/")


@app.route("/register", methods=["GET", "POST"])
def register():
    """Register user"""
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        confirmation = request.form.get("confirmation")

        if not username:
            return apology("must provide username", 400)
        elif not password:
            return apology("must provide password", 400)
        elif password != confirmation:
            return apology("passwords must match", 400)

        try:
            new_user_id = db.execute(
                "INSERT INTO users (username, hash) VALUES(?, ?)",
                username,
                generate_password_hash(password),
            )
        except:
            return apology("username already exists", 400)

        session["user_id"] = new_user_id
        session["username"] = username
        flash("🎉 Welcome to ProcrastiNation Analytics!")
        return redirect("/")
    
    return render_template("register.html")


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(debug=debug)
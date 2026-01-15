import logging
import os
from datetime import datetime
from pathlib import Path
from cs50 import SQL
from flask import Flask, flash, redirect, render_template, request, session
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
db = SQL("sqlite:///procrastination.db")

# Logging (minimal but useful)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("procrastination")


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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
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
            FOREIGN KEY (task_id) REFERENCES tasks (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)


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
    """Show dashboard with current tasks and insights"""
    user_id = session["user_id"]
    
    # Get active tasks
    tasks = db.execute("""
        SELECT *, 
               CASE 
                   WHEN deadline < datetime('now') THEN 'overdue'
                   WHEN deadline < datetime('now', '+1 day') THEN 'due_soon'
                   ELSE 'normal'
               END as urgency
        FROM tasks 
        WHERE user_id = ? AND status IN ('pending', 'in_progress')
        ORDER BY 
            CASE 
                WHEN deadline < datetime('now') THEN 1
                WHEN deadline < datetime('now', '+1 day') THEN 2
                ELSE 3
            END,
            importance DESC,
            deadline ASC
        LIMIT 10
    """, user_id)
    
    # Get today's procrastination count
    today_logs = db.execute("""
        SELECT COUNT(*) as count 
        FROM procrastination_logs 
        WHERE user_id = ? AND date(timestamp) = date('now')
    """, user_id)[0]["count"]
    
    # Get week's procrastination pattern
    week_pattern = db.execute("""
        SELECT 
            strftime('%w', timestamp) as day_of_week,
            COUNT(*) as count
        FROM procrastination_logs 
        WHERE user_id = ? AND timestamp >= datetime('now', '-7 days')
        GROUP BY strftime('%w', timestamp)
        ORDER BY day_of_week
    """, user_id)
    
    # Get most common triggers this week
    top_triggers = db.execute("""
        SELECT trigger_reason, COUNT(*) as count
        FROM procrastination_logs 
        WHERE user_id = ? AND timestamp >= datetime('now', '-7 days')
            AND trigger_reason IS NOT NULL
        GROUP BY trigger_reason
        ORDER BY count DESC
        LIMIT 3
    """, user_id)
    
    # Get productivity insights
    total_tasks = db.execute("SELECT COUNT(*) as count FROM tasks WHERE user_id = ?", user_id)[0]["count"]
    completed_tasks = db.execute("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'completed'", user_id)[0]["count"]
    completion_rate = round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)
    
    return render_template("index.html", 
                         tasks=tasks, 
                         today_logs=today_logs,
                         week_pattern=week_pattern,
                         top_triggers=top_triggers,
                         completion_rate=completion_rate,
                         total_tasks=total_tasks)


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

        try:
            db.execute("""
                INSERT INTO tasks (user_id, title, description, estimated_time, importance, deadline)
                VALUES (?, ?, ?, ?, ?, ?)
            """, session["user_id"], title, description, estimated_time, importance, deadline_formatted)
        except Exception:
            logger.exception("Failed to insert task")
            return apology("could not add task", 500)

        flash("✅ Task added successfully!")
        return redirect("/")
    
    return render_template("add_task.html")


@app.route("/log_procrastination", methods=["GET", "POST"])
@login_required
def log_procrastination():
    """Log a procrastination episode"""
    if request.method == "POST":
        task_id = request.form.get("task_id")
        mood = request.form.get("mood")
        energy_level_raw = request.form.get("energy_level")
        environment = request.form.get("environment")
        what_did_instead = request.form.get("what_did_instead")
        trigger_reason = request.form.get("trigger_reason")

        if not mood or not energy_level_raw:
            return apology("must provide mood and energy level")

        try:
            energy_level = int(energy_level_raw)
        except ValueError:
            return apology("energy level must be a number", 400)
        if energy_level < 1 or energy_level > 10:
            return apology("energy level must be between 1 and 10", 400)

        try:
            db.execute("""
                INSERT INTO procrastination_logs 
                (task_id, user_id, mood, energy_level, environment, what_did_instead, trigger_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, task_id if task_id else None, session["user_id"], mood, energy_level,
                environment, what_did_instead, trigger_reason)
        except Exception:
            logger.exception("Failed to insert procrastination log")
            return apology("could not log procrastination", 500)

        flash("📊 Procrastination logged! Building your pattern...")
        return redirect("/")
    
    # Get active tasks for the dropdown
    tasks = db.execute("""
        SELECT id, title FROM tasks 
        WHERE user_id = ? AND status IN ('pending', 'in_progress')
        ORDER BY importance DESC
    """, session["user_id"])
    
    return render_template("log_session.html", tasks=tasks)


@app.route("/analytics")
@login_required
def analytics():
    """Show detailed analytics and insights"""
    user_id = session["user_id"]
    
    # Get procrastination by hour of day
    hourly_data = db.execute("""
        SELECT 
            strftime('%H', timestamp) as hour,
            COUNT(*) as count
        FROM procrastination_logs 
        WHERE user_id = ? AND timestamp >= datetime('now', '-30 days')
        GROUP BY strftime('%H', timestamp)
        ORDER BY hour
    """, user_id)
    
    # Get mood analysis
    mood_data = db.execute("""
        SELECT mood, COUNT(*) as count
        FROM procrastination_logs 
        WHERE user_id = ? AND timestamp >= datetime('now', '-30 days')
        GROUP BY mood
        ORDER BY count DESC
    """, user_id)
    
    # Get energy level analysis
    energy_data = db.execute("""
        SELECT energy_level, COUNT(*) as count
        FROM procrastination_logs 
        WHERE user_id = ? AND timestamp >= datetime('now', '-30 days')
        GROUP BY energy_level
        ORDER BY energy_level
    """, user_id)
    
    # Get environment analysis
    env_data = db.execute("""
        SELECT environment, COUNT(*) as count
        FROM procrastination_logs 
        WHERE user_id = ? AND timestamp >= datetime('now', '-30 days')
            AND environment IS NOT NULL
        GROUP BY environment
        ORDER BY count DESC
    """, user_id)
    
    # Generate insights
    insights = []
    
    if hourly_data:
        peak_hour = max(hourly_data, key=lambda x: x['count'])
        insights.append(f"🕐 Your peak procrastination time is {peak_hour['hour']}:00")
    
    if mood_data:
        top_mood = mood_data[0]
        insights.append(f"😊 You procrastinate most when feeling: {top_mood['mood']}")
    
    if energy_data:
        low_energy_count = sum(d['count'] for d in energy_data if int(d['energy_level']) <= 4)
        total_count = sum(d['count'] for d in energy_data)
        if total_count > 0:
            low_energy_percent = round(low_energy_count / total_count * 100)
            insights.append(f"⚡ {low_energy_percent}% of procrastination happens when energy ≤ 4")
    
    return render_template("analytics.html", 
                         hourly_data=hourly_data,
                         mood_data=mood_data,
                         energy_data=energy_data,
                         env_data=env_data,
                         insights=insights)


@app.route("/healthz")
def healthz():
    """Simple health check."""
    return {"status": "ok"}, 200


@app.route("/complete_task/<int:task_id>", methods=["POST"])
@login_required
def complete_task(task_id):
    """Mark a task as completed"""
    try:
        db.execute("UPDATE tasks SET status = 'completed' WHERE id = ? AND user_id = ?", 
                   task_id, session["user_id"])
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
        db.execute("UPDATE tasks SET status = 'in_progress' WHERE id = ? AND user_id = ?",
                   task_id, session["user_id"])
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
        db.execute("UPDATE tasks SET status = 'abandoned' WHERE id = ? AND user_id = ?",
                   task_id, session["user_id"])
    except Exception:
        logger.exception("Failed to abandon task")
        return apology("could not update task", 500)
    flash("Task abandoned. No guilt — adjust and move on.")
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
        flash("🎉 Welcome to ProcrastiNation Analytics!")
        return redirect("/")
    
    return render_template("register.html")


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(debug=debug)
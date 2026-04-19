function safeParseInt(value, fallback) {
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : fallback;
}

function qs(id) {
	return document.getElementById(id);
}

function getInitialTheme() {
	const saved = window.localStorage.getItem('theme');
	if (saved === 'light' || saved === 'dark') return saved;
	return null;
}

function applyTheme(theme) {
	const root = document.documentElement;
	if (!theme) {
		root.removeAttribute('data-theme');
		return;
	}
	root.setAttribute('data-theme', theme);
}

function toast(message, variant = 'info', title = 'Notification') {
	const root = qs('toast-root');
	if (!root || !message) return;

	const el = document.createElement('div');
	el.className = `toast toast-${variant}`;
	el.innerHTML = `
		<div class="toast-dot"></div>
		<div class="toast-body">
			<div class="toast-title">${title}</div>
			<div class="toast-msg"></div>
		</div>
		<button class="toast-x" type="button" aria-label="Dismiss">✕</button>
	`;
	el.querySelector('.toast-msg').textContent = message;

	const remove = () => {
		el.style.opacity = '0';
		el.style.transform = 'translateY(-6px)';
		window.setTimeout(() => el.remove(), 180);
	};

	el.querySelector('.toast-x').addEventListener('click', remove);
	root.appendChild(el);
	window.setTimeout(remove, 4200);
}

document.addEventListener('DOMContentLoaded', () => {
	// Theme toggle
	const savedTheme = getInitialTheme();
	applyTheme(savedTheme);

	const themeToggle = qs('themeToggle');
	if (themeToggle) {
		themeToggle.addEventListener('click', () => {
			const current = document.documentElement.getAttribute('data-theme');
			const next = current === 'dark' ? 'light' : 'dark';
			applyTheme(next);
			window.localStorage.setItem('theme', next);
			toast(`Switched to ${next} mode`, 'info', 'Theme');
		});
	}

	// Sidebar collapse
	const sidebar = qs('sidebar');
	const sidebarToggle = qs('sidebarToggle');
	if (sidebar && sidebarToggle) {
		const collapsed = window.localStorage.getItem('sidebarCollapsed') === '1';
		if (collapsed) sidebar.classList.add('is-collapsed');
		sidebarToggle.addEventListener('click', () => {
			sidebar.classList.toggle('is-collapsed');
			window.localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('is-collapsed') ? '1' : '0');
		});
	}

	// Flash -> toast system
	const flashData = qs('flash-data');
	if (flashData) {
		try {
			const messages = JSON.parse(flashData.textContent || '[]');
			if (Array.isArray(messages)) {
				messages.forEach((m) => toast(m, 'info', 'Update'));
			}
		} catch {
			// ignore
		}
	}

	// Generic confirm for destructive actions
	document.body.addEventListener('click', (e) => {
		const btn = e.target.closest('button[data-confirm]');
		if (!btn) return;
		const msg = btn.getAttribute('data-confirm') || 'Are you sure?';
		if (!window.confirm(msg)) {
			e.preventDefault();
			e.stopPropagation();
		}
	});

	// Mood selection
	const moodGrid = document.getElementById('moodGrid');
	const moodInput = document.getElementById('moodInput');
	if (moodGrid && moodInput) {
		moodGrid.addEventListener('click', (e) => {
			const option = e.target.closest('.mood-option');
			if (!option) return;
			const mood = option.getAttribute('data-mood');
			moodInput.value = mood;
			moodGrid.querySelectorAll('.mood-option').forEach((el) => el.classList.remove('selected'));
			option.classList.add('selected');
		});
	}

	// Energy slider label
	const energySlider = document.getElementById('energySlider');
	const energyValue = document.getElementById('energyValue');
	if (energySlider && energyValue) {
		const update = () => {
			energyValue.textContent = String(safeParseInt(energySlider.value, 5));
		};
		energySlider.addEventListener('input', update);
		update();
	}

	// Analytics charts
	if (window.PROCRASTINATION_ANALYTICS && typeof Chart !== 'undefined') {
		const { hourly_data, mood_data, energy_data, env_data } = window.PROCRASTINATION_ANALYTICS;

		// Remove skeletons once we render
		document.querySelectorAll('.chart-wrap.is-loading').forEach((el) => el.classList.remove('is-loading'));

		const hourlyLabels = (hourly_data || []).map((d) => `${d.hour}:00`);
		const hourlyCounts = (hourly_data || []).map((d) => d.count);

		const moodLabels = (mood_data || []).map((d) => d.mood);
		const moodCounts = (mood_data || []).map((d) => d.count);

		const energyLabels = (energy_data || []).map((d) => String(d.energy_level));
		const energyCounts = (energy_data || []).map((d) => d.count);

		const envLabels = (env_data || []).map((d) => d.environment || 'Unknown');
		const envCounts = (env_data || []).map((d) => d.count);

		const buildBar = (id, labels, data, label) => {
			const el = document.getElementById(id);
			if (!el) return;
			// eslint-disable-next-line no-new
			new Chart(el, {
				type: 'bar',
				data: {
					labels,
					datasets: [{
						label,
						data,
						backgroundColor: 'rgba(102, 126, 234, 0.5)',
						borderColor: 'rgba(102, 126, 234, 1)',
						borderWidth: 1,
					}],
				},
				options: {
					responsive: true,
					plugins: { legend: { display: false } },
					scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
				},
			});
		};

		const buildDoughnut = (id, labels, data) => {
			const el = document.getElementById(id);
			if (!el) return;
			// eslint-disable-next-line no-new
			new Chart(el, {
				type: 'doughnut',
				data: {
					labels,
					datasets: [{
						data,
						backgroundColor: [
							'#667eea', '#764ba2', '#4facfe', '#00f2fe',
							'#fa709a', '#fee140', '#ff6b6b', '#feca57',
						],
					}],
				},
				options: { responsive: true },
			});
		};

		buildBar('chartHourly', hourlyLabels, hourlyCounts, 'Count');
		buildDoughnut('chartMood', moodLabels, moodCounts);
		buildBar('chartEnergy', energyLabels, energyCounts, 'Count');
		buildBar('chartEnv', envLabels, envCounts, 'Count');
	}
});

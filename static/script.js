function safeParseInt(value, fallback) {
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : fallback;
}

document.addEventListener('DOMContentLoaded', () => {
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

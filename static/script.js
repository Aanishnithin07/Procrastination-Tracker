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

async function postJson(url, payload, csrfToken) {
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-CSRF-Token': csrfToken || '',
		},
		body: JSON.stringify(payload || {}),
	});
	let data = null;
	try {
		data = await res.json();
	} catch {
		// ignore
	}
	return { ok: res.ok, status: res.status, data };
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
		const energyFill = document.getElementById('energyFill');
		const update = () => {
			const value = Math.max(1, Math.min(10, safeParseInt(energySlider.value, 5)));
			energyValue.textContent = String(value);
			if (energyFill) {
				const pct = value * 10;
				const hue = Math.round(((value - 1) / 9) * 120);
				energyFill.style.width = `${pct}%`;
				energyFill.style.background = `hsl(${hue} 82% 48%)`;
			}
		};
		energySlider.addEventListener('input', update);
		update();
	}

	// Logging wizard flow
	const wizardForm = document.getElementById('logWizardForm');
	if (wizardForm) {
		const wizardTrack = document.getElementById('wizTrack');
		const stepChips = [...document.querySelectorAll('[data-step-chip]')];
		const nextButtons = [...wizardForm.querySelectorAll('[data-next-step]')];
		const prevButtons = [...wizardForm.querySelectorAll('[data-prev-step]')];
		const totalSteps = 3;
		let step = 0;

		const renderStep = () => {
			if (wizardTrack) wizardTrack.style.transform = `translateX(-${step * 100}%)`;
			stepChips.forEach((chip, idx) => chip.classList.toggle('is-active', idx === step));
		};

		nextButtons.forEach((btn) => {
			btn.addEventListener('click', () => {
				step = Math.min(totalSteps - 1, step + 1);
				renderStep();
			});
		});

		prevButtons.forEach((btn) => {
			btn.addEventListener('click', () => {
				step = Math.max(0, step - 1);
				renderStep();
			});
		});

		stepChips.forEach((chip, idx) => {
			chip.addEventListener('click', () => {
				step = idx;
				renderStep();
			});
		});

		const selectedTaskId = document.getElementById('selectedTaskId');
		const taskInput = document.getElementById('intendedTaskInput');
		const taskCards = [...wizardForm.querySelectorAll('[data-task-choice]')];
		taskCards.forEach((card) => {
			card.addEventListener('click', () => {
				taskCards.forEach((c) => c.classList.remove('is-selected'));
				card.classList.add('is-selected');
				if (selectedTaskId) selectedTaskId.value = card.getAttribute('data-task-id') || '';
				if (taskInput) taskInput.value = '';
			});
		});
		if (taskInput && selectedTaskId) {
			taskInput.addEventListener('input', () => {
				if (taskInput.value.trim()) {
					selectedTaskId.value = '';
					taskCards.forEach((c) => c.classList.remove('is-selected'));
				}
			});
		}

		const moodInput = document.getElementById('moodInput');
		const moodCards = [...wizardForm.querySelectorAll('[data-mood-choice]')];
		moodCards.forEach((card) => {
			card.addEventListener('click', () => {
				moodCards.forEach((c) => c.classList.remove('is-selected'));
				card.classList.add('is-selected');
				if (moodInput) moodInput.value = card.getAttribute('data-mood') || 'distracted';
			});
		});

		const triggerInput = document.getElementById('triggerInput');
		const triggerPills = [...wizardForm.querySelectorAll('[data-trigger-choice]')];
		triggerPills.forEach((pill) => {
			pill.addEventListener('click', () => {
				const already = pill.classList.contains('is-selected');
				triggerPills.forEach((p) => p.classList.remove('is-selected'));
				if (already) {
					if (triggerInput) triggerInput.value = '';
					return;
				}
				pill.classList.add('is-selected');
				if (triggerInput) triggerInput.value = pill.getAttribute('data-trigger') || '';
			});
		});

		const envInput = document.getElementById('environmentInput');
		const envCards = [...wizardForm.querySelectorAll('[data-env-choice]')];
		envCards.forEach((card) => {
			card.addEventListener('click', () => {
				const already = card.classList.contains('is-selected');
				envCards.forEach((c) => c.classList.remove('is-selected'));
				if (already) {
					if (envInput) envInput.value = '';
					return;
				}
				card.classList.add('is-selected');
				if (envInput) envInput.value = card.getAttribute('data-env') || '';
			});
		});

		renderStep();
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

	// Command center dashboard (kanban + quick add + quotes)
	const ccRoot = document.getElementById('commandCenter');
	if (ccRoot) {
		const csrfToken = ccRoot.getAttribute('data-csrf') || '';

		// Quotes
		const quotesCfg = window.PROCRASTINATION_DASHBOARD;
		const quoteText = document.getElementById('quoteText');
		const quoteAuthor = document.getElementById('quoteAuthor');
		if (quotesCfg && Array.isArray(quotesCfg.quotes) && quotesCfg.quotes.length > 0 && quoteText && quoteAuthor) {
			let idx = safeParseInt(quotesCfg.quoteStart, 0) % quotesCfg.quotes.length;
			const render = () => {
				const q = quotesCfg.quotes[idx] || {};
				quoteText.textContent = q.text ? `“${q.text}”` : '—';
				quoteAuthor.textContent = q.author ? `— ${q.author}` : '';
			};
			render();
			window.setInterval(() => {
				idx = (idx + 1) % quotesCfg.quotes.length;
				render();
			}, 12000);
		}

		// Quick add modal
		const modal = document.getElementById('quickAddModal');
		const openBtn = document.getElementById('openQuickAdd');
		const fab = document.getElementById('fabQuickAdd');
		const form = document.getElementById('quickAddForm');

		const openModal = () => {
			if (!modal) return;
			modal.classList.add('is-open');
			modal.setAttribute('aria-hidden', 'false');
			const first = modal.querySelector('input[name="title"]');
			if (first) first.focus();
		};
		const closeModal = () => {
			if (!modal) return;
			modal.classList.remove('is-open');
			modal.setAttribute('aria-hidden', 'true');
		};

		if (openBtn) openBtn.addEventListener('click', openModal);
		if (fab) fab.addEventListener('click', openModal);
		if (modal) {
			modal.addEventListener('click', (e) => {
				const target = e.target;
				if (target && target.closest && target.closest('[data-close-modal]')) closeModal();
			});
			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
			});
		}

		const buildCard = (task) => {
			const card = document.createElement('article');
			card.className = 'kcard';
			card.setAttribute('draggable', 'true');
			card.setAttribute('data-task-id', String(task.id));
			card.setAttribute('data-status', task.status || 'pending');

			const dots = Array.from({ length: 5 }).map((_, i) => {
				const on = (i + 1) <= safeParseInt(task.importance, 0);
				return `<span class="dot ${on ? 'is-on' : ''}"></span>`;
			}).join('');

			const deadlineVariant = task.deadline_state === 'overdue'
				? 'danger'
				: (task.deadline_state === 'soon' ? 'warning' : 'info');

			card.innerHTML = `
				<div class="kcard-top">
					<div class="kcard-title"></div>
					<div class="kcard-dots" title="Importance">${dots}</div>
				</div>
				${task.description ? '<div class="kcard-desc"></div>' : ''}
				<div class="kcard-meta">
					<span class="badge dot ${deadlineVariant}"></span>
					<span class="badge">Est ${task.estimated_time ? task.estimated_time + 'm' : 'Not specified'}</span>
				</div>
				<div class="kcard-actions">
					<form method="post" action="/start_task/${task.id}" data-inline-action>
						<input type="hidden" name="csrf_token" value="${csrfToken}">
						<button class="btnx" type="submit">Start</button>
					</form>
					<form method="post" action="/complete_task/${task.id}" data-inline-action>
						<input type="hidden" name="csrf_token" value="${csrfToken}">
						<button class="btnx btnx-primary" type="submit">Done</button>
					</form>
					<form method="post" action="/delete_task/${task.id}" data-inline-action>
						<input type="hidden" name="csrf_token" value="${csrfToken}">
						<button class="btnx btnx-danger" type="submit" data-confirm="Delete this task permanently?">✕</button>
					</form>
				</div>
			`;

			card.querySelector('.kcard-title').textContent = task.title || 'Untitled';
			const desc = card.querySelector('.kcard-desc');
			if (desc) desc.textContent = task.description;
			const deadlineEl = card.querySelector('.kcard-meta .badge.dot');
			if (deadlineEl) deadlineEl.textContent = task.deadline_countdown || 'No deadline';
			return card;
		};

		if (form) {
			form.addEventListener('submit', async (e) => {
				e.preventDefault();
				const fd = new FormData(form);
				const payload = {
					title: String(fd.get('title') || '').trim(),
					description: String(fd.get('description') || '').trim(),
					estimated_time: String(fd.get('estimated_time') || '').trim(),
					importance: String(fd.get('importance') || '').trim(),
					deadline: String(fd.get('deadline') || '').trim(),
				};

				const res = await postJson('/api/tasks/quick_add', payload, csrfToken);
				if (!res.ok || !res.data || !res.data.ok) {
					toast((res.data && res.data.error) ? res.data.error : 'Could not create task', 'danger', 'Quick add');
					return;
				}

				const task = res.data.task;
				toast('Task created', 'success', 'Quick add');
				form.reset();
				closeModal();

				const pendingZone = document.querySelector('[data-dropzone="pending"]');
				if (pendingZone) {
					const card = buildCard(task);
					pendingZone.prepend(card);
					persistBoard();
				}
			});
		}

		// Kanban drag & drop
		const kanban = document.getElementById('kanban');
		let dragged = null;

		const getDragAfterElement = (container, y) => {
			const draggableElements = [...container.querySelectorAll('.kcard:not(.dragging)')];
			return draggableElements.reduce((closest, child) => {
				const box = child.getBoundingClientRect();
				const offset = y - (box.top + box.height / 2);
				if (offset < 0 && offset > closest.offset) {
					return { offset, element: child };
				}
				return closest;
			}, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
		};

		const serializeBoard = () => {
			const statuses = ['pending', 'in_progress', 'completed'];
			const columns = {};
			statuses.forEach((s) => {
				const zone = document.querySelector(`[data-dropzone="${s}"]`);
				columns[s] = zone ? [...zone.querySelectorAll('.kcard')].map((el) => el.getAttribute('data-task-id')) : [];
			});
			return { columns };
		};

		let persistTimer = null;
		const persistBoard = () => {
			if (!kanban) return;
			if (persistTimer) window.clearTimeout(persistTimer);
			persistTimer = window.setTimeout(async () => {
				const payload = serializeBoard();
				const res = await postJson('/api/tasks/reorder', payload, csrfToken);
				if (!res.ok || !res.data || !res.data.ok) {
					toast('Could not save board order', 'danger', 'Task board');
					return;
				}
			}, 250);
		};

		if (kanban) {
			kanban.addEventListener('dragstart', (e) => {
				const el = e.target.closest('.kcard');
				if (!el) return;
				dragged = el;
				el.classList.add('dragging');
				e.dataTransfer.effectAllowed = 'move';
				try { e.dataTransfer.setData('text/plain', el.getAttribute('data-task-id') || ''); } catch { /* ignore */ }
			});

			kanban.addEventListener('dragend', () => {
				if (dragged) dragged.classList.remove('dragging');
				dragged = null;
			});

			document.querySelectorAll('[data-dropzone]').forEach((zone) => {
				zone.addEventListener('dragover', (e) => {
					e.preventDefault();
					zone.classList.add('is-over');
					if (!dragged) return;
					const after = getDragAfterElement(zone, e.clientY);
					if (after == null) {
						zone.appendChild(dragged);
					} else {
						zone.insertBefore(dragged, after);
					}
				});
				zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
				zone.addEventListener('drop', (e) => {
					e.preventDefault();
					zone.classList.remove('is-over');
					if (!dragged) return;
					const status = zone.getAttribute('data-dropzone');
					dragged.setAttribute('data-status', status);
					persistBoard();
				});
			});
		}
	}
});

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

	// Tasks management page
	const tasksRoot = document.getElementById('tasksPage');
	if (tasksRoot) {
		const csrfToken = tasksRoot.getAttribute('data-csrf') || '';
		const tasksList = document.getElementById('tasksList');
		const tasksCountBadge = document.getElementById('tasksCountBadge');
		const noResults = document.getElementById('tasksNoResults');
		const emptyState = document.getElementById('tasksEmptyState');
		const visibleCount = document.getElementById('tasksVisibleCount');
		const selectAll = document.getElementById('tasksSelectAll');
		const bulkBar = document.getElementById('tasksBulkBar');
		const selectedCount = document.getElementById('tasksSelectedCount');
		const bulkCompleteBtn = document.getElementById('tasksBulkComplete');
		const bulkDeleteBtn = document.getElementById('tasksBulkDelete');
		const searchInput = document.getElementById('tasksSearchInput');
		const sortBy = document.getElementById('tasksSortBy');
		const sortDirBtn = document.getElementById('tasksSortDir');
		const filterPills = [...tasksRoot.querySelectorAll('[data-filter-group]')];

		let cards = tasksList ? [...tasksList.querySelectorAll('.taskm-card')] : [];
		const filterState = {
			status: 'all',
			importance: 'any',
			due: 'any',
			query: '',
		};

		const toNumber = (value, fallback = 0) => {
			const n = Number(value);
			return Number.isFinite(n) ? n : fallback;
		};

		const formatEstimated = (minutesRaw) => {
			const minutes = toNumber(minutesRaw, 0);
			if (minutes <= 0) return 'Not specified';
			const hours = Math.floor(minutes / 60);
			const mins = minutes % 60;
			if (hours <= 0) return `${mins}m`;
			if (mins === 0) return `${hours}h`;
			return `${hours}h ${mins}m`;
		};

		const importanceBand = (importanceRaw) => {
			const level = toNumber(importanceRaw, 1);
			if (level >= 5) return 'critical';
			if (level === 4) return 'high';
			if (level === 3) return 'medium';
			return 'low';
		};

		const deadlineVariant = (state) => {
			if (state === 'overdue') return 'danger';
			if (state === 'today') return 'warning';
			if (state === 'soon') return 'info';
			return 'info';
		};

		const statusClassMap = {
			pending: 'taskm-status-pending',
			in_progress: 'taskm-status-in_progress',
			completed: 'taskm-status-completed',
			abandoned: 'taskm-status-abandoned',
		};

		const sendTaskRequest = async (formData) => {
			if (!formData.get('csrf_token')) formData.set('csrf_token', csrfToken);
			const res = await fetch('/tasks', {
				method: 'POST',
				headers: {
					'X-Requested-With': 'XMLHttpRequest',
					'X-CSRF-Token': csrfToken,
					Accept: 'application/json',
				},
				body: formData,
			});
			let data = {};
			try {
				data = await res.json();
			} catch {
				data = {};
			}
			if (!res.ok || !data.ok) {
				throw new Error(data.error || 'Task action failed');
			}
			return data;
		};

		const updateCounts = (visibleCards) => {
			const total = cards.length;
			if (tasksCountBadge) {
				tasksCountBadge.textContent = `${total} task${total === 1 ? '' : 's'}`;
			}
			if (visibleCount) {
				visibleCount.textContent = `Showing ${visibleCards.length} of ${total}`;
			}
		};

		const updateEmptyState = () => {
			if (!emptyState) return;
			emptyState.hidden = cards.length !== 0;
		};

		const getSelectedCards = () => cards.filter((card) => {
			const check = card.querySelector('.taskm-check');
			return !!(check && check.checked);
		});

		const updateBulkBar = () => {
			const selected = getSelectedCards();
			if (bulkBar) bulkBar.hidden = selected.length === 0;
			if (selectedCount) selectedCount.textContent = String(selected.length);

			const visibleCards = cards.filter((card) => !card.hidden);
			const visibleChecks = visibleCards.map((card) => card.querySelector('.taskm-check')).filter(Boolean);
			const checkedVisible = visibleChecks.filter((check) => check.checked).length;
			if (selectAll) {
				selectAll.checked = visibleChecks.length > 0 && checkedVisible === visibleChecks.length;
				selectAll.indeterminate = checkedVisible > 0 && checkedVisible < visibleChecks.length;
			}
		};

		const matchesFilter = (card) => {
			if (filterState.status !== 'all' && card.getAttribute('data-status') !== filterState.status) return false;
			if (filterState.importance !== 'any' && card.getAttribute('data-importance-band') !== filterState.importance) return false;
			if (filterState.due !== 'any' && card.getAttribute('data-due-category') !== filterState.due) return false;

			if (filterState.query) {
				const blob = `${card.getAttribute('data-title') || ''} ${(card.getAttribute('data-desc') || '')}`;
				if (!blob.includes(filterState.query)) return false;
			}

			return true;
		};

		const sortVisibleCards = (visibleCards) => {
			const key = sortBy ? sortBy.value : 'deadline';
			const direction = (sortDirBtn && sortDirBtn.getAttribute('data-direction') === 'desc') ? -1 : 1;

			visibleCards.sort((a, b) => {
				if (key === 'title') {
					const av = (a.getAttribute('data-title') || '').toLowerCase();
					const bv = (b.getAttribute('data-title') || '').toLowerCase();
					return av.localeCompare(bv) * direction;
				}

				if (key === 'importance') {
					const av = toNumber(a.getAttribute('data-importance'), 0);
					const bv = toNumber(b.getAttribute('data-importance'), 0);
					return (av - bv) * direction;
				}

				if (key === 'created') {
					const av = toNumber(a.getAttribute('data-created-sort'), 0);
					const bv = toNumber(b.getAttribute('data-created-sort'), 0);
					return (av - bv) * direction;
				}

				const av = toNumber(a.getAttribute('data-deadline-sort'), 9999999999);
				const bv = toNumber(b.getAttribute('data-deadline-sort'), 9999999999);
				return (av - bv) * direction;
			});
		};

		const applyFiltersAndSort = () => {
			const visible = [];
			cards.forEach((card) => {
				const isVisible = matchesFilter(card);
				card.hidden = !isVisible;
				if (isVisible) visible.push(card);
			});

			sortVisibleCards(visible);
			visible.forEach((card) => tasksList.appendChild(card));

			if (noResults) {
				noResults.hidden = !(cards.length > 0 && visible.length === 0);
			}

			updateCounts(visible);
			updateBulkBar();
			updateEmptyState();
		};

		const applyTaskToCard = (card, task) => {
			if (!card || !task) return;

			card.setAttribute('data-status', task.status || 'pending');
			card.setAttribute('data-importance', String(toNumber(task.importance, 3)));
			card.setAttribute('data-importance-band', task.importance_band || importanceBand(task.importance));
			card.setAttribute('data-due-category', task.due_category || 'any');
			card.setAttribute('data-title', String(task.title || '').toLowerCase());
			card.setAttribute('data-desc', String(task.description_snippet || '').toLowerCase());
			card.setAttribute('data-created-sort', String(toNumber(task.created_sort, 0)));
			card.setAttribute('data-deadline-sort', String(toNumber(task.deadline_sort, 9999999999)));

			const titleEl = card.querySelector('[data-role="title"]');
			if (titleEl) titleEl.textContent = task.title || 'Untitled';

			const descEl = card.querySelector('[data-role="desc"]');
			if (descEl) {
				descEl.textContent = task.description_snippet || 'No description yet.';
			}

			const deadlineEl = card.querySelector('[data-role="deadline"]');
			if (deadlineEl) {
				deadlineEl.textContent = task.deadline_countdown || 'No deadline';
				deadlineEl.classList.remove('danger', 'warning', 'info', 'success');
				deadlineEl.classList.add(deadlineVariant(task.deadline_state || 'none'));
			}

			const statusEl = card.querySelector('[data-role="status"]');
			if (statusEl) {
				statusEl.textContent = task.status_label || 'Pending';
				Object.values(statusClassMap).forEach((cls) => statusEl.classList.remove(cls));
				const cls = statusClassMap[task.status || 'pending'];
				if (cls) statusEl.classList.add(cls);
			}

			const estimateEl = card.querySelector('[data-role="estimate"]');
			if (estimateEl) {
				estimateEl.textContent = `Est ${task.estimated_label || formatEstimated(task.estimated_time)}`;
			}

			const impBar = card.querySelector('.taskm-importance-bar');
			if (impBar) {
				for (let i = 1; i <= 5; i += 1) {
					impBar.classList.remove(`imp-${i}`);
				}
				impBar.classList.add(`imp-${toNumber(task.importance, 3)}`);
			}

			const startBtn = card.querySelector('.taskm-btn-start');
			const completeBtn = card.querySelector('.taskm-btn-complete');
			if (startBtn) startBtn.classList.toggle('is-hidden', task.status !== 'pending');
			if (completeBtn) completeBtn.classList.toggle('is-hidden', task.status === 'completed');

			const form = card.querySelector('[data-edit-form]');
			if (form) {
				const titleInput = form.querySelector('input[name="title"]');
				const descInput = form.querySelector('textarea[name="description"]');
				const estInput = form.querySelector('input[name="estimated_time"]');
				const impSelect = form.querySelector('select[name="importance"]');
				const deadlineInput = form.querySelector('input[name="deadline"]');

				if (titleInput) titleInput.value = task.title || '';
				if (descInput) descInput.value = task.description || '';
				if (estInput) estInput.value = task.estimated_time || '';
				if (impSelect) impSelect.value = String(toNumber(task.importance, 3));
				if (deadlineInput) deadlineInput.value = task.deadline_input || '';
			}
		};

		filterPills.forEach((pill) => {
			pill.addEventListener('click', () => {
				const group = pill.getAttribute('data-filter-group');
				const value = pill.getAttribute('data-filter-value');
				if (!group || !value) return;

				filterPills
					.filter((candidate) => candidate.getAttribute('data-filter-group') === group)
					.forEach((candidate) => candidate.classList.remove('is-active'));

				pill.classList.add('is-active');
				filterState[group] = value;
				applyFiltersAndSort();
			});
		});

		if (searchInput) {
			searchInput.addEventListener('input', () => {
				filterState.query = (searchInput.value || '').trim().toLowerCase();
				applyFiltersAndSort();
			});
		}

		if (sortBy) {
			sortBy.addEventListener('change', applyFiltersAndSort);
		}

		if (sortDirBtn) {
			sortDirBtn.addEventListener('click', () => {
				const current = sortDirBtn.getAttribute('data-direction') || 'asc';
				const next = current === 'asc' ? 'desc' : 'asc';
				sortDirBtn.setAttribute('data-direction', next);
				sortDirBtn.textContent = next.toUpperCase();
				applyFiltersAndSort();
			});
		}

		if (selectAll) {
			selectAll.addEventListener('change', () => {
				const visibleCards = cards.filter((card) => !card.hidden);
				visibleCards.forEach((card) => {
					const check = card.querySelector('.taskm-check');
					if (check) check.checked = selectAll.checked;
				});
				updateBulkBar();
			});
		}

		if (tasksList) {
			tasksList.addEventListener('change', (e) => {
				if (e.target && e.target.classList.contains('taskm-check')) {
					updateBulkBar();
				}
			});

			tasksList.addEventListener('click', async (e) => {
				const actionBtn = e.target.closest('[data-task-action]');
				if (actionBtn) {
					const card = actionBtn.closest('.taskm-card');
					if (!card) return;

					const action = actionBtn.getAttribute('data-task-action');
					const taskId = card.getAttribute('data-task-id');
					if (!taskId) return;

					if (action === 'delete') {
						const msg = actionBtn.getAttribute('data-confirm') || 'Delete this task permanently?';
						if (!window.confirm(msg)) return;
					}

					const actionMap = {
						start: 'start_task',
						complete: 'complete_task',
						delete: 'delete_task',
					};
					const payloadAction = actionMap[action];
					if (!payloadAction) return;

					const fd = new FormData();
					fd.set('action', payloadAction);
					fd.set('task_id', taskId);
					fd.set('csrf_token', csrfToken);

					try {
						const data = await sendTaskRequest(fd);
						if (action === 'delete') {
							card.remove();
							cards = cards.filter((item) => item !== card);
							toast('Task deleted.', 'warning', 'Tasks');
						} else if (data.task) {
							applyTaskToCard(card, data.task);
							toast(action === 'start' ? 'Task started.' : 'Task completed.', 'success', 'Tasks');
						}
						applyFiltersAndSort();
					} catch (err) {
						toast(err.message || 'Action failed', 'danger', 'Tasks');
					}
					return;
				}

				const editToggle = e.target.closest('[data-open-edit]');
				if (editToggle) {
					const card = editToggle.closest('.taskm-card');
					if (!card) return;
					const panel = card.querySelector('[data-edit-panel]');
					if (!panel) return;
					panel.hidden = !panel.hidden;
					return;
				}

				const cancelEdit = e.target.closest('[data-cancel-edit]');
				if (cancelEdit) {
					const card = cancelEdit.closest('.taskm-card');
					if (!card) return;
					const panel = card.querySelector('[data-edit-panel]');
					if (panel) panel.hidden = true;
				}
			});

			tasksList.addEventListener('submit', async (e) => {
				const form = e.target.closest('[data-edit-form]');
				if (!form) return;
				e.preventDefault();

				const card = form.closest('.taskm-card');
				if (!card) return;

				const fd = new FormData(form);
				fd.set('action', 'edit_task');
				fd.set('task_id', card.getAttribute('data-task-id') || '');

				try {
					const data = await sendTaskRequest(fd);
					if (data.task) {
						applyTaskToCard(card, data.task);
						const panel = card.querySelector('[data-edit-panel]');
						if (panel) panel.hidden = true;
						toast('Task updated.', 'success', 'Tasks');
						applyFiltersAndSort();
					}
				} catch (err) {
					toast(err.message || 'Could not save task', 'danger', 'Tasks');
				}
			});
		}

		if (bulkCompleteBtn) {
			bulkCompleteBtn.addEventListener('click', async () => {
				const selected = getSelectedCards();
				if (selected.length === 0) return;

				const fd = new FormData();
				fd.set('action', 'bulk_complete');
				fd.set('csrf_token', csrfToken);
				selected.forEach((card) => fd.append('task_ids', card.getAttribute('data-task-id') || ''));

				try {
					const data = await sendTaskRequest(fd);
					const updates = Array.isArray(data.updated_tasks) ? data.updated_tasks : [];
					updates.forEach((task) => {
						const card = tasksList.querySelector(`.taskm-card[data-task-id="${task.id}"]`);
						if (card) {
							const check = card.querySelector('.taskm-check');
							if (check) check.checked = false;
							applyTaskToCard(card, task);
						}
					});
					toast('Selected tasks marked complete.', 'success', 'Tasks');
					applyFiltersAndSort();
				} catch (err) {
					toast(err.message || 'Bulk complete failed', 'danger', 'Tasks');
				}
			});
		}

		if (bulkDeleteBtn) {
			bulkDeleteBtn.addEventListener('click', async () => {
				const selected = getSelectedCards();
				if (selected.length === 0) return;
				const msg = bulkDeleteBtn.getAttribute('data-confirm') || 'Delete selected tasks?';
				if (!window.confirm(msg)) return;

				const fd = new FormData();
				fd.set('action', 'bulk_delete');
				fd.set('csrf_token', csrfToken);
				selected.forEach((card) => fd.append('task_ids', card.getAttribute('data-task-id') || ''));

				try {
					const data = await sendTaskRequest(fd);
					const deletedIds = new Set((data.deleted_ids || []).map((id) => String(id)));
					cards = cards.filter((card) => {
						const keep = !deletedIds.has(card.getAttribute('data-task-id') || '');
						if (!keep) card.remove();
						return keep;
					});
					toast('Selected tasks deleted.', 'warning', 'Tasks');
					applyFiltersAndSort();
				} catch (err) {
					toast(err.message || 'Bulk delete failed', 'danger', 'Tasks');
				}
			});
		}

		applyFiltersAndSort();
	}

	// Focus mode page
	const focusRoot = document.getElementById('focusPage');
	const focusBootNode = document.getElementById('focus-boot');
	let focusBoot = null;
	if (focusBootNode) {
		try {
			focusBoot = JSON.parse(focusBootNode.textContent || '{}');
		} catch {
			focusBoot = null;
		}
	}

	if (focusRoot) {
		document.body.classList.add('focus-immersive');

		const csrfToken = focusRoot.getAttribute('data-csrf') || '';
		const taskSelect = document.getElementById('focusTaskSelect');
		const cycleCounter = document.getElementById('focusCycleCounter');
		const ringProgress = document.getElementById('focusRingProgress');
		const timeDisplay = document.getElementById('focusTimeDisplay');
		const phaseLabel = document.getElementById('focusPhaseLabel');
		const statusNote = document.getElementById('focusStatusNote');

		const startBtn = document.getElementById('focusStartBtn');
		const pauseBtn = document.getElementById('focusPauseBtn');
		const skipBtn = document.getElementById('focusSkipBtn');
		const abandonBtn = document.getElementById('focusAbandonBtn');
		const soundBtn = document.getElementById('focusSoundToggle');

		const completionPrompt = document.getElementById('focusCompletionPrompt');
		const completeYesBtn = document.getElementById('focusTaskDoneYes');
		const completeNoBtn = document.getElementById('focusTaskDoneNo');
		const celebrationLayer = document.getElementById('focusCelebration');

		const pomodoro = (focusBoot && focusBoot.pomodoro) || {};
		const config = {
			focusSeconds: safeParseInt(pomodoro.focus_seconds, 25 * 60),
			shortBreakSeconds: safeParseInt(pomodoro.short_break_seconds, 5 * 60),
			longBreakSeconds: safeParseInt(pomodoro.long_break_seconds, 15 * 60),
			cycleLength: Math.max(1, safeParseInt(pomodoro.cycle_length, 4)),
		};

		const storageKey = 'focusModeState.v1';
		const ringCircumference = 2 * Math.PI * 96;

		const state = {
			sessionId: null,
			sessionType: 'focus',
			focusCountInCycle: 0,
			totalSeconds: config.focusSeconds,
			remainingSeconds: config.focusSeconds,
			running: false,
			paused: false,
			startedAtMs: null,
			startedRemainingSeconds: config.focusSeconds,
			timerHandle: null,
			isCompleting: false,
			soundEnabled: false,
			audioContext: null,
			brownNoise: null,
		};

		const inFocusSession = () => state.sessionType === 'focus';

		const readPersistedState = () => {
			try {
				const raw = window.localStorage.getItem(storageKey);
				if (!raw) return null;
				const parsed = JSON.parse(raw);
				return parsed && typeof parsed === 'object' ? parsed : null;
			} catch {
				return null;
			}
		};

		const persistState = () => {
			try {
				const payload = {
					sessionId: state.sessionId,
					sessionType: state.sessionType,
					focusCountInCycle: state.focusCountInCycle,
					totalSeconds: state.totalSeconds,
					remainingSeconds: state.remainingSeconds,
					running: state.running,
					paused: state.paused,
					startedAtMs: state.startedAtMs,
					startedRemainingSeconds: state.startedRemainingSeconds,
					taskId: taskSelect ? (taskSelect.value || '') : '',
				};
				window.localStorage.setItem(storageKey, JSON.stringify(payload));
			} catch {
				// ignore storage failures
			}
		};

		const clearPersistedState = () => {
			try {
				window.localStorage.removeItem(storageKey);
			} catch {
				// ignore
			}
		};

		const minutesLabel = (minutes) => {
			const n = Math.max(0, safeParseInt(minutes, 0));
			return `${n} minute${n === 1 ? '' : 's'}`;
		};

		const formatClock = (secondsValue) => {
			const clamped = Math.max(0, safeParseInt(secondsValue, 0));
			const minutes = Math.floor(clamped / 60);
			const seconds = clamped % 60;
			return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		};

		const updateCounterLabel = () => {
			if (!cycleCounter) return;
			const nextFocus = Math.min(config.cycleLength, Math.max(1, state.focusCountInCycle + 1));
			cycleCounter.textContent = `Focus ${nextFocus} of ${config.cycleLength}`;
		};

		const updateTimerVisual = () => {
			if (timeDisplay) {
				timeDisplay.textContent = formatClock(state.remainingSeconds);
			}

			if (phaseLabel) {
				if (inFocusSession()) {
					phaseLabel.textContent = state.running ? 'Focus session' : (state.paused ? 'Focus paused' : 'Focus session');
				} else {
					const isLong = state.focusCountInCycle >= config.cycleLength;
					const label = isLong ? 'Long break' : 'Short break';
					phaseLabel.textContent = state.running ? label : `${label} ready`;
				}
			}

			if (ringProgress) {
				ringProgress.style.strokeDasharray = `${ringCircumference}`;
				const denom = Math.max(1, state.totalSeconds);
				const progress = 1 - (Math.max(0, state.remainingSeconds) / denom);
				const clamped = Math.max(0, Math.min(1, progress));
				ringProgress.style.strokeDashoffset = `${ringCircumference * (1 - clamped)}`;
				ringProgress.classList.toggle('is-break', !inFocusSession());
			}

			updateCounterLabel();
		};

		const updateControls = () => {
			const hasActiveSession = !!state.sessionId;
			if (startBtn) {
				startBtn.disabled = state.running;
				startBtn.textContent = state.paused ? 'Resume' : 'Start';
			}
			if (pauseBtn) pauseBtn.disabled = !state.running;
			if (skipBtn) skipBtn.disabled = !hasActiveSession;
			if (abandonBtn) abandonBtn.disabled = !hasActiveSession;
			if (taskSelect) taskSelect.disabled = hasActiveSession;
		};

		const setStatus = (message) => {
			if (statusNote) statusNote.textContent = message;
		};

		const beginTicker = () => {
			if (state.timerHandle) {
				window.clearInterval(state.timerHandle);
				state.timerHandle = null;
			}

			const tick = () => {
				if (!state.running) return;

				const elapsed = Math.floor((Date.now() - (state.startedAtMs || Date.now())) / 1000);
				state.remainingSeconds = Math.max(0, state.startedRemainingSeconds - elapsed);
				updateTimerVisual();
				persistState();

				if (state.remainingSeconds <= 0) {
					window.clearInterval(state.timerHandle);
					state.timerHandle = null;
					state.running = false;
					state.paused = false;
					finalizeCurrentSegment(true);
				}
			};

			state.timerHandle = window.setInterval(tick, 250);
			tick();
		};

		const pauseTicker = () => {
			if (!state.running) return;
			const elapsed = Math.floor((Date.now() - (state.startedAtMs || Date.now())) / 1000);
			state.remainingSeconds = Math.max(0, state.startedRemainingSeconds - elapsed);
			state.running = false;
			state.paused = true;

			if (state.timerHandle) {
				window.clearInterval(state.timerHandle);
				state.timerHandle = null;
			}

			setStatus('Paused. Press Space or Resume when ready.');
			updateTimerVisual();
			updateControls();
			persistState();
		};

		const resumeTicker = () => {
			state.startedAtMs = Date.now();
			state.startedRemainingSeconds = state.remainingSeconds;
			state.running = true;
			state.paused = false;
			setStatus(`Running ${inFocusSession() ? 'focus' : 'break'} block.`);
			updateControls();
			persistState();
			beginTicker();
		};

		const applyServerSession = (sessionPayload, persisted) => {
			if (!sessionPayload) return;

			state.sessionId = safeParseInt(sessionPayload.id, null);
			state.sessionType = (sessionPayload.session_type === 'break') ? 'break' : 'focus';

			if (persisted && safeParseInt(persisted.sessionId, null) === state.sessionId) {
				state.focusCountInCycle = Math.max(0, safeParseInt(persisted.focusCountInCycle, 0));
				state.totalSeconds = Math.max(1, safeParseInt(persisted.totalSeconds, state.sessionType === 'focus' ? config.focusSeconds : config.shortBreakSeconds));
				state.remainingSeconds = Math.max(0, safeParseInt(persisted.remainingSeconds, state.totalSeconds));
				state.running = !!persisted.running;
				state.paused = !!persisted.paused;
				state.startedAtMs = safeParseInt(persisted.startedAtMs, Date.now());
				state.startedRemainingSeconds = Math.max(1, safeParseInt(persisted.startedRemainingSeconds, state.totalSeconds));

				if (taskSelect && persisted.taskId) {
					taskSelect.value = String(persisted.taskId);
				}
			} else {
				const elapsed = Math.max(0, safeParseInt(sessionPayload.elapsed_seconds, 0));
				const fallbackTotal = state.sessionType === 'focus' ? config.focusSeconds : config.shortBreakSeconds;
				state.totalSeconds = fallbackTotal;
				state.remainingSeconds = Math.max(0, fallbackTotal - elapsed);
				state.startedAtMs = Date.now() - (elapsed * 1000);
				state.startedRemainingSeconds = fallbackTotal;
				state.running = state.remainingSeconds > 0;
				state.paused = false;
				if (taskSelect && sessionPayload.task_id) {
					taskSelect.value = String(sessionPayload.task_id);
				}
			}
		};

		const startSessionOnServer = async () => {
			const selectedTask = taskSelect ? (taskSelect.value || null) : null;
			const res = await fetch('/sessions/start', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': csrfToken,
					Accept: 'application/json',
				},
				body: JSON.stringify({
					task_id: selectedTask,
					session_type: state.sessionType,
				}),
			});

			let data = {};
			try {
				data = await res.json();
			} catch {
				data = {};
			}

			if (res.status === 409 && data.active_session) {
				applyServerSession(data.active_session, readPersistedState());
				setStatus('Resumed your existing active session.');
				updateTimerVisual();
				updateControls();
				persistState();
				if (state.running && !state.paused) beginTicker();
				return;
			}

			if (!res.ok || !data.ok || !data.session) {
				throw new Error(data.error || 'Could not start session');
			}

			applyServerSession(data.session, readPersistedState());
		};

		const stopSessionOnServer = async () => {
			if (!state.sessionId) return null;

			const res = await fetch('/sessions/stop', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': csrfToken,
					Accept: 'application/json',
				},
				body: JSON.stringify({ session_id: state.sessionId }),
			});

			let data = {};
			try {
				data = await res.json();
			} catch {
				data = {};
			}

			if (!res.ok || !data.ok) {
				throw new Error(data.error || 'Could not stop session');
			}

			return data.session || null;
		};

		const abandonSessionOnServer = async () => {
			if (!state.sessionId) return null;

			const res = await fetch('/sessions/abandon', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': csrfToken,
					Accept: 'application/json',
				},
				body: JSON.stringify({ session_id: state.sessionId }),
			});

			let data = {};
			try {
				data = await res.json();
			} catch {
				data = {};
			}

			if (!res.ok || !data.ok) {
				throw new Error(data.error || 'Could not abandon session');
			}

			return data.session || null;
		};

		const markSelectedTaskComplete = async () => {
			if (!taskSelect || !taskSelect.value) {
				completionPrompt.hidden = true;
				return;
			}

			const fd = new FormData();
			fd.set('action', 'complete_task');
			fd.set('task_id', String(taskSelect.value));
			fd.set('csrf_token', csrfToken);

			const res = await fetch('/tasks', {
				method: 'POST',
				headers: {
					'X-Requested-With': 'XMLHttpRequest',
					'X-CSRF-Token': csrfToken,
					Accept: 'application/json',
				},
				body: fd,
			});

			let data = {};
			try {
				data = await res.json();
			} catch {
				data = {};
			}

			if (!res.ok || !data.ok) {
				throw new Error(data.error || 'Could not mark task complete');
			}

			toast('Task marked complete.', 'success', 'Focus mode');
			completionPrompt.hidden = true;
		};

		const runCelebration = () => {
			if (!celebrationLayer) return;
			celebrationLayer.innerHTML = '';
			const colors = ['#6C63FF', '#22C55E', '#3B82F6', '#F59E0B', '#EF4444'];
			for (let i = 0; i < 28; i += 1) {
				const shard = document.createElement('span');
				shard.className = 'focus-confetti';
				shard.style.left = `${Math.random() * 100}%`;
				shard.style.background = colors[i % colors.length];
				shard.style.animationDelay = `${Math.random() * 0.25}s`;
				shard.style.transform = `translateY(-10px) rotate(${Math.random() * 360}deg)`;
				celebrationLayer.appendChild(shard);
			}
			window.setTimeout(() => {
				if (celebrationLayer) celebrationLayer.innerHTML = '';
			}, 1700);
		};

		const stopAmbient = () => {
			if (state.brownNoise) {
				try { state.brownNoise.source.stop(); } catch { /* ignore */ }
				try { state.brownNoise.source.disconnect(); } catch { /* ignore */ }
				try { state.brownNoise.gain.disconnect(); } catch { /* ignore */ }
				state.brownNoise = null;
			}
			state.soundEnabled = false;
			if (soundBtn) {
				soundBtn.textContent = 'Ambient sound: Off';
				soundBtn.setAttribute('aria-pressed', 'false');
			}
		};

		const startAmbient = async () => {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) {
				toast('Web Audio API is unavailable in this browser.', 'warning', 'Focus mode');
				return;
			}

			if (!state.audioContext) {
				state.audioContext = new AudioCtx();
			}

			await state.audioContext.resume();

			if (!state.brownNoise) {
				const sampleRate = state.audioContext.sampleRate;
				const frameCount = sampleRate * 2;
				const buffer = state.audioContext.createBuffer(1, frameCount, sampleRate);
				const data = buffer.getChannelData(0);
				let lastOut = 0;
				for (let i = 0; i < frameCount; i += 1) {
					const white = (Math.random() * 2) - 1;
					const brown = (lastOut + (0.02 * white)) / 1.02;
					lastOut = brown;
					data[i] = brown * 3.5;
				}

				const source = state.audioContext.createBufferSource();
				source.buffer = buffer;
				source.loop = true;

				const filter = state.audioContext.createBiquadFilter();
				filter.type = 'lowpass';
				filter.frequency.value = 340;

				const gain = state.audioContext.createGain();
				gain.gain.value = 0.045;

				source.connect(filter);
				filter.connect(gain);
				gain.connect(state.audioContext.destination);
				source.start();

				state.brownNoise = { source, gain };
			}

			state.soundEnabled = true;
			if (soundBtn) {
				soundBtn.textContent = 'Ambient sound: On';
				soundBtn.setAttribute('aria-pressed', 'true');
			}
		};

		const setNextSegment = (completedType) => {
			if (completedType === 'focus') {
				state.focusCountInCycle = Math.min(config.cycleLength, state.focusCountInCycle + 1);
				state.sessionType = 'break';
				state.totalSeconds = (state.focusCountInCycle >= config.cycleLength)
					? config.longBreakSeconds
					: config.shortBreakSeconds;
				state.remainingSeconds = state.totalSeconds;
				setStatus(`Focus block logged. Break ready for ${minutesLabel(Math.floor(state.totalSeconds / 60))}.`);
				return;
			}

			if (state.focusCountInCycle >= config.cycleLength) {
				state.focusCountInCycle = 0;
			}
			state.sessionType = 'focus';
			state.totalSeconds = config.focusSeconds;
			state.remainingSeconds = config.focusSeconds;
			setStatus('Break logged. Ready for the next focus block.');
		};

		const finalizeCurrentSegment = async (showCompletionPrompt) => {
			if (state.isCompleting || !state.sessionId) return;
			state.isCompleting = true;

			const completedType = state.sessionType;
			try {
				const completedSession = await stopSessionOnServer();
				state.sessionId = null;
				state.running = false;
				state.paused = false;
				state.startedAtMs = null;
				state.startedRemainingSeconds = state.totalSeconds;

				setNextSegment(completedType);
				updateTimerVisual();
				updateControls();

				if (completedType === 'focus') {
					runCelebration();
					if (completionPrompt) completionPrompt.hidden = !showCompletionPrompt;
					const mins = completedSession && completedSession.duration_minutes;
					toast(`Focus session logged (${minutesLabel(mins)}).`, 'success', 'Focus mode');
				} else {
					if (completionPrompt) completionPrompt.hidden = true;
					const mins = completedSession && completedSession.duration_minutes;
					toast(`Break session logged (${minutesLabel(mins)}).`, 'info', 'Focus mode');
				}
			} catch (err) {
				toast(err.message || 'Could not close session.', 'danger', 'Focus mode');
			} finally {
				state.isCompleting = false;
				persistState();
			}
		};

		const startOrResume = async () => {
			if (state.running) return;

			if (!state.sessionId) {
				try {
					await startSessionOnServer();
				} catch (err) {
					toast(err.message || 'Could not start session.', 'danger', 'Focus mode');
					return;
				}
			}

			if (completionPrompt) completionPrompt.hidden = true;
			resumeTicker();
		};

		const skipCurrent = async () => {
			if (!state.sessionId) return;
			if (state.timerHandle) {
				window.clearInterval(state.timerHandle);
				state.timerHandle = null;
			}
			state.running = false;
			state.paused = false;
			setStatus('Skipping current session...');
			await finalizeCurrentSegment(false);
		};

		const abandonCurrent = async () => {
			if (!state.sessionId) return;
			if (!window.confirm('Abandon this session?')) return;

			if (state.timerHandle) {
				window.clearInterval(state.timerHandle);
				state.timerHandle = null;
			}

			state.running = false;
			state.paused = false;
			try {
				await abandonSessionOnServer();
				toast('Session abandoned.', 'warning', 'Focus mode');
			} catch (err) {
				toast(err.message || 'Could not abandon session.', 'danger', 'Focus mode');
			}

			state.sessionId = null;
			state.sessionType = 'focus';
			state.totalSeconds = config.focusSeconds;
			state.remainingSeconds = config.focusSeconds;
			state.startedAtMs = null;
			state.startedRemainingSeconds = config.focusSeconds;
			if (completionPrompt) completionPrompt.hidden = true;
			setStatus('Session abandoned. Reset and begin again when ready.');
			updateTimerVisual();
			updateControls();
			persistState();
		};

		const syncWithActiveSession = async (persisted) => {
			const res = await fetch('/sessions/active', { headers: { Accept: 'application/json' } });
			if (!res.ok) return;

			let data = {};
			try {
				data = await res.json();
			} catch {
				data = {};
			}

			if (!data.ok || !data.active_session) {
				if (persisted && persisted.sessionId) clearPersistedState();
				return;
			}

			applyServerSession(data.active_session, persisted);

			if (state.remainingSeconds <= 0) {
				await finalizeCurrentSegment(false);
			}
		};

		if (startBtn) {
			startBtn.addEventListener('click', () => {
				startOrResume();
			});
		}

		if (pauseBtn) {
			pauseBtn.addEventListener('click', () => {
				pauseTicker();
			});
		}

		if (skipBtn) {
			skipBtn.addEventListener('click', () => {
				skipCurrent();
			});
		}

		if (abandonBtn) {
			abandonBtn.addEventListener('click', () => {
				abandonCurrent();
			});
		}

		if (soundBtn) {
			soundBtn.addEventListener('click', async () => {
				try {
					if (state.soundEnabled) {
						stopAmbient();
					} else {
						await startAmbient();
					}
				} catch {
					toast('Could not toggle ambient sound.', 'danger', 'Focus mode');
				}
			});
		}

		if (completeYesBtn) {
			completeYesBtn.addEventListener('click', async () => {
				try {
					await markSelectedTaskComplete();
				} catch (err) {
					toast(err.message || 'Could not update task.', 'danger', 'Focus mode');
				}
			});
		}

		if (completeNoBtn) {
			completeNoBtn.addEventListener('click', () => {
				if (completionPrompt) completionPrompt.hidden = true;
			});
		}

		document.addEventListener('keydown', (e) => {
			if (!focusRoot) return;
			const tag = (document.activeElement && document.activeElement.tagName
				? document.activeElement.tagName.toLowerCase()
				: '');
			if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

			if (e.code === 'Space') {
				e.preventDefault();
				if (state.running) {
					pauseTicker();
				} else {
					startOrResume();
				}
			}

			if (e.key === 'Escape' && state.sessionId) {
				e.preventDefault();
				abandonCurrent();
			}
		});

		const initFocus = async () => {
			const persisted = readPersistedState();
			if (persisted && taskSelect && persisted.taskId) {
				taskSelect.value = String(persisted.taskId);
			}

			const bootActive = focusBoot && focusBoot.active_session;
			if (bootActive) {
				applyServerSession(bootActive, persisted);
			}

			await syncWithActiveSession(persisted);

			if (state.running && !state.paused) {
				beginTicker();
			}

			if (!state.sessionId) {
				state.sessionType = 'focus';
				state.totalSeconds = config.focusSeconds;
				state.remainingSeconds = config.focusSeconds;
			}

			setStatus(state.sessionId ? 'Session restored.' : 'Ready when you are.');
			updateTimerVisual();
			updateControls();
			persistState();
		};

		updateTimerVisual();
		updateControls();
		initFocus();
	}

	// Analytics insight dashboard
	const analyticsRoot = document.getElementById('analyticsDashboard');
	const analyticsBootNode = document.getElementById('analytics-dashboard-boot');
	let analyticsBoot = null;
	if (analyticsBootNode) {
		try {
			analyticsBoot = JSON.parse(analyticsBootNode.textContent || '{}');
		} catch {
			analyticsBoot = null;
		}
	}
	if (!analyticsBoot && window.ANALYTICS_DASHBOARD_BOOT) {
		analyticsBoot = window.ANALYTICS_DASHBOARD_BOOT;
	}

	if (analyticsRoot && analyticsBoot && typeof Chart !== 'undefined') {
		const bootPayload = analyticsBoot;
		const rangeButtons = [...analyticsRoot.querySelectorAll('[data-range]')];
		const exportBtn = document.getElementById('analyticsExportBtn');
		const insightsList = document.getElementById('analyticsInsights');
		const summaryLogs = document.getElementById('summaryLogs');
		const summaryAdded = document.getElementById('summaryAdded');
		const summaryCompleted = document.getElementById('summaryCompleted');
		const summaryFocusMinutes = document.getElementById('summaryFocusMinutes');
		const summaryFocusSessions = document.getElementById('summaryFocusSessions');
		const gaugeArc = document.getElementById('completionGaugeArc');
		const gaugeValue = document.getElementById('completionGaugeValue');
		const focusCorrelationValue = document.getElementById('focusCorrelationValue');
		const focusCorrelationText = document.getElementById('focusCorrelationText');

		const charts = {};
		const moodPalette = {
			overwhelmed: '#ef4444',
			anxious: '#f59e0b',
			bored: '#94a3b8',
			tired: '#6366f1',
			distracted: '#3b82f6',
			unknown: '#64748b',
		};

		const setActiveRange = (range) => {
			rangeButtons.forEach((btn) => {
				btn.classList.toggle('is-active', btn.getAttribute('data-range') === range);
			});
		};

		const updateExportHref = (range) => {
			if (!exportBtn) return;
			exportBtn.setAttribute('href', `/api/analytics/export?range=${encodeURIComponent(range || 'week')}`);
		};

		const destroyChart = (key) => {
			if (charts[key]) {
				charts[key].destroy();
				delete charts[key];
			}
		};

		const colorForIntensity = (value, max) => {
			const intensity = max > 0 ? (value / max) : 0;
			const alpha = 0.12 + (0.76 * intensity);
			return `rgba(108, 99, 255, ${alpha.toFixed(3)})`;
		};

		const renderInsights = (insights) => {
			if (!insightsList) return;
			insightsList.innerHTML = '';
			const source = Array.isArray(insights) && insights.length
				? insights
				: ['Not enough signal yet. Keep logging and this section will become more specific.'];
			source.forEach((text) => {
				const li = document.createElement('li');
				li.textContent = text;
				insightsList.appendChild(li);
			});
		};

		const renderSummary = (summary) => {
			if (!summary) return;
			if (summaryLogs) summaryLogs.textContent = String(safeParseInt(summary.logs_total, 0));
			if (summaryAdded) summaryAdded.textContent = String(safeParseInt(summary.tasks_added_total, 0));
			if (summaryCompleted) summaryCompleted.textContent = String(safeParseInt(summary.tasks_completed_total, 0));
			if (summaryFocusMinutes) summaryFocusMinutes.textContent = String(safeParseInt(summary.focus_minutes_total, 0));
			if (summaryFocusSessions) summaryFocusSessions.textContent = String(safeParseInt(summary.focus_sessions_total, 0));
		};

		const renderGauge = (rateValue) => {
			if (!gaugeArc || !gaugeValue) return;
			const rate = Math.max(0, Math.min(100, safeParseInt(rateValue, 0)));
			const length = gaugeArc.getTotalLength();
			gaugeArc.style.strokeDasharray = `${length}`;
			gaugeArc.style.strokeDashoffset = `${length * (1 - (rate / 100))}`;
			gaugeValue.textContent = `${rate}%`;
		};

		const renderHeatmap = (heatmap) => {
			const el = document.getElementById('chartHeatmap');
			if (!el) return;
			destroyChart('heatmap');

			const points = (heatmap && Array.isArray(heatmap.points)) ? heatmap.points : [];
			const maxValue = Math.max(1, ...points.map((p) => safeParseInt(p.v, 0)));
			const maxWeek = Math.max(0, ...points.map((p) => safeParseInt(p.x, 0)));
			const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

			charts.heatmap = new Chart(el, {
				type: 'scatter',
				data: {
					datasets: [{
						data: points,
						pointStyle: 'rectRounded',
						pointRadius: (ctx) => ((ctx.raw && ctx.raw.in_range) ? 8 : 6),
						pointHoverRadius: 9,
						pointBorderWidth: 1,
						pointBorderColor: 'rgba(108, 99, 255, 0.42)',
						pointBackgroundColor: (ctx) => {
							const raw = ctx.raw || {};
							if (!raw.in_range) return 'rgba(148, 163, 184, 0.09)';
							return colorForIntensity(safeParseInt(raw.v, 0), maxValue);
						},
					}],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: {
							callbacks: {
								title: (items) => ((items[0] && items[0].raw && items[0].raw.date) ? items[0].raw.date : ''),
								label: (item) => `${safeParseInt(item.raw && item.raw.v, 0)} logs`,
							},
						},
					},
					scales: {
						x: {
							type: 'linear',
							min: -0.5,
							max: maxWeek + 0.5,
							grid: { display: false },
							ticks: {
								stepSize: 1,
								callback: (value) => `W${safeParseInt(value, 0) + 1}`,
							},
						},
						y: {
							type: 'linear',
							min: -0.5,
							max: 6.5,
							reverse: true,
							grid: { display: false },
							ticks: {
								stepSize: 1,
								callback: (value) => weekdays[safeParseInt(value, -1)] || '',
							},
						},
					},
				},
			});
		};

		const renderHourly = (hourly) => {
			const el = document.getElementById('chartHourly');
			if (!el) return;
			destroyChart('hourly');

			const labels = (hourly && Array.isArray(hourly.labels)) ? hourly.labels.map((h) => `${String(h).padStart(2, '0')}:00`) : [];
			const counts = (hourly && Array.isArray(hourly.counts)) ? hourly.counts : [];

			charts.hourly = new Chart(el, {
				type: 'bar',
				data: {
					labels,
					datasets: [{
						label: 'Logs',
						data: counts,
						borderWidth: 1,
						borderColor: 'rgba(108, 99, 255, 0.95)',
						backgroundColor: 'rgba(108, 99, 255, 0.30)',
						borderRadius: 6,
					}],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: { legend: { display: false } },
					scales: {
						y: { beginAtZero: true, ticks: { precision: 0 } },
					},
				},
			});
		};

		const renderMoodEnergy = (moodEnergy) => {
			const el = document.getElementById('chartMoodEnergy');
			if (!el) return;
			destroyChart('moodEnergy');

			const points = (moodEnergy && Array.isArray(moodEnergy.points)) ? moodEnergy.points : [];
			const grouped = {};
			points.forEach((p) => {
				const mood = (p.mood || 'unknown').toLowerCase();
				if (!grouped[mood]) grouped[mood] = [];
				grouped[mood].push(p);
			});

			const datasets = Object.keys(grouped).map((mood) => ({
				label: mood,
				data: grouped[mood],
				pointRadius: 5,
				pointHoverRadius: 7,
				borderWidth: 0,
				backgroundColor: moodPalette[mood] || moodPalette.unknown,
			}));

			charts.moodEnergy = new Chart(el, {
				type: 'scatter',
				data: { datasets },
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						tooltip: {
							callbacks: {
								label: (ctx) => {
									const raw = ctx.raw || {};
									const mood = raw.mood || ctx.dataset.label;
									const hour = safeParseInt(raw.y, 0);
									const energy = safeParseInt(raw.x, 0);
									return `${mood} | energy ${energy} | ${String(hour).padStart(2, '0')}:00`;
								},
							},
						},
					},
					scales: {
						x: {
							type: 'linear',
							min: 0.5,
							max: 10.5,
							ticks: { stepSize: 1 },
							title: { display: true, text: 'Energy level' },
						},
						y: {
							type: 'linear',
							min: -0.5,
							max: 23.5,
							ticks: {
								stepSize: 2,
								callback: (value) => `${String(safeParseInt(value, 0)).padStart(2, '0')}:00`,
							},
							title: { display: true, text: 'Hour of day' },
						},
					},
				},
			});
		};

		const renderMoodDistribution = (distribution) => {
			const el = document.getElementById('chartMoodDistribution');
			if (!el) return;
			destroyChart('moodDistribution');

			const items = Array.isArray(distribution) ? distribution : [];
			const labels = items.length ? items.map((item) => item.mood) : ['No logs'];
			const values = items.length ? items.map((item) => safeParseInt(item.count, 0)) : [1];
			const colors = labels.map((mood) => moodPalette[(mood || 'unknown').toLowerCase()] || moodPalette.unknown);

			charts.moodDistribution = new Chart(el, {
				type: 'doughnut',
				data: {
					labels,
					datasets: [{
						data: values,
						backgroundColor: colors,
						borderWidth: 1,
						borderColor: 'rgba(255,255,255,0.14)',
					}],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: { legend: { position: 'bottom' } },
				},
			});
		};

		const renderTaskTrend = (trend) => {
			const el = document.getElementById('chartTaskTrend');
			if (!el) return;
			destroyChart('taskTrend');

			const labels = (trend && Array.isArray(trend.labels)) ? trend.labels : [];
			const added = (trend && Array.isArray(trend.added)) ? trend.added : [];
			const completed = (trend && Array.isArray(trend.completed)) ? trend.completed : [];

			charts.taskTrend = new Chart(el, {
				type: 'line',
				data: {
					labels,
					datasets: [
						{
							label: 'Added',
							data: added,
							borderColor: 'rgba(59, 130, 246, 1)',
							backgroundColor: 'rgba(59, 130, 246, 0.2)',
							pointRadius: 4,
							tension: 0.35,
						},
						{
							label: 'Completed',
							data: completed,
							borderColor: 'rgba(34, 197, 94, 1)',
							backgroundColor: 'rgba(34, 197, 94, 0.2)',
							pointRadius: 4,
							tension: 0.35,
						},
					],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						y: { beginAtZero: true, ticks: { precision: 0 } },
					},
				},
			});
		};

		const renderFocusCorrelation = (focusCorrelation) => {
			const el = document.getElementById('chartFocusCorrelation');
			if (!el) return;
			destroyChart('focusCorrelation');

			const points = (focusCorrelation && Array.isArray(focusCorrelation.points))
				? focusCorrelation.points.map((item) => ({
					x: safeParseInt(item.focus_minutes, 0),
					y: safeParseInt(item.procrastination_logs, 0),
					date: item.date,
				}))
				: [];

			charts.focusCorrelation = new Chart(el, {
				type: 'scatter',
				data: {
					datasets: [{
						label: 'Day',
						data: points,
						pointRadius: 6,
						pointHoverRadius: 8,
						borderWidth: 0,
						backgroundColor: 'rgba(99, 102, 241, 0.72)',
					}],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: {
							callbacks: {
								label: (ctx) => {
									const raw = ctx.raw || {};
									return `${raw.date || ''} | ${safeParseInt(raw.x, 0)} focus min, ${safeParseInt(raw.y, 0)} logs`;
								},
							},
						},
					},
					scales: {
						x: {
							type: 'linear',
							beginAtZero: true,
							title: { display: true, text: 'Focus minutes' },
							ticks: { precision: 0 },
						},
						y: {
							type: 'linear',
							beginAtZero: true,
							title: { display: true, text: 'Procrastination logs' },
							ticks: { precision: 0 },
						},
					},
				},
			});

			const coeff = focusCorrelation ? focusCorrelation.coefficient : null;
			if (focusCorrelationValue) {
				if (coeff === null || typeof coeff === 'undefined') {
					focusCorrelationValue.textContent = 'N/A';
				} else {
					focusCorrelationValue.textContent = Number(coeff).toFixed(3);
				}
			}

			if (focusCorrelationText) {
				focusCorrelationText.textContent = (focusCorrelation && focusCorrelation.interpretation)
					? focusCorrelation.interpretation
					: 'Not enough variance yet to interpret correlation.';
			}
		};

		const renderPayload = (payload) => {
			if (!payload) return;
			renderSummary(payload.summary || {});
			renderInsights(payload.insights || []);
			renderHeatmap(payload.heatmap || {});
			renderHourly(payload.hourly || {});
			renderMoodEnergy(payload.mood_energy || {});
			renderMoodDistribution(payload.mood_distribution || []);
			renderTaskTrend(payload.completion_trend || {});
			renderFocusCorrelation(payload.focus_correlation || {});
			renderGauge(payload.completion_rate || 0);
			setActiveRange(payload.range || 'week');
			updateExportHref(payload.range || 'week');
		};

		const fetchRange = async (range) => {
			const url = `/api/analytics?range=${encodeURIComponent(range || 'week')}`;
			const res = await fetch(url, { headers: { Accept: 'application/json' } });
			if (!res.ok) throw new Error('Failed to load analytics');
			const data = await res.json();
			if (!data || !data.ok) throw new Error('Invalid analytics response');
			return data;
		};

		rangeButtons.forEach((btn) => {
			btn.addEventListener('click', async () => {
				const range = btn.getAttribute('data-range') || 'week';
				try {
					const payload = await fetchRange(range);
					renderPayload(payload);
				} catch {
					toast('Could not refresh analytics for that range.', 'danger', 'Analytics');
				}
			});
		});

		renderPayload(bootPayload);
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

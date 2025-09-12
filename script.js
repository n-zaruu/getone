// Include Luxon for timezone handling
const { DateTime } = luxon;

// Check if we're on the home page (index.html) before initializing habit/task trackers
if (document.querySelector('.progress-circle')) {
    // Progress Circle Animation
    const circle = document.querySelector('.progress-ring__circle');
    const circleText = document.getElementById('circle-text');
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;

    // Initialize progress
    let circleProgress = JSON.parse(localStorage.getItem('circleProgress')) || 0;
    let previousCircleProgress = JSON.parse(localStorage.getItem('previousCircleProgress')) || 0;
    let hasIncrementedToday = JSON.parse(localStorage.getItem('hasIncrementedToday')) || false;
    let currentDate = JSON.parse(localStorage.getItem('currentDate')) || '2025-09-11';
    let userTimezone = localStorage.getItem('userTimezone') || 'Asia/Jakarta';
    let draggedItem = null;

    // Get user's timezone using geolocation
    function getUserTimezone() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
                    localStorage.setItem('userTimezone', userTimezone);
                    console.log(`Timezone set to: ${userTimezone}`);
                    checkForNewDay();
                    updateDateDisplay();
                    registerServiceWorker();
                },
                error => {
                    console.warn('Geolocation access denied or unavailable, using default timezone:', userTimezone);
                    checkForNewDay();
                    updateDateDisplay();
                    registerServiceWorker();
                }
            );
        } else {
            console.warn('Geolocation not supported, using default timezone:', userTimezone);
            checkForNewDay();
            updateDateDisplay();
            registerServiceWorker();
        }
    }

    function setProgress(percent) {
        const isNegative = percent < 0;
        const absPercent = Math.abs(percent);
        const offset = circumference - (absPercent / 100) * circumference;
        circle.style.strokeDashoffset = isNegative ? -offset : offset;
        circle.classList.toggle('negative', isNegative);
        circleText.textContent = `${percent}%`;
        localStorage.setItem('circleProgress', JSON.stringify(percent));
        console.log(`setProgress: circleProgress=${percent}, previousCircleProgress=${previousCircleProgress}, hasIncrementedToday=${hasIncrementedToday}`);
    }

    function requestNotificationPermission() {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('Notification permission granted');
                    subscribeToPush();
                } else {
                    alert('Notifications are disabled. Please enable them in your browser settings to receive daily reminders.');
                    console.warn('Notification permission denied');
                }
            });
        } else if (Notification.permission === 'denied') {
            alert('Notifications are blocked. Please enable them in your browser settings to receive daily reminders.');
            console.warn('Notification permission denied');
        } else if (Notification.permission === 'granted') {
            subscribeToPush();
        }
    }

    async function registerServiceWorker() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered with scope:', registration.scope);
                requestNotificationPermission();
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        } else {
            console.warn('Service Workers or Push API not supported in this browser');
        }
    }

    async function subscribeToPush() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array('YOUR_PUBLIC_VAPID_KEY') // Replace with your VAPID public key
            });
            console.log('Push subscription created:', subscription);

            // Send subscription to backend
            await fetch('/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription, timezone: userTimezone })
            });
            console.log('Subscription sent to backend');

            // Update backend with current reminders
            updateBackendReminders();
        } catch (error) {
            console.error('Push subscription failed:', error);
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function updateBackendReminders() {
        const reminders = [
            ...habits.map((habit, index) => ({ type: 'habit', index, time: habit.reminder, name: habit.name })),
            ...tasks.map((task, index) => ({ type: 'task', index, time: task.reminder, name: task.name }))
        ].filter(reminder => reminder.time);
        try {
            await fetch('/update-reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reminders, timezone: userTimezone })
            });
            console.log('Reminders sent to backend:', reminders);
        } catch (error) {
            console.error('Failed to update reminders on backend:', error);
        }
    }

    // Display current date
    const currentDateElement = document.getElementById('current-date');
    function updateDateDisplay() {
        const date = DateTime.fromISO(currentDate, { zone: userTimezone });
        if (!date.isValid) {
            console.warn(`Invalid date detected: ${currentDate}, resetting to today`);
            currentDate = DateTime.now().setZone(userTimezone).toISODate();
            localStorage.setItem('currentDate', JSON.stringify(currentDate));
        }
        const formattedDate = date.toLocaleString(DateTime.DATE_FULL);
        currentDateElement.textContent = formattedDate;
        currentDateElement.setAttribute('aria-label', `Current date: ${formattedDate}`);
        console.log(`updateDateDisplay: Set date to ${formattedDate} (${currentDate})`);
    }

    // Habit Tracker
    const habitForm = document.getElementById('habit-form');
    const habitInput = document.getElementById('habit-input');
    const habitReminder = document.getElementById('habit-reminder');
    const habitList = document.getElementById('habit-list');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const resetChart = document.getElementById('reset-chart');
    const habitChartContainer = document.querySelector('.habit-tracker .chart-container');

    // Task Tracker
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskReminder = document.getElementById('task-reminder');
    const taskList = document.getElementById('task-list');
    const taskProgressFill = document.getElementById('task-progress-fill');
    const taskProgressText = document.getElementById('task-progress-text');
    const taskResetChart = document.getElementById('task-reset-chart');
    const taskChartContainer = document.querySelector('.task-tracker .chart-container');

    let habits = JSON.parse(localStorage.getItem('habits')) || [];
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    let history = JSON.parse(localStorage.getItem('habitHistory')) || {};
    let taskHistory = JSON.parse(localStorage.getItem('taskHistory')) || {};
    let chartOffset = JSON.parse(localStorage.getItem('chartOffset')) || 0;
    let taskChartOffset = JSON.parse(localStorage.getItem('taskChartOffset')) || 0;

    // Migrate old index-based history to date-based
    function migrateHistoryData(oldHistory, baseDate) {
        const newHistory = {};
        Object.keys(oldHistory).forEach(index => {
            const dayIndex = parseInt(index);
            if (!isNaN(dayIndex)) {
                const date = DateTime.fromJSDate(baseDate, { zone: userTimezone });
                const newDate = date.plus({ days: dayIndex });
                const dateStr = newDate.toISODate();
                newHistory[dateStr] = oldHistory[index];
            }
        });
        return newHistory;
    }

    // Check and migrate old data
    const baseDate = new Date('2025-01-01');
    if (Object.keys(history).some(key => !isNaN(parseInt(key)))) {
        history = migrateHistoryData(history, baseDate);
        localStorage.setItem('habitHistory', JSON.stringify(history));
    }
    if (Object.keys(taskHistory).some(key => !isNaN(parseInt(key)))) {
        taskHistory = migrateHistoryData(taskHistory, baseDate);
        localStorage.setItem('taskHistory', JSON.stringify(taskHistory));
    }

    // Check for new day and update if necessary
    function checkForNewDay() {
        const today = DateTime.now().setZone(userTimezone).toISODate();
        if (currentDate !== today) {
            console.log(`New day detected: ${currentDate} -> ${today}`);
            // Process previous day's completion
            const allHabitsCompleted = habits.length > 0 && habits.every(h => h.completed);
            const allTasksCompleted = tasks.length > 0 && tasks.every(t => t.completed);
            const hasItems = habits.length > 0 || tasks.length > 0;

            if (hasItems && (!allHabitsCompleted || !allTasksCompleted)) {
                // Decrease progress by 1%
                previousCircleProgress = circleProgress;
                circleProgress = Math.max(0, circleProgress - 1);
                setProgress(circleProgress);
                localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
                localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
                console.log(`Incomplete day, progress decreased by 1%: circleProgress=${circleProgress}, previousCircleProgress=${previousCircleProgress}`);
            }

            // Reset habits, tasks, and increment flag
            habits = habits.map(habit => ({ ...habit, completed: false }));
            tasks = tasks.map(t => ({ ...t, completed: false }));
            hasIncrementedToday = false;
            localStorage.setItem('habits', JSON.stringify(habits));
            localStorage.setItem('tasks', JSON.stringify(tasks));
            localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));

            // Update currentDate to today
            currentDate = today;
            localStorage.setItem('currentDate', JSON.stringify(currentDate));

            // Update UI
            updateDateDisplay();
            renderHabits();
            renderTasks();
            updateHabitChart();
            updateTaskChart();
        }
    }

    // Calculate chart labels for habits (weekly)
    function getChartLabels(offset) {
        const labels = [];
        const today = DateTime.now().setZone(userTimezone);
        const startDate = today.plus({ days: offset - today.weekday % 7 });
        for (let i = 0; i < 7; i++) {
            const date = startDate.plus({ days: i });
            const dateStr = date.toLocaleString(DateTime.DATE_SHORT);
            const weekday = date.weekdayLong;
            labels.push(`${weekday}\n${dateStr}`);
        }
        return labels;
    }

    // Get chart data for habits (weekly)
    function getChartData(historyData, offset) {
        const data = [];
        const today = DateTime.now().setZone(userTimezone);
        const startDate = today.plus({ days: offset - today.weekday % 7 });
        for (let i = 0; i < 7; i++) {
            const date = startDate.plus({ days: i });
            const dateStr = date.toISODate();
            data.push(historyData[dateStr] !== undefined ? historyData[dateStr] : 0);
        }
        return data;
    }

    // Get task chart data for current day only
    function getTaskChartData() {
        const today = DateTime.now().setZone(userTimezone).toISODate();
        const progress = taskHistory[today] !== undefined ? taskHistory[today] : 0;
        return [progress, 100 - progress];
    }

    // Get task chart labels for current day
    function getTaskChartLabels() {
        const today = DateTime.now().setZone(userTimezone);
        const dateStr = today.toLocaleString(DateTime.DATE_SHORT);
        const weekday = today.weekdayLong;
        return [`${weekday} ${dateStr}`, 'Remaining'];
    }

    // Update progress, history, and streak
    function updateProgress() {
        const completedHabits = habits.filter(h => h.completed).length;
        const habitProgress = habits.length ? (completedHabits / habits.length * 100) : 0;
        progressFill.style.width = `${habitProgress}%`;
        progressFill.style.backgroundColor = habitProgress === 100 ? '#4CAF50' : '#E57373';
        progressText.textContent = `Progress: ${habitProgress.toFixed(1)}%`;
        progressFill.parentElement.setAttribute('aria-valuenow', habitProgress.toFixed(1));
        history[currentDate] = habitProgress;
        localStorage.setItem('habitHistory', JSON.stringify(history));

        const completedTasks = tasks.filter(t => t.completed).length;
        const taskProgress = tasks.length ? (completedTasks / tasks.length * 100) : 0;
        taskProgressFill.style.width = `${taskProgress}%`;
        taskProgressFill.style.backgroundColor = taskProgress === 100 ? '#4CAF50' : '#E57373';
        taskProgressText.textContent = `Progress: ${taskProgress.toFixed(1)}%`;
        taskProgressFill.parentElement.setAttribute('aria-valuenow', taskProgress.toFixed(1));
        taskHistory[currentDate] = taskProgress;
        localStorage.setItem('taskHistory', JSON.stringify(taskHistory));

        const allHabitsCompleted = habits.length > 0 && habits.every(h => h.completed);
        const allTasksCompleted = tasks.length > 0 && tasks.every(t => t.completed);
        const hasItems = habits.length > 0 || tasks.length > 0;

        if (allHabitsCompleted && allTasksCompleted && hasItems && !hasIncrementedToday && circleProgress < 100) {
            previousCircleProgress = circleProgress;
            circleProgress = Math.min(100, circleProgress + 1);
            hasIncrementedToday = true;
            setProgress(circleProgress);
            localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
            localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
            localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));
            console.log(`All completed, incremented: circleProgress=${circleProgress}, previousCircleProgress=${previousCircleProgress}, hasIncrementedToday=${hasIncrementedToday}`);
        } else {
            console.log(`No increment: habits=${allHabitsCompleted}, tasks=${allTasksCompleted}, hasItems=${hasItems}, hasIncrementedToday=${hasIncrementedToday}`);
        }
        updateHabitChart();
        updateTaskChart();
    }

    // Habit Chart (Line)
    const habitCtx = document.getElementById('history-chart').getContext('2d');
    const historyChart = new Chart(habitCtx, {
        type: 'line',
        data: {
            labels: getChartLabels(chartOffset),
            datasets: [{
                label: 'Daily Completion %',
                data: getChartData(history, chartOffset),
                borderColor: history[currentDate] === 100 ? '#4CAF50' : '#E57373',
                backgroundColor: history[currentDate] === 100 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(229, 115, 115, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, max: 100 },
                x: {
                    ticks: {
                        callback: function(value, index, values) {
                            const [day, date] = this.getLabelForValue(index).split('\n');
                            return [day, date];
                        },
                        maxRotation: 0,
                        minRotation: 0,
                        font: { size: 10 }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#f4f4f9',
                        font: { size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value.toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    });

    // Task Chart (Donut - Current Day Only)
    const taskCtx = document.getElementById('task-history-chart').getContext('2d');
    const taskHistoryChart = new Chart(taskCtx, {
        type: 'doughnut',
        data: {
            labels: getTaskChartLabels(),
            datasets: [{
                label: 'Task Completion %',
                data: getTaskChartData(),
                backgroundColor: [getTaskChartData()[0] === 100 ? '#4CAF50' : '#E57373', 'transparent'],
                borderColor: ['#2c2c2c', 'transparent'],
                borderWidth: [2, 0]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: 10 },
                        color: '#f4f4f9',
                        padding: 15,
                        filter: item => item.text !== 'Remaining'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return label === 'Remaining' ? '' : `${label}: ${value.toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    });

    function updateHabitChart() {
        historyChart.data.labels = getChartLabels(chartOffset);
        historyChart.data.datasets[0].data = getChartData(history, chartOffset);
        historyChart.data.datasets[0].borderColor = history[currentDate] === 100 ? '#4CAF50' : '#E57373';
        historyChart.data.datasets[0].backgroundColor = history[currentDate] === 100 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(229, 115, 115, 0.2)';
        historyChart.update();
        resetChart.classList.toggle('hidden', chartOffset === 0);
    }

    function updateTaskChart() {
        taskHistoryChart.data.labels = getTaskChartLabels();
        taskHistoryChart.data.datasets[0].data = getTaskChartData();
        taskHistoryChart.data.datasets[0].backgroundColor = [getTaskChartData()[0] === 100 ? '#4CAF50' : '#E57373', 'transparent'];
        taskHistoryChart.data.datasets[0].borderColor = ['#2c2c2c', 'transparent'];
        taskHistoryChart.update();
        taskResetChart.classList.add('hidden');
    }

    function renderHabits() {
        habitList.innerHTML = '';
        habits.forEach((habit, index) => {
            const habitItem = document.createElement('div');
            habitItem.classList.add('habit-item');
            habitItem.setAttribute('role', 'listitem');
            habitItem.setAttribute('draggable', 'true');
            habitItem.setAttribute('data-index', index);
            habitItem.innerHTML = `
                <ion-icon name="reorder-two-outline" class="drag-handle" title="Drag to reorder ${habit.name}" aria-label="Drag to reorder ${habit.name}"></ion-icon>
                <input type="checkbox" id="habit-${index}" ${habit.completed ? 'checked' : ''} onchange="toggleHabit(${index})" aria-label="Mark ${habit.name} as completed">
                <span ondblclick="startEdit(${index}, 'habit')" aria-label="Double-click to edit ${habit.name}">${habit.name}${habit.reminder ? ' <ion-icon name="alarm-outline" title="Daily reminder set"></ion-icon>' : ''}</span>
                <input type="time" class="reminder-input" value="${habit.reminder || ''}" onchange="updateReminder(${index}, 'habit', this.value)" aria-label="Set daily reminder time for ${habit.name}">
                <div>
                    <button class="delete-btn" onclick="deleteHabit(${index})" aria-label="Delete ${habit.name}">Delete</button>
                </div>
            `;
            habitList.appendChild(habitItem);
        });

        const habitItems = habitList.querySelectorAll('.habit-item');
        habitItems.forEach(item => {
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
            const dragHandle = item.querySelector('.drag-handle');
            dragHandle.addEventListener('keydown', (e) => handleKeydown(e, 'habit', item.getAttribute('data-index')));
        });

        updateProgress();
        localStorage.setItem('habits', JSON.stringify(habits));
    }

    function renderTasks() {
        taskList.innerHTML = '';
        tasks.forEach((task, index) => {
            const taskItem = document.createElement('div');
            taskItem.classList.add('task-item');
            taskItem.setAttribute('role', 'listitem');
            taskItem.setAttribute('draggable', 'true');
            taskItem.setAttribute('data-index', index);
            taskItem.innerHTML = `
                <ion-icon name="reorder-two-outline" class="drag-handle" title="Drag to reorder ${task.name}" aria-label="Drag to reorder ${task.name}"></ion-icon>
                <input type="checkbox" id="task-${index}" ${task.completed ? 'checked' : ''} onchange="toggleTask(${index})" aria-label="Mark ${task.name} as completed">
                <span ondblclick="startEdit(${index}, 'task')" aria-label="Double-click to edit ${task.name}">${task.name}${task.reminder ? ' <ion-icon name="alarm-outline" title="Daily reminder set"></ion-icon>' : ''}</span>
                <input type="time" class="reminder-input" value="${task.reminder || ''}" onchange="updateReminder(${index}, 'task', this.value)" aria-label="Set daily reminder time for ${task.name}">
                <div>
                    <button class="delete-btn" onclick="deleteTask(${index})" aria-label="Delete ${task.name}">Delete</button>
                </div>
            `;
            taskList.appendChild(taskItem);
        });

        const taskItems = taskList.querySelectorAll('.task-item');
        taskItems.forEach(item => {
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
            const dragHandle = item.querySelector('.drag-handle');
            dragHandle.addEventListener('keydown', (e) => handleKeydown(e, 'task', item.getAttribute('data-index')));
        });

        updateProgress();
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    function startEdit(index, type) {
        const item = type === 'habit' ? habits[index] : tasks[index];
        const itemElement = document.querySelector(`#${type}-${index}`).parentElement;
        const span = itemElement.querySelector('span');
        const input = document.createElement('input');
        input.type = 'text';
        input.classList.add('edit-input');
        input.value = item.name;
        input.setAttribute('aria-label', `Edit ${type} name`);
        span.replaceWith(input);
        input.focus();
        input.select();

        input.addEventListener('blur', () => saveEdit(index, type, input));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveEdit(index, type, input);
            } else if (e.key === 'Escape') {
                cancelEdit(index, type, input);
            }
        });

        console.log(`Started editing ${type} at index ${index}: ${item.name}`);
    }

    function saveEdit(index, type, input) {
        const newName = input.value.trim();
        if (newName) {
            if (type === 'habit') {
                habits[index].name = newName;
                localStorage.setItem('habits', JSON.stringify(habits));
            } else {
                tasks[index].name = newName;
                localStorage.setItem('tasks', JSON.stringify(tasks));
            }
            updateBackendReminders();
            console.log(`Saved ${type} at index ${index}: ${newName}`);
        }
        type === 'habit' ? renderHabits() : renderTasks();
    }

    function cancelEdit(index, type, input) {
        type === 'habit' ? renderHabits() : renderTasks();
        console.log(`Canceled editing ${type} at index ${index}`);
    }

    function updateReminder(index, type, reminderTime) {
        if (type === 'habit') {
            habits[index].reminder = reminderTime || null;
            localStorage.setItem('habits', JSON.stringify(habits));
        } else {
            tasks[index].reminder = reminderTime || null;
            localStorage.setItem('tasks', JSON.stringify(tasks));
        }
        updateBackendReminders();
        console.log(`Updated reminder for ${type} at index ${index}: ${reminderTime || 'none'}`);
        type === 'habit' ? renderHabits() : renderTasks();
    }

    function moveHabitUp(index) {
        if (index > 0) {
            [habits[index], habits[index - 1]] = [habits[index - 1], habits[index]];
            localStorage.setItem('habits', JSON.stringify(habits));
            updateBackendReminders();
            renderHabits();
            console.log(`Habit moved up: index=${index}`);
        }
    }

    function moveHabitDown(index) {
        if (index < habits.length - 1) {
            [habits[index], habits[index + 1]] = [habits[index + 1], habits[index]];
            localStorage.setItem('habits', JSON.stringify(habits));
            updateBackendReminders();
            renderHabits();
            console.log(`Habit moved down: index=${index}`);
        }
    }

    function moveTaskUp(index) {
        if (index > 0) {
            [tasks[index], tasks[index - 1]] = [tasks[index - 1], tasks[index]];
            localStorage.setItem('tasks', JSON.stringify(tasks));
            updateBackendReminders();
            renderTasks();
            console.log(`Task moved up: index=${index}`);
        }
    }

    function moveTaskDown(index) {
        if (index < tasks.length - 1) {
            [tasks[index], tasks[index + 1]] = [tasks[index + 1], tasks[index]];
            localStorage.setItem('tasks', JSON.stringify(tasks));
            updateBackendReminders();
            renderTasks();
            console.log(`Task moved down: index=${index}`);
        }
    }

    function handleDragStart(e) {
        draggedItem = e.target;
        draggedItem.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedItem.getAttribute('data-index'));
        console.log(`Drag started: index=${draggedItem.getAttribute('data-index')}`);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleDrop(e) {
        e.preventDefault();
        const targetItem = e.target.closest('.habit-item, .task-item');
        if (!targetItem || targetItem === draggedItem) return;

        const fromIndex = parseInt(draggedItem.getAttribute('data-index'));
        const toIndex = parseInt(targetItem.getAttribute('data-index'));
        const isHabit = draggedItem.classList.contains('habit-item');

        if (isHabit) {
            [habits[fromIndex], habits[toIndex]] = [habits[toIndex], habits[fromIndex]];
            localStorage.setItem('habits', JSON.stringify(habits));
            updateBackendReminders();
            renderHabits();
            console.log(`Habit dragged from index ${fromIndex} to ${toIndex}`);
        } else {
            [tasks[fromIndex], tasks[toIndex]] = [tasks[toIndex], tasks[fromIndex]];
            localStorage.setItem('tasks', JSON.stringify(tasks));
            updateBackendReminders();
            renderTasks();
            console.log(`Task dragged from index ${fromIndex} to ${toIndex}`);
        }
    }

    function handleDragEnd(e) {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
    }

    function handleKeydown(e, type, index) {
        index = parseInt(index);
        if (e.key === 'ArrowUp' && index > 0) {
            e.preventDefault();
            if (type === 'habit') {
                moveHabitUp(index);
            } else {
                moveTaskUp(index);
            }
        } else if (e.key === 'ArrowDown' && index < (type === 'habit' ? habits.length - 1 : tasks.length - 1)) {
            e.preventDefault();
            if (type === 'habit') {
                moveHabitDown(index);
            } else {
                moveTaskDown(index);
            }
        }
    }

    function toggleHabit(index) {
        habits[index].completed = !habits[index].completed;
        if (!habits[index].completed) {
            previousCircleProgress = circleProgress;
            circleProgress = Math.max(0, circleProgress - 1);
            hasIncrementedToday = false;
            setProgress(circleProgress);
            localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
            localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
            localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));
            console.log(`Habit ${index} unchecked, progress decreased by 1%: circleProgress=${circleProgress}, previousCircleProgress=${previousCircleProgress}`);
        }
        renderHabits();
    }

    function toggleTask(index) {
        tasks[index].completed = !tasks[index].completed;
        if (!tasks[index].completed) {
            previousCircleProgress = circleProgress;
            circleProgress = Math.max(0, circleProgress - 1);
            hasIncrementedToday = false;
            setProgress(circleProgress);
            localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
            localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
            localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));
            console.log(`Task ${index} unchecked, progress decreased by 1%: circleProgress=${circleProgress}, previousCircleProgress=${previousCircleProgress}`);
        }
        renderTasks();
    }

    function deleteHabit(index) {
        habits.splice(index, 1);
        previousCircleProgress = circleProgress;
        circleProgress = Math.max(0, circleProgress - 1);
        hasIncrementedToday = false;
        setProgress(circleProgress);
        localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
        localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
        localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));
        console.log(`Habit ${index} deleted, progress decreased by 1%`);
        updateBackendReminders();
        renderHabits();
    }

    function deleteTask(index) {
        tasks.splice(index, 1);
        previousCircleProgress = circleProgress;
        circleProgress = Math.max(0, circleProgress - 1);
        hasIncrementedToday = false;
        setProgress(circleProgress);
        localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
        localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
        localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));
        console.log(`Task ${index} deleted, progress decreased by 1%`);
        updateBackendReminders();
        renderTasks();
    }

    habitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const habitName = habitInput.value.trim();
        const reminderTime = habitReminder.value;
        if (habitName) {
            habits.push({ name: habitName, completed: false, reminder: reminderTime || null });
            previousCircleProgress = circleProgress;
            circleProgress = Math.max(0, circleProgress - 1);
            hasIncrementedToday = false;
            setProgress(circleProgress);
            localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
            localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
            localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));
            console.log(`New habit added: ${habitName}, reminder: ${reminderTime || 'none'}, progress decreased by 1%`);
            habitInput.value = '';
            habitReminder.value = '';
            updateBackendReminders();
            renderHabits();
        }
    });

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const taskName = taskInput.value.trim();
        const reminderTime = taskReminder.value;
        if (taskName) {
            tasks.push({ name: taskName, completed: false, reminder: reminderTime || null });
            previousCircleProgress = circleProgress;
            circleProgress = Math.max(0, circleProgress - 1);
            hasIncrementedToday = false;
            setProgress(circleProgress);
            localStorage.setItem('circleProgress', JSON.stringify(circleProgress));
            localStorage.setItem('previousCircleProgress', JSON.stringify(previousCircleProgress));
            localStorage.setItem('hasIncrementedToday', JSON.stringify(hasIncrementedToday));
            console.log(`New task added: ${taskName}, reminder: ${reminderTime || 'none'}, progress decreased by 1%`);
            taskInput.value = '';
            taskReminder.value = '';
            updateBackendReminders();
            renderTasks();
        }
    });

    // Reset Charts (to current week for habits)
    resetChart.addEventListener('click', () => {
        chartOffset = 0;
        localStorage.setItem('chartOffset', JSON.stringify(chartOffset));
        updateHabitChart();
    });

    // Remove task chart reset button functionality as we only show current day
    taskResetChart.classList.add('hidden');

    // Swipe Gestures for Habit Chart
    let habitTouchStartX = 0;
    let habitTouchEndX = 0;

    habitChartContainer.addEventListener('touchstart', (e) => {
        habitTouchStartX = e.changedTouches[0].screenX;
    });

    habitChartContainer.addEventListener('touchend', (e) => {
        habitTouchEndX = e.changedTouches[0].screenX;
        const swipeDistance = habitTouchEndX - habitTouchStartX;
        const minSwipeDistance = 50;
        if (swipeDistance > minSwipeDistance) {
            chartOffset -= 7;
            localStorage.setItem('chartOffset', JSON.stringify(chartOffset));
            updateHabitChart();
        } else if (swipeDistance < -minSwipeDistance) {
            chartOffset += 7;
            localStorage.setItem('chartOffset', JSON.stringify(chartOffset));
            updateHabitChart();
        }
    });

    // Initial setup
    getUserTimezone();
    setProgress(circleProgress);
    renderHabits();
    renderTasks();
    updateHabitChart();
    updateTaskChart();
}

// Accessibility: Focus management
document.querySelectorAll('button:not(.progress-ring__circle, .circle-text), input:not(.progress-ring__circle, .circle-text), ion-icon.drag-handle, a.learn-more').forEach(el => {
    el.addEventListener('focus', () => {
        el.style.outline = '2px solid #4CAF50';
    });
    el.addEventListener('blur', () => {
        el.style.outline = 'none';
    });
});

// Navbar link active state handling
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.navbar-links ul li a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
        }
    });
}

// Set active link on page load
document.addEventListener('DOMContentLoaded', setActiveNavLink);

// Handle click events to update active state
document.querySelectorAll('.navbar-links ul li a').forEach(link => {
    link.addEventListener('click', (e) => {
        document.querySelectorAll('.navbar-links ul li a').forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');
    });
});

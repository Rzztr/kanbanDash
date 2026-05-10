// --- CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = 'https://kctmikwyvpsfxbsgubjs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xMvwrUSzwdIEnDM-6QT0aQ_M28enOlj';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- INICIALIZACIÓN ---
let currentUser = null;

document.addEventListener('DOMContentLoaded', checkLoginStatus);

function checkLoginStatus() {
    const loggedIn = sessionStorage.getItem('kanban_user');
    if (loggedIn) {
        currentUser = JSON.parse(loggedIn);
        showApp();
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
}

function showApp() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    fetchTasks();
}

function handleLogout() {
    sessionStorage.removeItem('kanban_user');
    currentUser = null;
    document.getElementById('login-password').value = '';
    showLogin();
}

// --- AUTHENTICATION ---
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleLogin(event) {
    event.preventDefault();

    // Aplicamos .trim() para limpiar espacios accidentales
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();
    const errorDiv = document.getElementById('login-error');

    errorDiv.style.display = 'none';

    try {
        // El navegador cifrará "R$tr" correctamente como 0058e5...
        const hashedPassword = await hashPassword(passwordInput);

        const { data: users, error } = await supabaseClient
            .from('users')
            .select('id, username, full_name')
            .eq('username', usernameInput)
            .eq('password_hash', hashedPassword)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                errorDiv.textContent = 'Usuario o contraseña incorrectos.';
            } else {
                throw error;
            }
            errorDiv.style.display = 'block';
            return;
        }

        if (users) {
            sessionStorage.setItem('kanban_user', JSON.stringify(users));
            showApp();
        }

    } catch (err) {
        console.error('Error detallado:', err);
        errorDiv.textContent = `Error: ${err.message || 'Error de conexión.'}`;
        errorDiv.style.display = 'block';
    }
}

// --- TABS & LOGS ---
function switchTab(tab) {
    const boardTab = document.getElementById('tab-board');
    const logsTab = document.getElementById('tab-logs');
    const kanbanBoard = document.querySelector('.kanban-board');
    const logsView = document.getElementById('logs-view');
    const addTaskBtn = document.querySelector('.add-task-btn');

    if (tab === 'board') {
        boardTab.classList.add('active');
        logsTab.classList.remove('active');
        kanbanBoard.style.display = 'flex';
        logsView.style.display = 'none';
        addTaskBtn.style.display = 'inline-block';
    } else {
        boardTab.classList.remove('active');
        logsTab.classList.add('active');
        kanbanBoard.style.display = 'none';
        logsView.style.display = 'block';
        addTaskBtn.style.display = 'none';
        fetchLogs();
    }
}

async function logActivity(action, taskTitle, details) {
    const user = currentUser ? (currentUser.full_name || currentUser.username) : 'Sistema';
    const { error } = await supabaseClient
        .from('activity_logs')
        .insert([{
            username: user,
            action: action,
            task_title: taskTitle,
            details: details
        }]);
    
    if (error) console.error('Error guardando log:', error);
}

async function fetchLogs() {
    const { data: logs, error } = await supabaseClient
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = '';

    logs.forEach(log => {
        const tr = document.createElement('tr');
        const date = new Date(log.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
        const actionClass = log.action.toLowerCase();
        
        tr.innerHTML = `
            <td>${date}</td>
            <td>${log.username}</td>
            <td><span class="log-action ${actionClass}">${log.action}</span></td>
            <td>${log.task_title || '-'}</td>
            <td>${log.details || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

const priorityLabels = {
    'high': 'Alta',
    'medium': 'Media',
    'low': 'Baja'
};

// Cargar tareas desde Supabase
async function fetchTasks() {
    const { data: tasks, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    // Limpiar contenedores
    document.querySelectorAll('.tasks-container').forEach(c => c.innerHTML = '');

    tasks.forEach(task => {
        renderTask(task);
    });
}

// Dibujar una tarea en el DOM
function renderTask(task) {
    const taskDiv = document.createElement('div');
    taskDiv.className = 'task-card';
    taskDiv.draggable = true;
    taskDiv.id = task.id; // UUID de Supabase
    taskDiv.ondragstart = drag;

    taskDiv.innerHTML = `
        <div class="task-header">
            <h3>${task.title}</h3>
            <button class="delete-btn" onclick="deleteTask('${task.id}')" title="Eliminar tarea">&times;</button>
        </div>
        <p>${task.description || ''}</p>
        <span class="tag tag-${task.priority}">${priorityLabels[task.priority]}</span>
        <div class="assignee-area">
            <span class="assignee-name">${task.assignee ? 'Asignado a: ' + task.assignee : 'Sin asignar'}</span>
            <button class="assign-btn" onclick="assignTask('${task.id}')">Asignar</button>
        </div>
    `;

    // Añadir a la columna correspondiente según el estado
    const column = document.querySelector(`#${task.status} .tasks-container`);
    if (column) {
        column.appendChild(taskDiv);
    }
}

// --- DRAG AND DROP ---
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.target.id);
}

async function drop(ev) {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("text");
    const draggedElement = document.getElementById(taskId);

    let target = ev.target;
    while (target && !target.classList.contains('column')) {
        target = target.parentElement;
    }

    if (target) {
        const container = target.querySelector('.tasks-container');
        container.appendChild(draggedElement);

        // Actualizar el estado (status) en Supabase
        const newStatus = target.id;
        const { error } = await supabaseClient
            .from('tasks')
            .update({ status: newStatus })
            .eq('id', taskId);

        if (error) {
            console.error('Error updating status:', error);
        } else {
            const taskTitle = draggedElement.querySelector('h3').textContent;
            const columnTitle = target.querySelector('.column-title').textContent;
            logActivity('MOVIDO', taskTitle, `Movió la tarea a '${columnTitle}'`);
        }
    }
}

// --- CREAR NUEVA TAREA ---
function openNewTaskModal() {
    document.getElementById('task-modal').style.display = 'block';
}

function closeNewTaskModal() {
    document.getElementById('task-modal').style.display = 'none';
}

async function createNewTask() {
    const title = document.getElementById('new-task-title').value;
    const desc = document.getElementById('new-task-desc').value;
    const priority = document.getElementById('new-task-priority').value;

    if (!title) {
        alert("El título de la tarea es obligatorio");
        return;
    }

    const { data, error } = await supabaseClient
        .from('tasks')
        .insert([
            { title: title, description: desc, priority: priority, status: 'planeado' }
        ])
        .select();

    if (error) {
        console.error('Error creating task:', error);
        alert('Hubo un error al crear la tarea en Supabase.');
        return;
    }

    if (data && data.length > 0) {
        renderTask(data[0]);
        logActivity('CREADO', title, 'Nueva tarea planeada');
    }

    // Limpiar y cerrar modal
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-desc').value = '';
    document.getElementById('new-task-priority').value = 'high';
    closeNewTaskModal();
}

window.onclick = function (event) {
    const modal = document.getElementById('task-modal');
    if (event.target == modal) {
        closeNewTaskModal();
    }
}

// --- ASIGNAR TAREA ---
async function assignTask(taskId) {
    const taskElement = document.getElementById(taskId);
    if (!taskElement) return;

    const newAssignee = prompt("Introduce el nombre de la persona asignada:");
    if (newAssignee && newAssignee.trim() !== "") {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ assignee: newAssignee.trim() })
            .eq('id', taskId);

        if (error) {
            console.error('Error assigning task:', error);
            alert('Error al asignar en Supabase.');
            return;
        }

        const assigneeSpan = taskElement.querySelector('.assignee-name');
        if (assigneeSpan) {
            assigneeSpan.textContent = "Asignado a: " + newAssignee.trim();
        }
        
        const taskTitle = taskElement.querySelector('h3').textContent;
        logActivity('ASIGNADO', taskTitle, `Asignada a ${newAssignee.trim()}`);
    }
}

// --- ELIMINAR TAREA ---
async function deleteTask(taskId) {
    if (!confirm("¿Estás seguro de que deseas eliminar esta tarea?")) return;

    const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', taskId);

    if (error) {
        console.error('Error deleting task:', error);
        alert('Error al eliminar la tarea en Supabase.');
        return;
    }

    const taskElement = document.getElementById(taskId);
    if (taskElement) {
        const taskTitle = taskElement.querySelector('h3').textContent;
        logActivity('ELIMINADO', taskTitle, 'Tarea eliminada');
        taskElement.remove();
    }
}
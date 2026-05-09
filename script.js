// --- CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = 'https://kctmikwyvpsfxbsgubjs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xMvwrUSzwdIEnDM-6QT0aQ_M28enOlj';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', fetchTasks);

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
        taskElement.remove();
    }
}
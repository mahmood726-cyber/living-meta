/**
 * Project List Component
 * Displays all projects and handles project management
 */

import { store, actions } from '../../store.js';
import { db } from '../../db/schema.js';
import { router } from '../../router.js';
import { showToast, formatRelativeTime, downloadJSON } from '../../lib/utils.js';

/**
 * Initialize the projects page
 */
export async function initProjectsPage() {
  const container = document.getElementById('projects-list');
  const createBtn = document.getElementById('create-project-btn');

  if (!container) return;

  // Load projects
  await loadProjects(container);

  // Setup create button
  createBtn?.addEventListener('click', () => {
    showCreateProjectModal();
  });

  // Subscribe to store updates
  store.subscribe((state, action) => {
    if (action.type === 'ADD_PROJECT' || action.type === 'DELETE_PROJECT' || action.type === 'UPDATE_PROJECT') {
      renderProjects(container, state.projects);
    }
  });
}

/**
 * Load projects from database
 */
async function loadProjects(container) {
  try {
    const projects = await db.projects.toArray();
    store.dispatch(actions.setProjects(projects));
    renderProjects(container, projects);
  } catch (err) {
    console.error('Failed to load projects:', err);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-danger-500">Failed to load projects: ${err.message}</p>
        <button onclick="location.reload()" class="btn-secondary mt-4">Retry</button>
      </div>
    `;
  }
}

/**
 * Render projects list
 */
function renderProjects(container, projects) {
  if (!projects.length) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-1">No projects yet</h3>
        <p class="text-gray-500 mb-4">Create your first living meta-analysis project to get started.</p>
        <button id="empty-create-btn" class="btn-primary">
          Create Project
        </button>
      </div>
    `;

    document.getElementById('empty-create-btn')?.addEventListener('click', showCreateProjectModal);
    return;
  }

  // Sort by updated date
  const sorted = [...projects].sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  container.innerHTML = sorted.map(project => `
    <div class="card hover:shadow-md transition-shadow cursor-pointer project-card" data-project-id="${project.id}">
      <div class="flex justify-between items-start mb-3">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-900 truncate">${escapeHtml(project.name)}</h3>
          <p class="text-sm text-gray-500 mt-1 line-clamp-2">${escapeHtml(project.description || 'No description')}</p>
        </div>
        <div class="flex items-center space-x-2 ml-4">
          ${project.living ? `
            <span class="badge-success" title="Living mode enabled">
              <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
              Living
            </span>
          ` : ''}
          <button class="text-gray-400 hover:text-gray-600 project-menu-btn" data-project-id="${project.id}">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between text-sm text-gray-500 pt-3 border-t border-gray-100">
        <div class="flex items-center space-x-4">
          ${project.lastSearchRunId ? `
            <span title="Trials found">
              <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              ${project.trialCount || 0} trials
            </span>
          ` : `
            <span class="text-gray-400">No search yet</span>
          `}
        </div>
        <span title="Last updated">${formatRelativeTime(project.updatedAt)}</span>
      </div>
    </div>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.project-menu-btn')) return;
      const projectId = card.dataset.projectId;
      if (projectId) {
        router.navigate(`/project/${projectId}/search`);
      }
    });
  });

  // Add menu handlers
  container.querySelectorAll('.project-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showProjectMenu(btn, btn.dataset.projectId);
    });
  });
}

/**
 * Show create project modal
 */
function showCreateProjectModal() {
  store.dispatch(actions.showModal({
    title: 'Create New Project',
    content: `
      <form id="create-project-form" class="space-y-4">
        <div>
          <label class="label" for="project-name">Project Name *</label>
          <input type="text" id="project-name" name="name" class="input" required
            placeholder="e.g., Diabetes Treatment Meta-Analysis">
        </div>
        <div>
          <label class="label" for="project-description">Description</label>
          <textarea id="project-description" name="description" class="input" rows="3"
            placeholder="Brief description of your research question..."></textarea>
        </div>
        <div class="flex items-center">
          <input type="checkbox" id="project-living" name="living" class="h-4 w-4 text-primary-600 rounded border-gray-300">
          <label for="project-living" class="ml-2 text-sm text-gray-700">
            Enable Living Mode
            <span class="text-gray-500">(auto-update on open)</span>
          </label>
        </div>
        <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" class="btn-primary">Create Project</button>
        </div>
      </form>
    `,
    onMount: () => {
      const form = document.getElementById('create-project-form');
      form?.addEventListener('submit', handleCreateProject);
      document.getElementById('project-name')?.focus();
    }
  }));
}

/**
 * Handle project creation
 */
async function handleCreateProject(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  const name = formData.get('name')?.trim();
  if (!name) {
    showToast({ type: 'error', message: 'Project name is required' });
    return;
  }

  const project = {
    id: crypto.randomUUID(),
    name,
    description: formData.get('description')?.trim() || '',
    living: formData.get('living') === 'on',
    query: null,
    lastSearchRunId: null,
    trialCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await db.projects.add(project);
    store.dispatch(actions.addProject(project));
    store.dispatch(actions.hideModal());
    showToast({ type: 'success', message: 'Project created' });
    router.navigate(`/project/${project.id}/search`);
  } catch (err) {
    console.error('Failed to create project:', err);
    showToast({ type: 'error', message: 'Failed to create project' });
  }
}

/**
 * Show project context menu
 */
function showProjectMenu(btn, projectId) {
  // Remove any existing menus
  document.querySelectorAll('.project-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'project-menu absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50';
  menu.innerHTML = `
    <button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-action="open">
      <svg class="w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      Open
    </button>
    <button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-action="edit">
      <svg class="w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
      Edit
    </button>
    <button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-action="export">
      <svg class="w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      Export
    </button>
    <button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-action="duplicate">
      <svg class="w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      Duplicate
    </button>
    <hr class="my-1 border-gray-200">
    <button class="w-full text-left px-4 py-2 text-sm text-danger-600 hover:bg-danger-50" data-action="delete">
      <svg class="w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
      Delete
    </button>
  `;

  // Position menu
  btn.style.position = 'relative';
  btn.appendChild(menu);

  // Handle actions
  menu.querySelectorAll('button').forEach(actionBtn => {
    actionBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      menu.remove();

      switch (action) {
        case 'open':
          router.navigate(`/project/${projectId}/search`);
          break;
        case 'edit':
          showEditProjectModal(projectId);
          break;
        case 'export':
          await exportProject(projectId);
          break;
        case 'duplicate':
          await duplicateProject(projectId);
          break;
        case 'delete':
          showDeleteConfirmation(projectId);
          break;
      }
    });
  });

  // Close on click outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

/**
 * Show edit project modal
 */
async function showEditProjectModal(projectId) {
  const project = await db.projects.get(projectId);
  if (!project) {
    showToast({ type: 'error', message: 'Project not found' });
    return;
  }

  store.dispatch(actions.showModal({
    title: 'Edit Project',
    content: `
      <form id="edit-project-form" class="space-y-4">
        <input type="hidden" name="id" value="${project.id}">
        <div>
          <label class="label" for="edit-project-name">Project Name *</label>
          <input type="text" id="edit-project-name" name="name" class="input" required
            value="${escapeHtml(project.name)}">
        </div>
        <div>
          <label class="label" for="edit-project-description">Description</label>
          <textarea id="edit-project-description" name="description" class="input" rows="3">${escapeHtml(project.description || '')}</textarea>
        </div>
        <div class="flex items-center">
          <input type="checkbox" id="edit-project-living" name="living"
            class="h-4 w-4 text-primary-600 rounded border-gray-300"
            ${project.living ? 'checked' : ''}>
          <label for="edit-project-living" class="ml-2 text-sm text-gray-700">
            Enable Living Mode
          </label>
        </div>
        <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
          <button type="submit" class="btn-primary">Save Changes</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('edit-project-form')?.addEventListener('submit', handleEditProject);
    }
  }));
}

/**
 * Handle project edit
 */
async function handleEditProject(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  const id = formData.get('id');
  const updates = {
    id,
    name: formData.get('name')?.trim(),
    description: formData.get('description')?.trim() || '',
    living: formData.get('living') === 'on',
    updatedAt: new Date().toISOString()
  };

  try {
    const existing = await db.projects.get(id);
    await db.projects.put({ ...existing, ...updates });
    store.dispatch(actions.updateProject(updates));
    store.dispatch(actions.hideModal());
    showToast({ type: 'success', message: 'Project updated' });
  } catch (err) {
    console.error('Failed to update project:', err);
    showToast({ type: 'error', message: 'Failed to update project' });
  }
}

/**
 * Export project
 */
async function exportProject(projectId) {
  try {
    const { exportProjectBundle } = await import('../../db/schema.js');
    const bundle = await exportProjectBundle(projectId);

    const project = await db.projects.get(projectId);
    const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}_export_${new Date().toISOString().split('T')[0]}.json`;

    downloadJSON(bundle, filename);
    showToast({ type: 'success', message: 'Project exported' });
  } catch (err) {
    console.error('Export failed:', err);
    showToast({ type: 'error', message: 'Failed to export project' });
  }
}

/**
 * Duplicate project
 */
async function duplicateProject(projectId) {
  try {
    const project = await db.projects.get(projectId);
    if (!project) throw new Error('Project not found');

    const newProject = {
      ...project,
      id: crypto.randomUUID(),
      name: `${project.name} (Copy)`,
      lastSearchRunId: null,
      trialCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.projects.add(newProject);
    store.dispatch(actions.addProject(newProject));
    showToast({ type: 'success', message: 'Project duplicated' });
  } catch (err) {
    console.error('Duplicate failed:', err);
    showToast({ type: 'error', message: 'Failed to duplicate project' });
  }
}

/**
 * Show delete confirmation
 */
function showDeleteConfirmation(projectId) {
  store.dispatch(actions.showModal({
    title: 'Delete Project',
    content: `
      <p class="text-gray-600 mb-4">
        Are you sure you want to delete this project? This will permanently remove all associated data including:
      </p>
      <ul class="list-disc list-inside text-gray-600 mb-6 space-y-1">
        <li>Search history and snapshots</li>
        <li>Screening decisions</li>
        <li>Extraction data</li>
        <li>Analysis results</li>
      </ul>
      <p class="text-danger-600 font-medium mb-4">This action cannot be undone.</p>
      <div class="flex justify-end space-x-3">
        <button type="button" class="btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button type="button" class="btn-danger" id="confirm-delete-btn">Delete Project</button>
      </div>
    `,
    onMount: () => {
      document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
        await deleteProject(projectId);
        store.dispatch(actions.hideModal());
      });
    }
  }));
}

/**
 * Delete project and all related data
 */
async function deleteProject(projectId) {
  try {
    // Delete related data first
    const screening = await db.screening.where('projectId', projectId);
    await db.screening.bulkDelete(screening.map(s => [s.projectId, s.nctId]));

    const extraction = await db.extraction.where('projectId', projectId);
    await db.extraction.bulkDelete(extraction.map(e => [e.projectId, e.nctId, e.outcomeId]));

    const searchRuns = await db.searchRuns.where('projectId', projectId);
    await db.searchRuns.bulkDelete(searchRuns.map(r => r.id));

    const analysisSpecs = await db.analysisSpecs.where('projectId', projectId);
    await db.analysisSpecs.bulkDelete(analysisSpecs.map(s => s.id));

    const analysisResults = await db.analysisResults.where('projectId', projectId);
    await db.analysisResults.bulkDelete(analysisResults.map(r => r.id));

    const eimFlags = await db.eimTrialFlags.where('projectId', projectId);
    await db.eimTrialFlags.bulkDelete(eimFlags.map(f => [f.projectId, f.nctId]));

    const eimMeta = await db.eimMeta.where('projectId', projectId);
    await db.eimMeta.bulkDelete(eimMeta.map(m => [m.projectId, m.runId]));

    // Delete project
    await db.projects.delete(projectId);
    store.dispatch(actions.deleteProject(projectId));

    showToast({ type: 'success', message: 'Project deleted' });
  } catch (err) {
    console.error('Delete failed:', err);
    showToast({ type: 'error', message: 'Failed to delete project' });
  }
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export default {
  initProjectsPage,
  showCreateProjectModal
};

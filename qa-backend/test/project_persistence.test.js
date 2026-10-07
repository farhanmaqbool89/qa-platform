const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectService = require('../services/project.service');

const PROJECTS_FILE = path.join(__dirname, '../data/projects.json');

function cleanup() {
  if (fs.existsSync(PROJECTS_FILE)) {
    fs.unlinkSync(PROJECTS_FILE);
  }
}

async function run() {
  console.log('=== STARTING PROJECT PERSISTENCE UNIT TESTS ===');
  
  // 1. Initial State Check
  cleanup();
  projectService.ensureProjectsFile();
  
  const projects = projectService.listProjects();
  assert.strictEqual(projects.length, 3, 'Initial project list must contain exactly 3 seeded default projects');
  assert.strictEqual(projects[0].name, 'Customer Portal', 'First project mismatch');
  console.log('✅ Default projects successfully seeded.');

  // 2. Add Project
  const newProject = {
    name: 'Integrations Panel',
    baseUrl: 'http://localhost:8080',
    browser: 'Chrome',
    username: 'integrator_admin',
    password: 'secret_password'
  };
  const added = projectService.addProject(newProject);
  assert.ok(added.id, 'Project ID must be generated');
  assert.strictEqual(added.name, 'Integrations Panel', 'Added project name mismatch');
  
  const updatedList = projectService.listProjects();
  assert.strictEqual(updatedList.length, 4, 'Total projects must be 4 after addition');
  console.log('✅ New project added successfully.');

  // 3. Update Project
  const updatedDetails = {
    name: 'Integrations Panel Updated',
    baseUrl: 'http://localhost:9090'
  };
  const updated = projectService.updateProject(added.id, updatedDetails);
  assert.strictEqual(updated.name, 'Integrations Panel Updated', 'Updated project name mismatch');
  
  const checkUpdated = projectService.listProjects().find(p => p.id === added.id);
  assert.strictEqual(checkUpdated.baseUrl, 'http://localhost:9090', 'Updated project url mismatch');
  console.log('✅ Project updated successfully.');

  // 4. Persistence Reload Check
  // Simulate backend restart by deleting require cache and re-requiring service
  delete require.cache[require.resolve('../services/project.service')];
  const reloadedService = require('../services/project.service');
  const reloadedList = reloadedService.listProjects();
  assert.strictEqual(reloadedList.length, 4, 'List size must survive service reload');
  assert.ok(reloadedList.find(p => p.name === 'Integrations Panel Updated'), 'Updated project must exist after reload');
  console.log('✅ Persistence across backend restart verified.');

  // 5. Delete Project
  const targetId = added.id;
  const deleted = reloadedService.deleteProject(targetId);
  assert.strictEqual(deleted, true, 'Delete operation must return true');
  
  const finalList = reloadedService.listProjects();
  assert.strictEqual(finalList.length, 3, 'List size must return to 3 after deletion');
  assert.strictEqual(finalList.find(p => p.id === targetId), undefined, 'Deleted project must not be present');
  console.log('✅ Project deleted successfully.');

  console.log('=== ALL PROJECT PERSISTENCE UNIT TESTS PASSED ===');
}

run().catch(err => {
  console.error('❌ Project persistence unit tests failed:', err.stack);
  process.exit(1);
});

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const featureService = require('../services/feature.service');

const FEATURES_DIR = path.join(__dirname, '../features');
const FEATURES_METADATA_FILE = path.join(__dirname, '../data/features.json');

function cleanup() {
  const metaFile = FEATURES_METADATA_FILE;
  if (fs.existsSync(metaFile)) {
    fs.unlinkSync(metaFile);
  }
  const testFile = path.join(FEATURES_DIR, 'test_persistence_temp.feature');
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
}

async function run() {
  console.log('=== STARTING FEATURE PERSISTENCE UNIT TESTS ===');
  
  cleanup();
  featureService.ensureDirectories();

  // 1. Save Feature
  const draft = {
    projectId: 123,
    name: 'test_persistence_temp.feature',
    content: 'Feature: Temp persistence test\n  Scenario: Test run'
  };
  const saved = featureService.saveFeature(draft);
  assert.ok(saved.id, 'Saved feature must receive an ID');
  assert.strictEqual(saved.projectId, 123, 'Project ID mismatch');
  assert.strictEqual(saved.name, 'test_persistence_temp.feature', 'Feature name mismatch');
  
  // Verify file written to disk
  const filePath = path.join(FEATURES_DIR, 'test_persistence_temp.feature');
  assert.ok(fs.existsSync(filePath), 'Feature file must be written to features/ directory');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  assert.strictEqual(fileContent, draft.content, 'Feature file content mismatch');
  console.log('✅ Feature successfully saved and written to disk.');

  // 2. List Features
  const list = featureService.listFeatures();
  const entry = list.find(f => f.id === saved.id);
  assert.ok(entry, 'Saved feature must be returned in the features list');
  assert.strictEqual(entry.projectId, 123, 'Listed project ID mismatch');
  assert.strictEqual(entry.content, draft.content, 'Listed feature content mismatch');
  console.log('✅ Feature returned correctly in list features API.');

  // 3. Reload Persistence Check (Backend Restart simulation)
  delete require.cache[require.resolve('../services/feature.service')];
  const reloadedService = require('../services/feature.service');
  const reloadedList = reloadedService.listFeatures();
  const reloadedEntry = reloadedList.find(f => f.name === 'test_persistence_temp.feature');
  assert.ok(reloadedEntry, 'Feature must exist in metadata list after reload');
  assert.strictEqual(reloadedEntry.content, draft.content, 'Content must survive service reload');
  console.log('✅ Feature persistence verified after backend service restart.');

  // 4. Delete Feature
  const deleted = reloadedService.deleteFeature(saved.id);
  assert.strictEqual(deleted, true, 'Delete operation must return true');
  assert.strictEqual(fs.existsSync(filePath), false, 'Feature file must be unlinked/deleted from disk');
  
  const finalList = reloadedService.listFeatures();
  assert.strictEqual(finalList.some(f => f.id === saved.id), false, 'Deleted feature must not exist in list');
  console.log('✅ Feature and file successfully deleted.');

  cleanup();
  console.log('=== ALL FEATURE PERSISTENCE UNIT TESTS PASSED ===');
}

run().catch(err => {
  console.error('❌ Feature persistence unit tests failed:', err.stack);
  process.exit(1);
});

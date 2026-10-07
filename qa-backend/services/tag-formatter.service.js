/**
 * Tag Formatter Service
 * Sanitizes and normalizes tag expressions for Cucumber-JS (v10+ / tag-expressions parser).
 */

function formatCucumberTags(tagsInput) {
  if (!tagsInput) return '';

  let raw = '';
  if (Array.isArray(tagsInput)) {
    raw = tagsInput.map(t => String(t).trim()).filter(Boolean).join(' ');
  } else if (typeof tagsInput === 'string') {
    raw = tagsInput.trim();
  }

  if (!raw) return '';

  // If input already contains boolean operators, preserve exact expression
  if (/\b(and|or|not)\b/i.test(raw) || /&&|\|\||!/.test(raw)) {
    return raw;
  }

  // Split tags by whitespace or commas
  const tags = raw.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
  if (tags.length === 0) return '';
  if (tags.length === 1) return tags[0];

  // Multiple selected tags default to 'or' semantics
  return tags.join(' or ');
}

module.exports = {
  formatCucumberTags
};

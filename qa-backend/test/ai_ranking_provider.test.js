const assert = require('assert');
const http = require('http');
const aiRankingService = require('../services/ai/locator-healing/ai-ranking.service');

console.log('=== STARTING PROVIDER-INDEPENDENT AI SERVICE TESTS ===\n');

let server;
let port;
let responseHandler = () => {};

// Start local HTTP server to stub real LLM responses
before(async () => {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      responseHandler(req, res);
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });
});

after(() => {
  if (server) {
    server.close();
  }
});

function before(fn) { fn().then(() => {}); }
function after(fn) { setTimeout(fn, 1000); }

async function runTests() {
  // Test 1: Valid Gemini response
  aiRankingService.providerType = 'GEMINI';
  aiRankingService.apiKey = 'test-gemini-key';
  aiRankingService.apiUrl = `http://127.0.0.1:${port}/v1beta/models/gemini-1.5-flash:generateContent?key=test-gemini-key`;

  responseHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              rankedCandidates: [
                { candidateId: 'c1', rank: 1, reasonCodes: ['ROLE_MATCH'] }
              ],
              confidence: 0.95,
              uncertainty: 'LOW',
              explanation: 'Valid match'
            })
          }]
        }
      }]
    }));
  };

  try {
    const raw = await aiRankingService.callModel('System', 'User');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.rankedCandidates[0].candidateId, 'c1');
    console.log('âœ… Test 1: Valid Gemini response parser passed.');
  } catch (err) {
    console.error('âŒ Test 1 failed:', err.message);
  }

  // Test 2: Valid OpenAI response
  aiRankingService.providerType = 'OPENAI';
  aiRankingService.apiKey = 'test-openai-key';
  aiRankingService.apiUrl = `http://127.0.0.1:${port}/v1/chat/completions`;

  responseHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            rankedCandidates: [
              { candidateId: 'c1', rank: 1, reasonCodes: ['TEXT_SIMILARITY'] }
            ],
            confidence: 0.88,
            uncertainty: 'LOW',
            explanation: 'Valid match'
          })
        }
      }]
    }));
  };

  try {
    const raw = await aiRankingService.callModel('System', 'User');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.rankedCandidates[0].candidateId, 'c1');
    console.log('âœ… Test 2: Valid OpenAI response parser passed.');
  } catch (err) {
    console.error('âŒ Test 2 failed:', err.message);
  }

  // Test 3: Malformed JSON Response
  responseHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('invalid-json-body-here');
  };

  try {
    await aiRankingService.callModel('System', 'User');
    console.error('âŒ Test 3 failed: Expected error on malformed JSON');
  } catch (err) {
    assert(err.message.includes('Failed to parse') || err.message.includes('Unexpected token'));
    console.log('âœ… Test 3: Malformed response handling passed.');
  }

  // Test 4: HTTP 429 Rate Limit
  responseHandler = (req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Quota exceeded' }));
  };

  try {
    await aiRankingService.callModel('System', 'User');
    console.error('âŒ Test 4 failed: Expected error on HTTP 429');
  } catch (err) {
    assert(err.message.includes('LLM API returned status code 429'));
    console.log('âœ… Test 4: Rate limit (HTTP 429) handling passed.');
  }

  // Test 5: HTTP 503 Provider Unavailable
  responseHandler = (req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service Unavailable' }));
  };

  try {
    await aiRankingService.callModel('System', 'User');
    console.error('âŒ Test 5 failed: Expected error on HTTP 503');
  } catch (err) {
    assert(err.message.includes('LLM API returned status code 503'));
    console.log('âœ… Test 5: Provider unavailable (HTTP 503) handling passed.');
  }

  // Test 6: Network Timeout (2s limit)
  responseHandler = (req, res) => {
    // Deliberately do not respond, trigger timeout
    setTimeout(() => {
      res.writeHead(200);
      res.end('done');
    }, 3000);
  };

  try {
    await aiRankingService.callModel('System', 'User');
    console.error('âŒ Test 6 failed: Expected error on timeout');
  } catch (err) {
    assert(err.message.includes('timeout') || err.message.includes('timed out'));
    console.log('âœ… Test 6: Request timeout handling passed.');
  }

  // Restore env/default configs
  aiRankingService.providerType = 'MOCK';
  aiRankingService.apiKey = '';
  aiRankingService.apiUrl = '';

  console.log('\n=== ALL PROVIDER-INDEPENDENT AI TESTS COMPLETE ===');
}

// Delay execution slightly to ensure server starts
setTimeout(runTests, 100);

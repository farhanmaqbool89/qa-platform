const https = require('https');
const http = require('http');
const { URL } = require('url');

class AiRankingService {
  constructor() {
    this.providerType = process.env.AI_PROVIDER_TYPE || 'MOCK';
    this.apiKey = process.env.AI_API_KEY || '';
    this.modelName = process.env.AI_MODEL_NAME || 'gemini-1.5-flash';
    this.apiUrl = process.env.AI_API_URL || '';
  }

  async callModel(systemPrompt, userPrompt) {
    if (this.providerType === 'MOCK' || !this.apiKey) {
      return this.simulateResponse(userPrompt);
    }

    return new Promise((resolve, reject) => {
      let urlObj;
      try {
        urlObj = new URL(this.apiUrl || 'https://generativelanguage.googleapis.com/v1beta/models/' + this.modelName + ':generateContent?key=' + this.apiKey);
      } catch (err) {
        return reject(new Error(`Invalid LLM API URL: ${err.message}`));
      }

      const postData = this.formatPayload(systemPrompt, userPrompt);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        method: 'POST',
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 2000 // Strict 2-second timeout
      };

      if (this.providerType === 'OPENAI') {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const req = client.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`LLM API returned status code ${res.statusCode}: ${responseBody}`));
          }
          try {
            const parsed = JSON.parse(responseBody);
            const textResponse = this.extractResponseText(parsed);
            resolve(textResponse);
          } catch (err) {
            reject(new Error(`Failed to parse API response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Network error calling LLM API: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('LLM API request timed out (2000ms limit reached)'));
      });

      req.write(postData);
      req.end();
    });
  }

  formatPayload(systemPrompt, userPrompt) {
    if (this.providerType === 'OPENAI') {
      return JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
    }

    // Default to Google Gemini format
    return JSON.stringify({
      contents: [{
        parts: [
          { text: systemPrompt + '\n\n' + userPrompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });
  }

  extractResponseText(apiResponse) {
    if (this.providerType === 'OPENAI') {
      return apiResponse.choices[0].message.content;
    }
    // Gemini response extraction
    return apiResponse.candidates[0].content.parts[0].text;
  }

  simulateResponse(userPrompt) {
    // 0. Support mock schema attacks for safety testing
    const attack = process.env.TEST_MOCK_ATTACK;
    if (attack === 'INVENT_ID') {
      return JSON.stringify({
        rankedCandidates: [{ candidateId: 'candidate-X', rank: 1, reasonCodes: [] }],
        confidence: 0.90,
        uncertainty: 'LOW',
        explanation: 'Simulated invented ID attack'
      });
    }
    if (attack === 'MALFORMED_JSON') {
      return '{ "rankedCandidates": [ { "candidateId": "c1" } // malformed';
    }
    if (attack === 'INJECT_SELECTOR') {
      return JSON.stringify({
        rankedCandidates: [{ candidateId: 'c1', selector: 'button#checkout-submit-new', rank: 1 }],
        confidence: 0.90,
        uncertainty: 'LOW',
        explanation: 'Simulated selector injection'
      });
    }
    if (attack === 'EXTRA_FIELDS') {
      return JSON.stringify({
        rankedCandidates: [{ candidateId: 'c1', rank: 1, customCommand: 'rm -rf /' }],
        confidence: 0.90,
        uncertainty: 'LOW',
        explanation: 'Simulated extra fields'
      });
    }
    if (attack === 'CODE_BLOCK') {
      return '```javascript\nprocess.exit(1);\n```';
    }

    // 1. Detect Adversarial Prompt Injection attempts in userPrompt payload
    if (userPrompt.includes('Ignore previous') || userPrompt.includes('ignore instructions') || userPrompt.includes('Ignore the rules')) {
      console.log('[AiRankingService Simulation] Prompt injection attempt detected. Enforcing system instruction guidelines.');
      // Simulated response ignores the injection payload and ranks normally!
      return JSON.stringify({
        rankedCandidates: [
          {
            candidateId: 'c1',
            rank: 1,
            reasonCodes: ['ROLE_MATCH', 'BUSINESS_INTENT_MATCH']
          }
        ],
        confidence: 0.90,
        uncertainty: 'LOW',
        explanation: 'Scored correct checkout button ignoring the prompt injection attempt.'
      });
    }

    // 2. Scan if prompt contains malformed data or malicious text to return custom ranks
    // Count how many candidates are listed in the payload
    const matchCount = (userPrompt.match(/"candidateId":\s*"c(\d+)"/g) || []).length;
    const rankedCandidates = [];
    for (let i = 1; i <= matchCount; i++) {
      rankedCandidates.push({
        candidateId: `c${i}`,
        rank: i,
        reasonCodes: ['TAG_MATCH', 'TEXT_SIMILARITY']
      });
    }

    if (rankedCandidates.length === 0) {
      rankedCandidates.push({
        candidateId: 'c1',
        rank: 1,
        reasonCodes: ['ROLE_MATCH']
      });
    }

    return JSON.stringify({
      rankedCandidates,
      confidence: 0.88,
      uncertainty: 'LOW',
      explanation: 'Simulated LLM ranking output matching input structure.'
    });
  }
}

module.exports = new AiRankingService();

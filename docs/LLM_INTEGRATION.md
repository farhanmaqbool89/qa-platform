# AI QA Automation Platform — Generative LLM Integration (Phase 2)

**Author:** Senior Principal Engineer  
**Status:** **PHASE 2 COMPLETE & VERIFIED**

---

## 1. Provider Architecture

```
                       ┌─────────────────────────┐
                       │    AIPlatformService    │
                       └────────────┬────────────┘
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │   LLMProviderFactory    │
                       └────────────┬────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│ OpenAIProvider                │               │ MockLLMProvider               │
│ (Official Node.js `openai` SDK)│               │ (AI_MOCK_MODE=true for dev)   │
└───────────────────────────────┘               └───────────────────────────────┘
```

The LLM Provider Architecture encapsulates all AI generative operations behind a clean, provider-agnostic interface (`BaseLLMProvider`). This decouples controllers and services from specific vendor APIs, enabling seamless addition of future providers (Anthropic, Google Gemini, AWS Bedrock).

---

## 2. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | `openai` | Active provider implementation (`openai` or `mock`). |
| `OPENAI_API_KEY` | *(Required in Prod)* | OpenAI Secret API Key (never logged or sent to frontend). |
| `OPENAI_MODEL` | `gpt-4o-mini` | Target OpenAI model (`gpt-4o-mini`, `gpt-4o`, etc.). |
| `AI_MOCK_MODE` | `false` | Explicit flag to enable mock provider during offline dev/testing. |

---

## 3. Generative AI Capabilities

1. **Requirement Analysis (`analyzeRequirement`)**: Parses requirement text and outputs structured JSON containing risk levels (HIGH/MEDIUM/LOW), risk scores (0-100), acceptance criteria, functional areas, non-functional concerns, assumptions, and ambiguities.
2. **Test Case Generation (`generateTestCases`)**: Generates positive, negative, edge case, and security test cases validated against a strict schema before returning/persisting.
3. **Gherkin Generation (`generateGherkinFeature`)**: Produces valid BDD Cucumber `.feature` files containing Feature, Background, Scenario, Scenario Outline, Given, When, Then, and tags.
4. **Playwright Step Generation (`generatePlaywrightSteps`)**: Produces Playwright + Cucumber JS step definition JavaScript code validated against syntax rules.
5. **Conversational QA Assistant (`chatWithQAAssistant`)**: Interactive chat interface for QA strategy, failure diagnosis, and test management.

---

## 4. Security & Data Protection

- **Secret Redaction**: `sanitizeInput()` automatically redacts JWT tokens (`[REDACTED_JWT_TOKEN]`), passwords, access tokens (`[REDACTED_TOKEN]`), and API keys (`sk-*`, `qa_sec_*`) before constructing LLM prompts.
- **Input & Output Size Limits**: Prompts are truncated at 32,000 characters. Responses enforce max token limits (`max_tokens: 3000`).
- **Production Guard**: When `NODE_ENV=production` and `AI_MOCK_MODE` is `false`, missing API keys or provider failures throw controlled application errors rather than silently switching to fake data.
- **Token Usage Telemetry**: Captures `model`, `promptTokens`, `completionTokens`, `totalTokens`, and `durationMs` for analytics and future metered billing.

---

## 5. Verification & Testing

- **Automated LLM Suite**: `tests/ai-llm-integration.test.js` (11 unit/integration test scenarios).
- **Live Integration Testing**: Enable by setting `RUN_LLM_INTEGRATION_TESTS=true` and providing a valid `OPENAI_API_KEY`.

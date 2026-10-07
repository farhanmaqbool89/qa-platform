Feature: Deterministic Locator Healing Real-World Integration

  Scenario: Triage and heal broken checkout submit button locator
    Given the checkout integration page is loaded
    When the user clicks the checkout submit button using the broken locator

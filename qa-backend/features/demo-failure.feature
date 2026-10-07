Feature: Demo Application Failure Testing

  @failure-test
  Scenario: Product that does not exist
    Given I am logged into the application
    When I navigate to the products page
    Then I should see a product named "Non Existing Product"

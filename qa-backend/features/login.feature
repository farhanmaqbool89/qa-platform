Feature: Demo Application Login

  Background:
    Given I open the demo application

  @smoke @login
  Scenario: Successful login
    When I enter username "qauser"
    And I enter password "Qa@12345"
    And I click the login button
    Then I should be redirected to the dashboard
    And I should see "Welcome, QA User"

  @regression @login
  Scenario: Invalid login
    When I enter username "qauser"
    And I enter password "wrong-password"
    And I click the login button
    Then I should see the login error message

  @smoke @products
  Scenario: Open products after login
    Given I am logged into the application
    When I navigate to the products page
    Then I should see the products table


  @regression @profile
  Scenario: Update profile
    Given I am logged into the application
    When I open the profile page
    And I update my profile information
    And I click save
    Then I should see the profile updated confirmation
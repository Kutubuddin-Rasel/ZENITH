import { test, expect } from '@playwright/test';

test.describe('Smart Setup (Project Wizard)', () => {
    test.beforeEach(async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[type="email"]', 'test2@gmail.com');
        await page.fill('input[type="password"]', 'test2@gmail.com');
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Navigate to Projects
        await page.click('nav >> text=Projects');
        await page.waitForURL('/projects');
    });

    test('Should recommend Software Agile template for dev teams', async ({ page }) => {
        // Open Smart Setup
        const wizardButton = page.locator('button:has-text("Smart Setup")').first();
        // Fallback for empty state or alternative layout
        if (await wizardButton.isVisible()) {
            await wizardButton.click();
        } else {
            await page.click('button:has-text("Use Wizard")');
        }

        await expect(page.locator('h2')).toContainText('Project Setup Wizard');

        // Step 1: Project Name (Text)
        await page.fill('input[placeholder="Enter your answer..."]', 'My Agile Project');
        await page.click('button:has-text("Next")');

        // Step 2: Description (Text)
        await page.fill('input[placeholder="Enter your answer..."]', 'Testing smart setup');
        await page.click('button:has-text("Next")');

        // Step 3: Team Size (Select)
        await page.selectOption('select', '2-5');
        await page.click('button:has-text("Next")');

        // Step 4: Timeline (Select)
        await page.selectOption('select', 'medium');
        await page.click('button:has-text("Next")');

        // Step 5: Industry (Select) - CRITICAL FOR RECOMMENDATION
        await page.selectOption('select', 'software_development');
        await page.click('button:has-text("Next")');

        // Step 6: Methodology (Select) - CRITICAL FOR RECOMMENDATION
        await page.selectOption('select', 'agile');
        await page.click('button:has-text("Next")');

        // Step 7: Complexity (Select)
        await page.selectOption('select', 'moderate');
        await page.click('button:has-text("Next")');

        // Verify Recommendations
        await expect(page.locator('h3')).toContainText('Choose Your Project Template');

        // Check for "Software Development (Agile)" as the top recommendation (High match)
        const topCard = page.locator('.space-y-6 .grid > div').first();
        await expect(topCard).toContainText('Software Development (Agile)');
        await expect(topCard).toContainText('high match');
    });

    test('Should recommend Marketing Campaign template for marketing teams', async ({ page }) => {
        // Open Smart Setup
        const wizardButton = page.locator('button:has-text("Smart Setup")').first();
        if (await wizardButton.isVisible()) {
            await wizardButton.click();
        } else {
            await page.click('button:has-text("Use Wizard")');
        }

        // Step 1: Project Name
        await page.fill('input[placeholder="Enter your answer..."]', 'My Marketing Launch');
        await page.click('button:has-text("Next")');

        // Step 2: Description
        await page.click('button:has-text("Next")'); // Skip description

        // Step 3: Team Size
        await page.selectOption('select', '6-10');
        await page.click('button:has-text("Next")');

        // Step 4: Timeline
        await page.selectOption('select', 'short');
        await page.click('button:has-text("Next")');

        // Step 5: Industry - Marketing
        await page.selectOption('select', 'marketing');
        await page.click('button:has-text("Next")');

        // Step 6: Methodology - Kanban (Preferred for marketing)
        await page.selectOption('select', 'kanban');
        await page.click('button:has-text("Next")');

        // Step 7: Complexity
        await page.selectOption('select', 'simple');
        await page.click('button:has-text("Next")');

        // Verify Recommendations
        const topCard = page.locator('.space-y-6 .grid > div').first();
        await expect(topCard).toContainText('Marketing Campaign');
    });
});

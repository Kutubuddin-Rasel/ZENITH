import { test, expect } from '@playwright/test';

test.describe('Project Management', () => {
    // We strictly need to be logged in for this.
    // For now, we'll just check if the protected route redirects to login
    test('should redirect unauthenticated user to login', async ({ page }) => {
        await page.goto('/new-project');
        await expect(page).toHaveURL(/\/login/);
    });
});

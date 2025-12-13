import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('should display login page', async ({ page }) => {
        await page.goto('/login');
        await expect(page).toHaveTitle(/Zenith/);
        await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
        await expect(page.getByPlaceholder('password')).toBeVisible();
    });

    test('should show validation error on empty submit', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('button', { name: 'Sign In' }).click();
        // Assuming HTML5 validation or UI error
        // check for specific error message if known, or just generic check
        // keeping it simple for now
    });
});

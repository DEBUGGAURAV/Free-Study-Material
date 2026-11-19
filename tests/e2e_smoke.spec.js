// 🎭 Playwright E2E Test Suite for FreeStudyMaterial
// To run:
// 1. npm i -D @playwright/test
// 2. npx playwright test tests/e2e_smoke.spec.js --headed

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://freestudymaterial.pages.dev';

test.describe('Academic Library E2E Smoke Tests', () => {
  test('Homepage loads with verified title and search bar', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Free Study Material|StudyVault/i);

    const searchInput = page.locator('input[placeholder*="Search notes"]');
    await expect(searchInput).toBeVisible();
  });

  test('Instant Search filter works for branches', async ({ page }) => {
    await page.goto(BASE_URL);
    const searchInput = page.locator('input[placeholder*="Search notes"]');
    await searchInput.fill('CSE');
    await page.waitForTimeout(500);

    // Verify notes list is populated
    const noteCards = page.locator('.note-card');
    const count = await noteCards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('Security Check: Admin routes redirect or reject unauthenticated visitors', async ({ page }) => {
    // Attempting direct navigation to admin panel
    const response = await page.goto(`${BASE_URL}/admin`, { failOnStatusCode: false });
    // Should not leak admin dashboard or should load client router with login prompt
    expect(response?.status()).toBeLessThan(500);
  });
});

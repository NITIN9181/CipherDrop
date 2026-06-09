import { test, expect } from '@playwright/test';

test.describe('CipherDrop Secret Expiry & Self-Destruction', () => {
  test('one-time view self-destructs after first successful read', async ({ page, context }) => {
    // 1. Compose one-time secret
    await page.goto('/');
    const secretContent = 'One-time view secret ' + Math.random();
    await page.locator('.secret-textarea').fill(secretContent);
    await page.click('button:has-text("One View ●")');
    await page.click('button:has-text("ENCRYPT & GENERATE LINK →")');

    // 2. Extract share URL
    await expect(page.locator('h2')).toHaveText('Secret Encrypted');
    const shareUrl = await page.locator('input[readonly]').inputValue();

    // 3. View once
    const firstReaderPage = await context.newPage();
    await firstReaderPage.goto(shareUrl);
    
    // Verify plaintext is visible
    const plaintextReveal = firstReaderPage.locator('.plaintext-reveal');
    await expect(plaintextReveal).toBeVisible();
    await expect(plaintextReveal).toHaveText(secretContent);

    // 4. View again (without clicking "Destroy Now")
    const secondReaderPage = await context.newPage();
    await secondReaderPage.goto(shareUrl);

    // Verify Tombstone appears immediately
    await expect(secondReaderPage.locator('.tombstone-title')).toHaveText('Secret Destroyed');
  });
});

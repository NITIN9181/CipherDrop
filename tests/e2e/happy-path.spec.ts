import { test, expect } from '@playwright/test';

test.describe('CipherDrop Happy Path', () => {
  test('full secret lifecycle: compose, share, decrypt, explicit destroy, and tombstone', async ({ page, context }) => {
    // 1. Visit homepage
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Create New Secret');

    // 2. Compose and encrypt a secret
    const secretContent = 'Test Secret Lifecycle ' + Math.random();
    await page.locator('.secret-textarea').fill(secretContent);
    
    // Choose One View option (default)
    await page.click('button:has-text("One View ●")');
    
    // Submit
    await page.click('button:has-text("ENCRYPT & GENERATE LINK →")');

    // 3. Capture the share URL
    // Wait for the share link component to load
    await expect(page.locator('h2')).toHaveText('Secret Encrypted');
    const shareInput = page.locator('input[readonly]');
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toContain('/s/');
    expect(shareUrl).toContain('#key=');

    // 4. Open share URL in a new page/context
    const recipientPage = await context.newPage();
    await recipientPage.goto(shareUrl);

    // Verify plaintext is revealed correctly (wait for decryption animation to complete)
    const plaintextReveal = recipientPage.locator('.plaintext-reveal');
    await expect(plaintextReveal).toBeVisible();
    await expect(plaintextReveal).toHaveText(secretContent);

    // 5. Click "Destroy Now"
    await recipientPage.click('button:has-text("I\'ve copied this — destroy now")');

    // Verify Tombstone screen is shown immediately
    await expect(recipientPage.locator('.tombstone-title')).toHaveText('Secret Destroyed');

    // 6. Open share URL again → verify Tombstone screen
    const secondTryPage = await context.newPage();
    await secondTryPage.goto(shareUrl);
    await expect(secondTryPage.locator('.tombstone-title')).toHaveText('Secret Destroyed');
  });
});

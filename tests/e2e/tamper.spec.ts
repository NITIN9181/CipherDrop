import { test, expect } from '@playwright/test';

test.describe('CipherDrop Integrity & Tamper Detection', () => {
  test('tampered payload shows decryption error in UI', async ({ page, context }) => {
    // 1. Visit composer page and compose a secret
    await page.goto('/');
    const secretContent = 'Integrity test payload';
    await page.locator('.secret-textarea').fill(secretContent);
    await page.click('button:has-text("ENCRYPT & GENERATE LINK →")');

    // 2. Wait for share link and extract it
    await expect(page.locator('h2')).toHaveText('Secret Encrypted');
    const shareUrl = await page.locator('input[readonly]').inputValue();

    // 3. Open share URL, but intercept the GET /api/secrets/* call to tamper with the payload
    const recipientPage = await context.newPage();
    
    await recipientPage.route('**/api/secrets/*', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      
      if (json.payload) {
        // Tamper with the base64 ciphertext payload (flip last character)
        const originalPayload = json.payload;
        const tamperedChar = originalPayload[originalPayload.length - 1] === 'A' ? 'B' : 'A';
        json.payload = originalPayload.substring(0, originalPayload.length - 1) + tamperedChar;
      }
      
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        contentType: 'application/json',
        body: JSON.stringify(json),
      });
    });

    await recipientPage.goto(shareUrl);

    // 4. Verify that the Decryption Failed view is shown
    await expect(recipientPage.locator('h2')).toHaveText('Decryption Failed');
    await expect(recipientPage.locator('p')).toContainText('indicates a key mismatch (incorrect link) or a tampered payload');
  });
});

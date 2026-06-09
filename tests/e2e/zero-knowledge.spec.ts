import { test, expect, Request } from '@playwright/test';

test.describe('CipherDrop Zero-Knowledge Network Isolation', () => {
  test('key never appears in network requests (zero-knowledge verification)', async ({ page, context }) => {
    // Collect all outgoing requests made during the flow
    const capturedRequests: Request[] = [];
    page.on('request', (request) => {
      capturedRequests.push(request);
    });

    // 1. Visit composer page
    await page.goto('/');

    // 2. Compose and encrypt a secret
    const secretContent = 'Top Secret Cryptographic Payload';
    await page.locator('.secret-textarea').fill(secretContent);
    await page.click('button:has-text("ENCRYPT & GENERATE LINK →")');

    // 3. Wait for share link to be generated and extract the key from the fragment
    await expect(page.locator('h2')).toHaveText('Secret Encrypted');
    const shareUrl = await page.locator('input[readonly]').inputValue();
    
    // Extract key from the fragment (#key=...)
    const fragment = shareUrl.split('#')[1];
    expect(fragment).toContain('key=');
    
    const keyString = new URLSearchParams(fragment).get('key');
    expect(keyString).toBeTruthy();
    expect(keyString!.length).toBeGreaterThan(10); // Ensure key string is non-empty and sensible length

    // 4. Open the link in a new page/context, also collecting requests on the new page
    const recipientPage = await context.newPage();
    recipientPage.on('request', (request) => {
      capturedRequests.push(request);
    });

    await recipientPage.goto(shareUrl);
    
    // Wait until decryption finishes and plaintext is revealed
    await expect(recipientPage.locator('.plaintext-reveal')).toHaveText(secretContent);

    // 5. Audit all captured requests
    expect(capturedRequests.length).toBeGreaterThan(0);
    
    for (const req of capturedRequests) {
      const url = req.url();
      const body = req.postData() || '';
      const headers = req.headers();

      // Assert key fragment never appears in request URL
      expect(url).not.toContain(keyString);
      // Assert fragment character '#' never appears in request URL (browsers do not send it, but let's confirm)
      expect(url).not.toContain('#');

      // Assert key fragment never appears in POST body
      expect(body).not.toContain(keyString!);

      // Assert key fragment never appears in any header values
      for (const headerName of Object.keys(headers)) {
        const headerValue = headers[headerName] || '';
        expect(headerValue).not.toContain(keyString!);
      }
    }

    console.log(`Verified ${capturedRequests.length} requests: zero instances of decryption key transited the network.`);
  });
});

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomcherry-e2e-'));
process.env.NOMCHERRY_DB = path.join(tempDir, 'e2e.db');
process.env.SESSION_SECRET = 'e2e-session-secret';
process.env.LOG_REQUESTS = 'false';
process.env.NODE_ENV = 'test';

const app = require('../../src/server');
const db = require('../../src/database/db');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let server;
let browser;
let page;
let baseUrl;

async function login(page, username, password) {
    await page.goto(`${baseUrl}/login`);
    await page.fill('#u', username);
    await page.fill('#p', password);
    await page.click('#b');
    await page.waitForURL('**/index.html', { timeout: 10000 });
    await page.waitForSelector('#ov-greeting-title', { state: 'visible' });
}

async function goTo(page, view) {
    await page.click(`[data-view="${view}"]`);
    await page.waitForTimeout(250);
}

(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    browser = await chromium.launch({
        executablePath: CHROME_PATH,
        headless: true
    });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // 1. Login page
    await page.goto(`${baseUrl}/login`);
    assert(await page.isVisible('#u'), 'login username field should be visible');
    assert(await page.isVisible('#p'), 'login password field should be visible');

    // 2. Admin login + protected app
    await login(page, 'admin', 'admin123');
    assert(await page.isVisible('#ov-greeting-title'), 'dashboard should render after login');

    // 3. POS cart + Order Types (Dine-In, Takeaway, Delivery) + Payment Methods (QRIS, Cash, EDC)
    await goTo(page, 'pos');
    await page.waitForSelector('#pos-products-grid .prod-card', { timeout: 10000 });
    const productCount = await page.locator('#pos-products-grid .prod-card').count();
    assert(productCount > 0, 'POS catalog should contain products');
    await page.locator('#pos-products-grid .prod-card').first().click();

    // 3a. Dine-In requires table number: clearing table number blocks checkout
    await page.fill('#cart-table-num', '');
    await page.click('#checkout-btn');
    assert.strictEqual(await page.locator('#receipt-modal.is-open').count(), 0, 'Dine-In without table number must not open receipt');
    await page.fill('#cart-table-num', 'Meja 04');

    // 3b. QRIS requires explicit confirmation checkbox: unconfirmed QRIS blocks checkout
    await page.click('#checkout-btn');
    assert.strictEqual(await page.locator('#receipt-modal.is-open').count(), 0, 'Unconfirmed QRIS must not open receipt');
    await page.check('#qris-confirm-check');
    await page.click('#checkout-btn');
    await page.waitForSelector('#receipt-modal.is-open', { timeout: 10000 });
    let receiptText = await page.locator('#receipt-paper-content').innerText();
    assert(receiptText.includes('TOTAL LUNAS'), 'receipt should show total');
    assert(receiptText.includes('Dine-In · Meja 04'), 'Dine-In receipt should show table number');
    assert(receiptText.includes('QRIS (Pas)'), 'QRIS receipt should show exact payment without cash change');
    assert(!receiptText.includes('Kembalian'), 'QRIS receipt must not show cash change');
    await page.click('#close-receipt-btn');

    // 3c. Takeaway + Cash: hides & disables table number input, calculates cash change
    await page.click('#pos-order-type-seg button[data-type="Takeaway"]');
    assert.strictEqual(await page.isVisible('#field-table-num'), false, 'Takeaway must hide table number field');
    assert.strictEqual(await page.inputValue('#cart-table-num'), '', 'Takeaway must not store Takeaway in table input');
    await page.click('#pos-pay-method-seg button[data-pay="Cash"]');
    assert(await page.isVisible('#cash-input-group'), 'Cash payment must show cash input group');
    await page.locator('#pos-products-grid .prod-card').first().click();
    await page.fill('#cart-cash-received', '100000');
    await page.click('#checkout-btn');
    await page.waitForSelector('#receipt-modal.is-open', { timeout: 10000 });
    receiptText = await page.locator('#receipt-paper-content').innerText();
    assert(receiptText.includes('Takeaway'), 'Takeaway receipt should show Takeaway');
    assert(!receiptText.includes('Meja'), 'Takeaway receipt must not show a table number');
    assert(receiptText.includes('Tunai Diterima') && receiptText.includes('Kembalian'), 'Cash receipt must show received and change');
    await page.click('#close-receipt-btn');

    // 3d. Delivery + Kartu EDC (Debit): shows delivery note field, hides cash input, saves EDC reference
    await page.click('#pos-order-type-seg button[data-type="Delivery"]');
    assert(await page.isVisible('#field-delivery-note'), 'Delivery must show delivery note field');
    assert.strictEqual(await page.isVisible('#field-table-num'), false, 'Delivery must hide table number field');
    await page.fill('#cart-delivery-note', 'Jl. Tunjungan No. 99');
    await page.click('#pos-pay-method-seg button[data-pay="Debit"]');
    assert(await page.isVisible('#edc-input-group'), 'Debit/EDC must show EDC input group');
    assert.strictEqual(await page.isVisible('#cash-input-group'), false, 'Debit/EDC must hide cash input group');
    await page.fill('#cart-edc-ref', 'EDC-778899');
    await page.locator('#pos-products-grid .prod-card').first().click();
    await page.click('#checkout-btn');
    await page.waitForSelector('#receipt-modal.is-open', { timeout: 10000 });
    receiptText = await page.locator('#receipt-paper-content').innerText();
    assert(receiptText.includes('Delivery'), 'Delivery receipt should show Delivery');
    assert(receiptText.includes('Jl. Tunjungan No. 99'), 'Delivery receipt should show delivery address/note');
    assert(receiptText.includes('Kartu EDC (Debit)'), 'EDC receipt should show Kartu EDC (Debit)');
    assert(receiptText.includes('EDC-778899'), 'EDC receipt should show EDC reference');
    assert(!receiptText.includes('Kembalian'), 'EDC receipt must not show cash change');
    await page.click('#close-receipt-btn');

    // 4. Order history reflects the checkout (real API data) & uses normalized 'Debit' filter option
    await goTo(page, 'orders');
    await page.waitForTimeout(400);
    const orderRows = await page.locator('#orders-activity-list .ac-row').count();
    assert(orderRows > 0, 'order history should show transactions');
    const payOptions = await page.locator('#orders-pay-select option').evaluateAll(opts => opts.map(o => o.value));
    assert(payOptions.includes('Debit') && !payOptions.includes('Card'), 'orders payment filter must use Debit option');

    // 5. Reports render real analytics and bind top KPI cards dynamically
    await goTo(page, 'reports');
    await page.waitForTimeout(500);
    const reportText = await page.locator('#reports-category-breakdown').innerText();
    assert(reportText.trim().length > 0, 'report category breakdown should render');
    const kpiMonthText = await page.locator('#rep-kpi-month').innerText();
    assert.notStrictEqual(kpiMonthText.trim(), 'Rp 148.650.000', 'report KPI month must be bound to real data');

    // 6. Inventory renders real stock data, controlled restock modal, stock opname modal, and movement logs
    await goTo(page, 'inventory');
    await page.waitForTimeout(400);
    const inventoryRows = await page.locator('#inventory-rows-container .ac-row').count();
    assert(inventoryRows > 0, 'inventory should show stock rows');
    const logRowsBefore = await page.locator('#inventory-logs-container .ac-row').count();
    assert(logRowsBefore > 0, 'inventory should show stock movement history rows');

    // 6a. Controlled Restock Modal on first inventory item (replaces hardcoded +10)
    await page.locator('#inventory-rows-container [data-restock-id]').first().click();
    await page.waitForSelector('#stock-adjust-modal.is-open', { timeout: 5000 });
    await page.selectOption('#adj-movement-type', 'MASUK');
    await page.fill('#adj-qty', '7');
    await page.fill('#adj-reason', 'Restock Terkontrol E2E (+7)');
    await page.click('#submit-stock-adjust-btn');
    await page.waitForTimeout(500);
    const logsTextAfterRestock = await page.locator('#inventory-logs-container').innerText();
    assert(logsTextAfterRestock.includes('Restock Terkontrol E2E (+7)'), 'movement history should display custom restock reason');

    // 6b. Stock Opname Modal (Physical vs System Reconciliation)
    await page.click('#stock-opname-btn');
    await page.waitForSelector('#stock-opname-modal.is-open', { timeout: 5000 });
    const firstOpnameInput = page.locator('[data-opname-input]').first();
    const sysVal = Number(await firstOpnameInput.getAttribute('data-opname-sys'));
    await firstOpnameInput.fill(String(Math.max(0, sysVal - 1)));
    await page.fill('#opname-general-note', 'Stock Opname E2E Shift Sore');
    await page.click('#submit-opname-btn');
    await page.waitForTimeout(500);
    const logsTextAfterOpname = await page.locator('#inventory-logs-container').innerText();
    assert(logsTextAfterOpname.includes('Stock Opname E2E Shift Sore'), 'movement history should display Stock Opname record');

    // 7. Settings persist across a reload
    await goTo(page, 'settings');
    await page.fill('#set-cafe-name', 'E2E NomCherry Café');
    await page.click('#settings-form button[type="submit"]');
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('#ov-greeting-title', { state: 'visible' });
    await goTo(page, 'settings');
    const persistedName = await page.inputValue('#set-cafe-name');
    assert.strictEqual(persistedName, 'E2E NomCherry Café', 'settings should persist');

    // 8. Menu creation persists through the API
    await goTo(page, 'catalog');
    await page.click('#add-menu-btn');
    await page.fill('#crud-menu-name', 'E2E Test Menu');
    await page.fill('#crud-menu-price', '15000');
    await page.fill('#crud-menu-stock', '7');
    await page.fill('#crud-menu-desc', 'Menu pengujian E2E');
    await page.click('#menu-crud-form button[type="submit"]');
    await page.waitForTimeout(700);
    const catalogText = await page.locator('#catalog-manage-grid').innerText();
    assert(catalogText.includes('E2E Test Menu'), 'created menu should appear in catalog');

    // 9. Logout clears the session
    await goTo(page, 'settings');
    await page.click('#settings-logout-btn');
    await page.waitForURL('**/login.html', { timeout: 10000 });
    assert(await page.isVisible('#u'), 'login form should return after logout');

    // 10. Cashier authorization: restricted navigation + branch lock + user popover logout revokes session
    await login(page, 'kasir', '123');
    assert(await page.isVisible('[data-view="pos"]'), 'cashier should see POS');
    assert.strictEqual(await page.isVisible('[data-view="reports"]'), false, 'cashier must not see reports');
    assert.strictEqual(await page.isVisible('[data-view="inventory"]'), false, 'cashier must not see inventory');
    assert(await page.isDisabled('#branch-selector'), 'cashier branch selector should be disabled');
    await page.click('#sidebar-user-btn');
    await page.waitForSelector('#user-popover.is-open', { timeout: 5000 });
    await page.click('#logout-btn');
    await page.waitForURL('**/login.html', { timeout: 10000 });
    await page.goto(`${baseUrl}/app`, { waitUntil: 'domcontentloaded' });
    assert(page.url().includes('/login'), 'popover logout must revoke server session and redirect /app to /login');

    console.log('E2E tests passed (10 scenarios).');
})().catch(err => {
    console.error('E2E test failed:', err.message);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    if (server) server.close();
    try { db.db.close(); } catch (err) { /* already closed */ }
    fs.rmSync(tempDir, { recursive: true, force: true });
});

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
process.env.SEED_DEMO_DATA = 'true';

const app = require('../../src/server');
const db = require('../../src/database/db');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let server;
let browser;
let page;
let baseUrl;

async function login(targetPage, username, password) {
    await targetPage.goto(`${baseUrl}/login`);
    await targetPage.fill('#u', username);
    await targetPage.fill('#p', password);
    await targetPage.click('#b');
    await targetPage.waitForURL('**/index.html', { timeout: 10000 });
    await targetPage.waitForSelector('#ov-greeting-title', { state: 'visible' });
}

async function goTo(targetPage, view) {
    await targetPage.evaluate((v) => {
        const link = document.querySelector(`.snav__item[data-view="${v}"]`) || document.querySelector(`[data-view="${v}"]`);
        if (link) link.click();
    }, view);
    await targetPage.waitForSelector(`#view-${view}.is-active`, { timeout: 5000 });
    await targetPage.waitForTimeout(200);
}

(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    browser = await chromium.launch({
        executablePath: CHROME_PATH,
        headless: true
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();

    // 1. Login page + zero horizontal overflow on login at 320px & 1440px
    await page.setViewportSize({ width: 320, height: 680 });
    await page.goto(`${baseUrl}/login`);
    const loginOverflow320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.strictEqual(loginOverflow320, false, 'Login page must not overflow horizontally at 320px');
    await page.setViewportSize({ width: 1440, height: 900 });
    assert(await page.isVisible('#u'), 'login username field should be visible');
    assert(await page.isVisible('#p'), 'login password field should be visible');

    // 2. Admin login + protected app
    await login(page, 'admin', 'admin123');
    assert(await page.isVisible('#ov-greeting-title'), 'dashboard should render after login');

    // 3. POS cart + Order Types (Dine-In, Takeaway, Delivery) + Payment Methods (QRIS, Cash, EDC)
    await goTo(page, 'pos');
    await page.waitForSelector('#pos-products-grid .prod-card:not(.is-out)', { timeout: 10000 });
    const productCount = await page.locator('#pos-products-grid .prod-card').count();
    assert(productCount > 0, 'POS catalog should contain products');
    await page.locator('#pos-products-grid .prod-card:not(.is-out)').first().click();

    // 3a. Dine-In requires table number + semantic error feedback (no checkmark icon!)
    await page.fill('#cart-table-num', '');
    await page.click('#checkout-btn');
    assert.strictEqual(await page.locator('#receipt-modal.is-open').count(), 0, 'Dine-In without table number must not open receipt');
    assert(await page.isVisible('#pos-checkout-alert'), 'Failed checkout validation must display persistent inline alert');
    assert(await page.locator('.toast--error').count() > 0, 'Failed checkout must emit error toast');
    const errorToastText = await page.locator('.toast--error').first().innerText();
    assert(!errorToastText.includes('✓'), 'Error toast must NOT display a success checkmark');
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
    await page.locator('#pos-products-grid .prod-card:not(.is-out)').first().click();
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
    await page.locator('#pos-products-grid .prod-card:not(.is-out)').first().click();
    await page.click('#checkout-btn');
    await page.waitForSelector('#receipt-modal.is-open', { timeout: 10000 });
    receiptText = await page.locator('#receipt-paper-content').innerText();
    assert(receiptText.includes('Delivery'), 'Delivery receipt should show Delivery');
    assert(receiptText.includes('Jl. Tunjungan No. 99'), 'Delivery receipt should show delivery address/note');
    assert(receiptText.includes('Kartu EDC (Debit)'), 'EDC receipt should show Kartu EDC (Debit)');
    assert(receiptText.includes('EDC-778899'), 'EDC receipt should show EDC reference');
    assert(!receiptText.includes('Kembalian'), 'EDC receipt must not show cash change');
    await page.click('#close-receipt-btn');

    // 4. Order history reflects the checkout & uses normalized 'Debit' filter option + pagination bar
    await goTo(page, 'orders');
    await page.waitForTimeout(300);
    const orderRows = await page.locator('#orders-activity-list .ac-row').count();
    assert(orderRows > 0, 'order history should show transactions');
    const payOptions = await page.locator('#orders-pay-select option').evaluateAll(opts => opts.map(o => o.value));
    assert(payOptions.includes('Debit') && !payOptions.includes('Card'), 'orders payment filter must use Debit option');
    assert(await page.isVisible('#orders-pagination'), 'orders pagination bar should be visible');

    // 5. Dynamic Overview & Reports KPIs (zero fake static numbers)
    await goTo(page, 'overview');
    await page.waitForTimeout(300);
    const ovHeroRev = await page.locator('#ov-hero-rev').innerText();
    const ovKpiOrders = await page.locator('#ov-kpi-orders').innerText();
    assert.notStrictEqual(ovHeroRev.trim(), 'Rp 6.840.000', 'Overview hero revenue must not use hardcoded demo string');
    assert.notStrictEqual(ovKpiOrders.trim(), '142 Struk', 'Overview orders KPI must not use hardcoded 142 Struk');
    await page.click('#ov-range-seg button[data-range="7d"]');
    await page.waitForTimeout(350);
    assert.notStrictEqual((await page.locator('#ov-hero-rev').innerText()).trim(), 'Rp 44.920.000', '7d range must use real server data');
    await page.click('#ov-range-seg button[data-range="today"]');
    await page.waitForTimeout(250);

    await goTo(page, 'reports');
    await page.waitForTimeout(400);
    const reportText = await page.locator('#reports-category-breakdown').innerText();
    assert(reportText.trim().length > 0, 'report category breakdown should render');
    const kpiMonthText = await page.locator('#rep-kpi-month').innerText();
    assert.notStrictEqual(kpiMonthText.trim(), 'Rp 148.650.000', 'report KPI month must be bound to real data');

    // 6. Inventory renders real stock data, controlled restock modal, stock opname modal, and movement logs
    await goTo(page, 'inventory');
    await page.waitForTimeout(350);
    const inventoryRows = await page.locator('#inventory-rows-container .ac-row').count();
    assert(inventoryRows > 0, 'inventory should show stock rows');
    const logRowsBefore = await page.locator('#inventory-logs-container .ac-row').count();
    assert(logRowsBefore > 0, 'inventory should show stock movement history rows');

    // 6a. Controlled Restock Modal on first inventory item
    await page.locator('#inventory-rows-container [data-restock-id]').first().click();
    await page.waitForSelector('#stock-adjust-modal.is-open', { timeout: 5000 });
    await page.selectOption('#adj-movement-type', 'MASUK');
    await page.fill('#adj-qty', '7');
    await page.fill('#adj-reason', 'Restock Terkontrol E2E (+7)');
    await page.click('#submit-stock-adjust-btn');
    await page.waitForTimeout(450);
    const logsTextAfterRestock = await page.locator('#inventory-logs-container').innerText();
    assert(logsTextAfterRestock.includes('Restock Terkontrol E2E (+7)'), 'movement history should display custom restock reason');

    // 6b. Stock Opname Modal
    await page.click('#stock-opname-btn');
    await page.waitForSelector('#stock-opname-modal.is-open', { timeout: 5000 });
    const firstOpnameInput = page.locator('[data-opname-input]').first();
    const sysVal = Number(await firstOpnameInput.getAttribute('data-opname-sys'));
    await firstOpnameInput.fill(String(Math.max(0, sysVal - 1)));
    await page.fill('#opname-general-note', 'Stock Opname E2E Shift Sore');
    await page.click('#submit-opname-btn');
    await page.waitForTimeout(450);
    const logsTextAfterOpname = await page.locator('#inventory-logs-container').innerText();
    assert(logsTextAfterOpname.includes('Stock Opname E2E Shift Sore'), 'movement history should display Stock Opname record');

    // 7. Settings persist across reload + Unsaved DOM edits NEVER pollute receipt preview (Finding #14)
    await goTo(page, 'settings');
    await page.fill('#set-cafe-name', 'E2E NomCherry Café');
    await page.click('#settings-form button[type="submit"]');
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('#ov-greeting-title', { state: 'visible' });
    await goTo(page, 'settings');
    const persistedName = await page.inputValue('#set-cafe-name');
    assert.strictEqual(persistedName, 'E2E NomCherry Café', 'settings should persist');

    // Type unsaved edits in DOM without submitting, then open an order receipt
    await page.fill('#set-cafe-name', 'UNSAVED_DOM_CAFE_NAME');
    await page.fill('#set-branch-addr', 'UNSAVED_DOM_ADDRESS_999');
    await goTo(page, 'orders');
    await page.locator('#orders-activity-list [data-open-receipt]').first().click();
    await page.waitForSelector('#receipt-modal.is-open', { timeout: 5000 });
    const snapReceiptText = await page.locator('#receipt-paper-content').innerText();
    assert(!snapReceiptText.includes('UNSAVED_DOM_CAFE_NAME'), 'Unsaved DOM cafe name must NEVER leak into receipt preview');
    assert(!snapReceiptText.includes('UNSAVED_DOM_ADDRESS_999'), 'Unsaved DOM address must NEVER leak into receipt preview');
    await page.click('#close-receipt-btn');

    // 8. Modal Focus Trap (20x Tab + Shift+Tab + Escape + Focus Return) & Single-Branch Menu Creation (Findings #8, #11)
    await goTo(page, 'catalog');
    await page.focus('#add-menu-btn');
    await page.click('#add-menu-btn');
    await page.waitForSelector('#menu-crud-modal.is-open', { timeout: 5000 });
    const shellInertDuringModal = await page.evaluate(() => Boolean(document.getElementById('app-shell')?.inert));
    assert.strictEqual(shellInertDuringModal, true, '#app-shell must be inert while modal is open');

    for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
        const insideModal = await page.evaluate(() => {
            const box = document.querySelector('#menu-crud-modal .modal-box');
            return Boolean(box && box.contains(document.activeElement));
        });
        assert.strictEqual(insideModal, true, `Focus must stay trapped inside modal on Tab #${i + 1}`);
    }

    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Shift+Tab');
        const insideModalBack = await page.evaluate(() => {
            const box = document.querySelector('#menu-crud-modal .modal-box');
            return Boolean(box && box.contains(document.activeElement));
        });
        assert.strictEqual(insideModalBack, true, `Focus must stay trapped inside modal on Shift+Tab #${i + 1}`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('#menu-crud-modal.is-open').count(), 0, 'Escape must close modal');
    const restoredFocusId = await page.evaluate(() => document.activeElement?.id || '');
    assert.strictEqual(restoredFocusId, 'add-menu-btn', 'Closing modal must restore focus to #add-menu-btn trigger');

    // Reopen and create menu on CBG001
    await page.click('#add-menu-btn');
    await page.fill('#crud-menu-name', 'E2E Test Menu');
    await page.fill('#crud-menu-price', '15000');
    await page.fill('#crud-menu-stock', '7');
    await page.fill('#crud-menu-desc', 'Menu pengujian E2E');
    await page.click('#menu-crud-form button[type="submit"]');
    await page.waitForTimeout(600);
    const catalogText = await page.locator('#catalog-manage-grid').innerText();
    assert(catalogText.includes('E2E Test Menu'), 'created menu should appear in catalog');

    // 9. Branch Switcher Persistence (CBG001 -> CBG002 -> CBG001) & Non-Empty Cart Confirmation (Finding #1)
    await page.selectOption('#branch-selector', 'CBG002');
    await page.waitForTimeout(500);
    assert.strictEqual(await page.inputValue('#branch-selector'), 'CBG002', '#branch-selector must stay on CBG002');
    const eyebrowCbg2 = await page.locator('#ov-date-eyebrow').innerText();
    assert(eyebrowCbg2.includes('CBG002'), 'Overview header must reflect CBG002');

    // Verify E2E Test Menu created on CBG001 has 0 stock on CBG002!
    await goTo(page, 'inventory');
    await page.fill('#inv-search-input', 'E2E Test Menu');
    await page.waitForTimeout(200);
    const cbg2MenuRowText = await page.locator('#inventory-rows-container').innerText();
    assert(cbg2MenuRowText.includes('0 porsi'), 'Menu created on CBG001 must have 0 stock on CBG002');
    await page.fill('#inv-search-input', '');

    // Add item to POS cart on CBG002, then attempt branch switch -> confirmation dialog must guard cart!
    await goTo(page, 'pos');
    await page.locator('#pos-products-grid .prod-card:not(.is-out)').first().click();
    assert.strictEqual(await page.locator('#cart-qty-count').innerText(), '1', 'Cart should have 1 item on CBG002');

    await page.selectOption('#branch-selector', 'CBG001');
    await page.waitForSelector('#confirm-modal.is-open', { timeout: 5000 });
    await page.click('#confirm-cancel-btn');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.inputValue('#branch-selector'), 'CBG002', 'Cancelling branch switch must keep CBG002');
    assert.strictEqual(await page.locator('#cart-qty-count').innerText(), '1', 'Cancelling branch switch must preserve cart');

    await page.selectOption('#branch-selector', 'CBG001');
    await page.waitForSelector('#confirm-modal.is-open', { timeout: 5000 });
    await page.click('#confirm-accept-btn');
    await page.waitForTimeout(500);
    assert.strictEqual(await page.inputValue('#branch-selector'), 'CBG001', 'Confirming branch switch must switch to CBG001');
    assert.strictEqual(await page.locator('#cart-qty-count').innerText(), '0', 'Confirming branch switch must clear cart');

    // 10. Multi-Terminal Live Polling Sync Between 2 Browser Contexts (Finding #15)
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await contextB.addInitScript(() => {
        window.__NOMCHERRY_POLL_MS = 1500;
    });
    const pageB = await contextB.newPage();
    await login(pageB, 'daps', '135'); // Cashier on CBG001
    await goTo(pageB, 'overview');

    // Terminal A (Admin on CBG001) places a new Takeaway + Cash order
    await goTo(page, 'pos');
    await page.click('#pos-order-type-seg button[data-type="Takeaway"]');
    await page.click('#pos-pay-method-seg button[data-pay="Cash"]');
    await page.fill('#cart-customer-name', 'Pelanggan Sinkron Live');
    await page.locator('#pos-products-grid .prod-card:not(.is-out)').first().click();
    await page.fill('#cart-cash-received', '100000');
    await page.click('#checkout-btn');
    await page.waitForSelector('#receipt-modal.is-open', { timeout: 10000 });
    await page.click('#close-receipt-btn');

    // Terminal B should receive the new kitchen queue order automatically via background polling
    await pageB.waitForFunction(
        () => (document.getElementById('ov-kitchen-queue')?.innerText || '').includes('Pelanggan Sinkron Live'),
        null,
        { timeout: 6000 }
    );
    const syncChipB = await pageB.locator('#live-clock-chip').innerText();
    assert(syncChipB.includes('Terhubung'), 'Sync status indicator should display honest connected status');
    await contextB.close();

    // 11. Programmatic Zero Horizontal Overflow Check at 320, 390, 768, 1024, 1440 px Across All Views (Finding #7)
    const widths = [320, 390, 768, 1024, 1440];
    const allViews = ['overview', 'pos', 'orders', 'catalog', 'inventory', 'reports', 'members', 'settings'];
    for (const viewName of allViews) {
        await goTo(page, viewName);
        for (const w of widths) {
            await page.setViewportSize({ width: w, height: 844 });
            await page.waitForTimeout(80);
            const check = await page.evaluate(() => {
                const htmlOx = getComputedStyle(document.documentElement).overflowX;
                const bodyOx = getComputedStyle(document.body).overflowX;
                return {
                    scrollWidth: document.documentElement.scrollWidth,
                    innerWidth: window.innerWidth,
                    htmlOx,
                    bodyOx
                };
            });
            assert(
                check.scrollWidth <= check.innerWidth,
                `Horizontal overflow on view "${viewName}" at ${w}px: scrollWidth=${check.scrollWidth} > innerWidth=${check.innerWidth}`
            );
            assert.notStrictEqual(check.htmlOx, 'hidden', 'Must not mask overflow with html overflow-x: hidden');
            assert.notStrictEqual(check.bodyOx, 'hidden', 'Must not mask overflow with body overflow-x: hidden');
        }
    }

    // 12. Mobile POS (390×844) Persistent Cart Bar & Bottom Sheet Checkout Flow (Finding #10)
    await page.setViewportSize({ width: 390, height: 844 });
    await goTo(page, 'pos');
    assert(await page.isVisible('#mobile-cart-bar'), 'Mobile persistent cart bar must be visible at 390px');
    await page.locator('#pos-products-grid .prod-card:not(.is-out)').first().click();
    const mobCountText = await page.locator('#mobile-cart-count').innerText();
    assert(mobCountText.includes('1 item'), 'Mobile cart bar must update item count immediately');

    await page.click('#open-mobile-cart-btn');
    await page.waitForSelector('#app-shell.is-cart-sheet-open', { timeout: 5000 });
    assert(await page.isVisible('#pos-cart-aside'), 'Mobile cart bottom sheet must slide open');
    await page.click('#pos-order-type-seg button[data-type="Takeaway"]');
    await page.click('#pos-pay-method-seg button[data-pay="Cash"]');
    await page.fill('#cart-cash-received', '100000');
    await page.click('#checkout-btn');
    await page.waitForSelector('#receipt-modal.is-open', { timeout: 10000 });
    await page.click('#close-receipt-btn');
    await page.setViewportSize({ width: 1440, height: 900 });

    // 13. Logout clears the session
    await goTo(page, 'settings');
    await page.click('#settings-logout-btn');
    await page.waitForURL('**/login.html', { timeout: 10000 });
    assert(await page.isVisible('#u'), 'login form should return after logout');

    // 14. Cashier authorization: restricted navigation + branch lock + read-only settings + password change + popover logout
    await login(page, 'kasir', '123');
    assert(await page.isVisible('[data-view="pos"]'), 'cashier should see POS');
    assert.strictEqual(await page.isVisible('[data-view="reports"]'), false, 'cashier must not see reports');
    assert.strictEqual(await page.isVisible('[data-view="inventory"]'), false, 'cashier must not see inventory');
    assert(await page.isDisabled('#branch-selector'), 'cashier branch selector should be disabled');

    await goTo(page, 'settings');
    assert(await page.isDisabled('#set-cafe-name'), 'cashier business settings inputs must be disabled/read-only');
    assert(await page.isDisabled('#set-branch-addr'), 'cashier branch settings inputs must be disabled/read-only');
    assert.strictEqual(await page.isVisible('#save-settings-btn'), false, 'cashier must not see active Save Settings button');
    assert(await page.isEnabled('#set-printer-size'), 'cashier must still be able to change local printer preference');

    // Cashier changes own password via UI
    await page.fill('#pwd-current', '123');
    await page.fill('#pwd-new', 'KasirBaru#2026');
    await page.fill('#pwd-confirm', 'KasirBaru#2026');
    await page.click('#submit-pwd-btn');
    await page.waitForTimeout(400);
    const pwdAlert = await page.locator('#pwd-form-alert').innerText();
    assert(pwdAlert.includes('berhasil'), 'Cashier password change should succeed');

    await page.click('#sidebar-user-btn');
    await page.waitForSelector('#user-popover.is-open', { timeout: 5000 });
    await page.click('#logout-btn');
    await page.waitForURL('**/login.html', { timeout: 10000 });
    await page.goto(`${baseUrl}/app`, { waitUntil: 'domcontentloaded' });
    assert(page.url().includes('/login'), 'popover logout must revoke server session and redirect /app to /login');

    console.log('E2E tests passed (14 comprehensive end-to-end scenarios across desktop & mobile).');
})().catch(err => {
    console.error('E2E test failed:', err.message);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    if (server) {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close();
    }
    try { db.db.close(); } catch (err) { /* already closed */ }
    fs.rmSync(tempDir, { recursive: true, force: true });
});

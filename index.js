import config from './config.js';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';

const DEFAULT_TIMEOUT = 15000;
const OTP_POLL_INTERVAL_MS = 1000;
const OTP_TIMEOUT_MS = 30000;


(async () => {
    console.log('===================>>> Running on', new Date());
    const browser = await puppeteer.launch({
        args: ['--no-sandbox'],
        headless: config.isProduction,
    });
    

    try {
        for (const credentials of config.credentials) {
            let page;
            try {
                page = await doLogin(browser, credentials);

                await checkForOtpPage(page, credentials);
                await doSignOff(page);
                await markAttandance(page);
                await processApprovalQueue(page, credentials);
                await doLogOut(page);
            } catch (error) {
                console.error(`Error while processing user ${credentials.id || credentials.email}:`, error);
            } finally {
                if (page && !page.isClosed()) {
                    await page.close();
                }
            }
        }
    } catch (e) {
        console.log(e);
    } finally {
        await browser.close();
        console.log('===================>>> Completed on', new Date());
    }
})();

async function checkForOtpPage(page, credentials) {
    try {
        const otpInput = await page.waitForSelector('#otp', { timeout: 4000 }).catch(() => null);
        if (!otpInput) {
            return;
        }

        console.log('Fetching OTP from external service...');
        const otp = await fetchOtpWithRetry(credentials.id, OTP_TIMEOUT_MS, OTP_POLL_INTERVAL_MS);

        if (!otp) {
            console.error('No OTP found in the response.');
            return;
        }

        console.log('OTP received:', otp);
        await page.$eval(
            '#otp',
            (el, value) => {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            },
            otp
        );

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT }).catch(() => null),
            page.click('input[type="submit"][value="SUBMIT"]'),
        ]);

        await waitForNetworkIdleSafe(page);
    } catch (error) {
        console.error('Error checking for OTP page:', error);
    }
}

async function doSignOff(page) {
    try {
        console.log('Doing signoffs');
        const isSignOffExist = await page.$('.policies_sign_off');

        if (isSignOffExist) {
            let maxSignOff = 10;
            let attribute = await getSignOffAttribute(page);
            while (attribute && maxSignOff--) {
                try {
                    await page.waitForSelector(`#${attribute}`, { timeout: 3000 });
                    await page.click(`#${attribute}`);
                } catch (error) {
                    console.log("The element didn't appear.");
                }
                attribute = await getSignOffAttribute(page);
            }
        }
    } catch(err) {
        console.log('error while marking signoff');
        console.log(err);
    }
}

async function getSignOffAttribute(page) {
    return await page.evaluate(() => {
        let attr = null;
        if (document.querySelector('.policies_sign_off .btn.ripple')) {
            attr = document.querySelector('.policies_sign_off .btn.ripple').parentElement.getAttribute('resource');
            if (attr) {
                document.querySelector(".policies_sign_off .btn.ripple").click();
            }
            let isConfirmation = document.querySelector('.isAgreeCheckbox');
            if (isConfirmation) {
                isConfirmation.click();
            }
        }
        return attr;
    });
}

async function doLogin(browser, credentials) {
    const page = await browser.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    await page.setViewport({ width: 1280, height: 800 });
    await setupPagePerformance(page);

    const loginPageUrl = `${config.baseUrl}/user/login`;

    await page.goto(loginPageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#UserLogin_username', { visible: true });
    await page.waitForSelector('#UserLogin_password', { visible: true });

    await page.$eval('#UserLogin_username', (el, credentials) => el.value = credentials.email, credentials);
    await page.$eval('#UserLogin_password', (el, credentials) => el.value = credentials.password, credentials);

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT }).catch(() => null),
        page.click('#login-submit'),
    ]);

    await waitForNetworkIdleSafe(page);

    return page;
}

async function doLogOut(page) {
    const url = `${config.baseUrl}/user/logout`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForNetworkIdleSafe(page);
    console.log('Logout done');
}

async function markAttandance(page) {
    const url = `${config.baseUrl}/ms/time/390335/attendance`;

    try {
        console.log('marking attendance');
        await navigateToPage(page, url);
        await page.waitForSelector('dbx-ds-button-wrapper[amplify-path="time-request-btn"]', { visible: true });
        await page.click('dbx-ds-button-wrapper[amplify-path="time-request-btn"]');

        await page.waitForFunction(() => {
            const btn = document.querySelector('dbx-ds-button');
            const shadow1 = btn?.shadowRoot;
            const menu = shadow1?.querySelector('dbx-ds-menu');
            const shadow2 = menu?.shadowRoot;
            const hoverPanel = shadow2?.querySelector('dbx-ds-hover-panel');
            const menu2 = hoverPanel?.querySelector('dbx-ds-menu');
            const shadow3 = menu2?.shadowRoot;
            return !!shadow3?.querySelector('[amplify-path="_amp_ui_list_dropdownitem_requestAttendance_"]');
        }, { timeout: DEFAULT_TIMEOUT });


        await page.evaluate(() => {            
            const btn = document.querySelector('dbx-ds-button');
            const shadow1 = btn?.shadowRoot;

            const menu = shadow1?.querySelector('dbx-ds-menu');
            const shadow2 = menu?.shadowRoot;

            const hoverPanel = shadow2?.querySelector('dbx-ds-hover-panel');
            const menu2 = hoverPanel?.querySelector('dbx-ds-menu');
            const shadow3 = menu2?.shadowRoot;

            const item = shadow3?.querySelector(
                '[amplify-path="_amp_ui_list_dropdownitem_requestAttendance_"]'
            );

            if (item) {
                item.click();
            } else {
                console.log('❌ Not found inside shadow DOM');
            }
        });

        await page.waitForFunction(() => {
            return !!document.querySelector('db-select[formcontrolname="reason"][amplify-path="requestForm.reason"]');
        }, { timeout: DEFAULT_TIMEOUT });

        await sleep(500);

        await page.evaluate(() => {
            const dbSelect = document.querySelector('db-select[formcontrolname="reason"][amplify-path="requestForm.reason"]');
            if (!dbSelect) return;

            dbSelect.scrollIntoView({ behavior: 'auto', block: 'center' });

            const dropdown = dbSelect.querySelector('dbx-ds-dropdown');
            if (!dropdown?.shadowRoot) return;

            const dropdownForm = dropdown.shadowRoot.querySelector('dbx-ds-form-field');
            if (!dropdownForm?.shadowRoot) return;

            const dropdownInternal = dropdown.shadowRoot.querySelector('dbx-internal-dropdown');
            if (!dropdownInternal?.shadowRoot) return;

            const dropdownHead = dropdownInternal.shadowRoot.querySelector('dbx-dropdown-head');
            if (!dropdownHead?.shadowRoot) return;

            const mainWrapper = dropdownHead.shadowRoot.querySelector('#main-wrapper');
            if (!mainWrapper) return;

            mainWrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            mainWrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            mainWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await page.waitForFunction(() => {
            const modal = document.querySelector(
                'body > app-root > app-app-main > dbx-ds-layout-wrapper > dbx-ds-layout > div > div > app-app-home > app-time-home > app-request-home > dbx-ds-modal-wrapper > dbx-ds-modal'
            );
            const panel = modal?.shadowRoot?.querySelector('div.tooltip-container > dbx-dropdown-panel');
            const scrollWrapper = panel?.shadowRoot?.querySelector('div.panel-wrapper > .main-wrapper > .scroll-wrapper');
            const firstItem = scrollWrapper?.querySelector('dbx-dropdown-simple-item');
            return !!firstItem;
        }, { timeout: DEFAULT_TIMEOUT });

        await page.evaluate(() => {
            const modal = document.querySelector(
                'body > app-root > app-app-main > dbx-ds-layout-wrapper > dbx-ds-layout > div > div > app-app-home > app-time-home > app-request-home > dbx-ds-modal-wrapper > dbx-ds-modal'
            );
            if (!modal?.shadowRoot) return;

            const panel = modal.shadowRoot.querySelector('div.tooltip-container > dbx-dropdown-panel');
            if (!panel?.shadowRoot) return;

            console.log('Found the dropdown panel and its shadow root');

            const scrollWrapper = panel.shadowRoot.querySelector(
                "div.panel-wrapper > .main-wrapper > .scroll-wrapper"
            );
            if (!scrollWrapper) return;

            const firstItem = scrollWrapper.querySelector('dbx-dropdown-simple-item');
            if (!firstItem) return;

            const fiMainWrapper = firstItem.shadowRoot.querySelector('.main-wrapper');
            if (!fiMainWrapper) return;

            const txtWrapper = fiMainWrapper.querySelector("#dbx-overflow-span")
            if (!txtWrapper) return;

            txtWrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            txtWrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            txtWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            const dbInputText = document.querySelector(
                "body > app-root > app-app-main > dbx-ds-layout-wrapper > dbx-ds-layout > div > div > app-app-home > app-time-home > app-request-home > dbx-ds-modal-wrapper > dbx-ds-modal > div > app-request-attendance > div > form > div:nth-child(10) > db-input-text > dbx-ds-text-input"
            );

            if (!dbInputText?.shadowRoot) return;

            const textArea = dbInputText.shadowRoot.querySelector("#textArea");
            if (!textArea) return;

            // Example: set a value
            textArea.value = ".";

            // Trigger input/change events so Angular detects it
            textArea.dispatchEvent(new Event('input', { bubbles: true }));
            textArea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await page.waitForFunction(() => {
            const modal = document.querySelector(
                'body > app-root > app-app-main > dbx-ds-layout-wrapper > dbx-ds-layout > div > div > app-app-home > app-time-home > app-request-home > dbx-ds-modal-wrapper > dbx-ds-modal'
            );
            const buttonWrapper = modal?.shadowRoot?.querySelector('div.modal.is-open.is-right.modal-regular > div.footer > div > dbx-ds-button:nth-child(2)');
            const button = buttonWrapper?.shadowRoot?.querySelector('button');
            return !!button;
        }, { timeout: DEFAULT_TIMEOUT });

        await page.evaluate(() => {
            const modal = document.querySelector(
                "body > app-root > app-app-main > dbx-ds-layout-wrapper > dbx-ds-layout > div > div > app-app-home > app-time-home > app-request-home > dbx-ds-modal-wrapper > dbx-ds-modal"
            );
            if (!modal?.shadowRoot) return;

            const buttonWrapper = modal.shadowRoot.querySelector(
                "div.modal.is-open.is-right.modal-regular > div.footer > div > dbx-ds-button:nth-child(2)"
            );
            if (!buttonWrapper?.shadowRoot) return;

            const button = buttonWrapper.shadowRoot.querySelector("button");
            if (!button) return;

            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await waitForNetworkIdleSafe(page);
    } catch(err) {
        console.log('error while marking attendance');
        console.log(err);
    }
}

async function processApprovalQueue(page, credentials) {
    if (!credentials.markApproveAttendance && !credentials.approveLeaves) {
        return;
    }

    const url = `${config.baseUrl}/tasksApi/GetTasks`;
    await navigateToPage(page, url);

    if (credentials.markApproveAttendance) {
        console.log('Processing approval queue for attendance');
        await approveTaskType(page, {
            tabSelector: '#attendance_request',
            selectAllSelector: '.bulk-select-cell > .select-all',
            actionSelector: ".action-button[data-action='approve_request']",
            submitSelector: '.sidebar-form >  .sidebar-actions > div > button',
        });

        await approveTaskType(page, {
            tabSelector: '#attendance',
            selectAllSelector: '.bulk-check',
            actionSelector: ".open_filter[data-action='Approve']",
            submitSelector: '.sidebar-form .sidebar-actions .request-action .btn',
        });
    }

    if (credentials.approveLeaves) {
        await approveTaskType(page, {
            tabSelector: '#leave_task',
            selectAllSelector: '.bulk-select-cell > .select-all',
            actionSelector: ".action-button[data-action='approve_request']",
            submitSelector: '.sidebar-form >  .sidebar-actions > div > button',
        });
    }
}

async function approveTaskType(page, { tabSelector, selectAllSelector, actionSelector, submitSelector }) {
    try {
        const tab = await page.$(tabSelector);
        if (!tab) {
            return;
        }

        await tab.evaluate((el) => el.click());

        await clickWhenReady(page, selectAllSelector);
        await clickWhenReady(page, actionSelector);
        await clickWhenReady(page, submitSelector);
        await waitForNetworkIdleSafe(page);
    } catch (err) {
        console.log(err);
    }
}

async function navigateToPage(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForNetworkIdleSafe(page);
}

async function clickWhenReady(page, selector) {
    await page.waitForSelector(selector, { visible: true, timeout: DEFAULT_TIMEOUT });
    await page.click(selector);
}

async function waitForNetworkIdleSafe(page) {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => null);
}

async function fetchOtpWithRetry(userId, timeoutMs, intervalMs) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${config.otpBaseUrl}/v1/otp/${userId}/message`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (response.ok) {
                const data = await response.json();
                if (data && data.data) {
                    return data.data;
                }
            }
        } catch (error) {
            // Retry until timeout.
        }

        await sleep(intervalMs);
    }

    return null;
}

async function setupPagePerformance(page) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const resourceType = request.resourceType();
        const url = request.url();
        const shouldBlock =
            resourceType === 'image' ||
            resourceType === 'font' ||
            resourceType === 'media' ||
            /google-analytics|doubleclick|facebook|clarity|hotjar/i.test(url);

        if (shouldBlock) {
            request.abort();
            return;
        }

        request.continue();
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}



import config from './config.js';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';


(async () => {
    console.log('===================>>> Running on', new Date());
    const browser = await puppeteer.launch({
        args: ['--no-sandbox'],
        headless: config.isProduction,
    });

    try {
        for (let credentials of config.credentials) {
            console.log(credentials);
            let page = await doLogin(browser, credentials);
            await sleep(1000);

            await checkForOtpPage(page, credentials);
            await sleep(1000);

            await doSignOff(page);
            
            await markAttandance(page);

            if (credentials.markApproveAttendance) {
                await approveAttendance(page);
                await approveClockIn(page);
            }

            if (credentials.approveLeaves) {
                await approveLeaves(page);
            }

            await doLogOut(page);
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
        await sleep(5000);
        const isOtpPage = await page.evaluate(() => {
            return document.querySelector('#otp') !== null;
        });

        if (!isOtpPage) {
            return;
        }
        await sleep(5000);

        const response = await fetch(`${config.otpBaseUrl}/v1/otp/${credentials.id}/message`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} ${response.body}`);
        }
        console.log('Fetching OTP from external service...');
        const data = await response.json();
        if (data && data.data) {
            console.log('OTP received:', data.data);
            await page.$eval('#otp', (el, otp) => el.value = otp, data.data);
            
            await page.click('input[type="submit"][value="SUBMIT"]');
        } else {
            console.error('No OTP found in the response.');
        }
        await page.waitForFunction('document.readyState === "complete"');
    } catch (error) {
        console.error('Error checking for OTP page:', error);
    }
}

async function doSignOff(page) {
    try {
        console.log("Doing signoffs");
        await sleep(2000);
        let isSignOffExist = await page.evaluate(() => {
            let el = document.querySelector(".policies_sign_off")
            return !!el
        });

        if (isSignOffExist) {
            console.log("Doing signoffs");
            let maxSignOff = 10;
            let attribute = await getSignOffAttribute(page);
            await sleep(2000);
            while (attribute && maxSignOff--) {
                try {
                    await page.click('#'+attribute);
                } catch (error) {
                    console.log("The element didn't appear.")
                }
                await sleep(2000);
                attribute = await getSignOffAttribute(page);
                await sleep(2000);
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

    const loginPageUrl = `${config.baseUrl}/user/login`;


    await page.goto(loginPageUrl);

    await page.waitForFunction('document.readyState === "complete"');

    await page.$eval('#UserLogin_username', (el, credentials) => el.value = credentials.email, credentials);
    await page.$eval('#UserLogin_password', (el, credentials) => el.value = credentials.password, credentials);

    await page.click('#login-submit');

    await page.waitForFunction('document.readyState === "complete"');

    return page;
}

async function doLogOut(page) {
    const url = `${config.baseUrl}/user/logout`;
    await page.goto(url);
    await page.waitForFunction('document.readyState === "complete"');
    console.log('Logout done');
}

async function markAttandance(page) {
    const url = `${config.baseUrl}/ms/time/390335/attendance`;

    try {
        console.log('marking attendance');
        await page.goto(url);
        await page.waitForFunction('document.readyState === "complete"');

        await sleep(8000);

        await page.click('dbx-ds-button-wrapper[amplify-path="time-request-btn"]');

        await sleep(5000);

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

        await sleep(3000);

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

        await sleep(500);

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
    } catch(err) {
        console.log('error while marking attendance');
        console.log(err);
    }
}

async function approveClockIn(page) {
    const url = `${config.baseUrl}/tasksApi/GetTasks`;
    try {
        await navigateToPage(page, url, 1000);
        const attendanceRequest = await page.$('#attendance');

        if (!attendanceRequest) {
            return;
        }
        
        await attendanceRequest.evaluate(b => b.click());
        
        await  sleep(1000);

        await page.evaluate(() => {
            document.querySelector(".bulk-check").click();
        }); 

        await page.evaluate(() => {
            document.querySelector(".open_filter[data-action='Approve']").click();
        }); 

        await  sleep(2000);

        await page.evaluate(() => {
            document.querySelector(".sidebar-form .sidebar-actions .request-action .btn").click();
        });

        await  sleep(10000);
    } catch(err) {
        console.log(err);
    }
}

async function approveAttendance(page) {
    const url = `${config.baseUrl}/tasksApi/GetTasks`;
    try {
        await navigateToPage(page, url, 1000);
        const attendanceRequest = await page.$('#attendance_request');

        if (!attendanceRequest) {
            return;
        }
        
        await attendanceRequest.evaluate(b => b.click());
        
        await  sleep(1000);

        await page.evaluate(() => {
            document.querySelector(".bulk-select-cell > .select-all").click();
        }); 

        await page.evaluate(() => {
            document.querySelector(".action-button[data-action='approve_request']").click();
        }); 

        await  sleep(2000);

        await page.evaluate(() => {
            document.querySelector(".sidebar-form >  .sidebar-actions > div > button").click();
        });

        await  sleep(10000);
    } catch(err) {
        console.log(err);
    }
}

async function approveLeaves(page) {
    const url = `${config.baseUrl}/tasksApi/GetTasks`;
    try {
        await navigateToPage(page, url, 1000);
        const leaveRequest = await page.$('#leave_task');

        if (!leaveRequest) {
            return;
        }

        await leaveRequest.evaluate(b => b.click());

        await  sleep(1000);

        await page.evaluate(() => {
            document.querySelector(".bulk-select-cell > .select-all").click();
        });

        await page.evaluate(() => {
            document.querySelector(".action-button[data-action='approve_request']").click();
        });

        await  sleep(2000);

        await page.evaluate(() => {
            document.querySelector(".sidebar-form >  .sidebar-actions > div > button").click();
        });

        await  sleep(10000);
    } catch(err) {
        console.log(err);
    }
}

async function navigateToPage(page, url, sleepTime) {
    await page.goto(url);
    await page.waitForFunction('document.readyState === "complete"');

    if (sleepTime) {
        await  sleep(sleepTime);
    }
}


function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}



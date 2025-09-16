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

        await page.click('ui-dropdown-list ui-dropdown div > button');

        await sleep(1000);

        await page.click('ui-dropdown > div > div > div.db-dropdown-menu.floating-content > ul > li:nth-child(3) > a');

        await sleep(3000);

        const dropdownHandle = await page.$('dbx-dropdown');
        const shadowRootHandle = await dropdownHandle.evaluateHandle(el => el.shadowRoot);

        const choicesInnerHandle = await shadowRootHandle.$('.choices__inner');
        await choicesInnerHandle.click();

        await sleep(500);

        const firstOptionHandle = await shadowRootHandle.$('.choices__item--choice');
        if (firstOptionHandle) {
            await firstOptionHandle.click();
        } else {
            console.error('No dropdown options found');
        }

        await page.type('dbx-textinput >>> textarea', '.');

        await page.click('div.db-modal-footer.ng-star-inserted > div > button.db-btn.style-primary');
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



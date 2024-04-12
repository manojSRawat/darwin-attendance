const config = require('./config');
const puppeteer = require('puppeteer');

(async () => {
    console.log('===================>>> Running on', new Date());
    const browser = await puppeteer.launch({
        args: ['--no-sandbox'],
        headless: config.isProduction,
    });

    try {
        for (credentials of config.credentials) {
            console.log(credentials);
            let page = await doLogin(browser, credentials);
            await sleep(1000);

            await doSignOff(browser, page);

            await markAttandance(browser, page);

            if (credentials.markApproveAttendance) {
                await approveAttendance(browser, page);
                await approveClockIn(browser, page);
            }

            if (credentials.approveLeaves) {
                await approveLeaves(browser, page);
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

async function doSignOff(browser, page) {
    try {
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

async function markAttandance(browser, page) {
    const url = `${config.baseUrl}/attendance#`;

    try {
        console.log('marking attendance');
        await page.goto(url);
        await page.waitForFunction('document.readyState === "complete"');

        await sleep(1000);

        const button = await page.$('#attendance_request');
        await button.evaluate(b => b.click());
        await sleep(2000);

        await page.select('#AttendanceRequestForm_request_type', '2');
        await page.select('#reasons_value', 'a62df79c2a2839');
        await page.select('#AttendanceRequestForm_clock_out_hrs', '20');
        await page.$eval('#AttendanceRequestForm_message', el => el.value = '.');

        const submitButton = await page.$('#add_request_btn');
        await submitButton.evaluate(b => b.click());
    } catch(err) {
        console.log('error while marking attendance');
        console.log(err);
    }
}

async function approveClockIn(browser, page) {
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

async function approveAttendance(browser, page) {
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

async function approveLeaves(browser, page) {
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



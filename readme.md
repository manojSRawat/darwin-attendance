# Attendance automation

Dealing with attendance and approvals can be about as fun as watching paint dry. But don't worry, I'll take one for the team and handle all that boring stuff. You go focus on the exciting things, like brainstorming ways to make coffee taste even better!

---
# Pre-requisites
- Install [Node.js](https://nodejs.org/en/) version 16+


# Getting started
- Clone the repository
```
git clone  <project url>/darwin-attendance
```
- Install dependencies
```
cd darwin-attendance
npm install
```
- Build and run the project
```
npm start
```

## Configuring the project
Add URL and credentails in config.js
```js
{
    isProduction: true,
    baseUrl: 'https://company_name.darwinbox.in',
    otpBaseUrl: 'https://otp-server',
    credentials: [
        {
            email: 'someemail@gmail.com',
            password: 'some_password',
            markApproveAttendance: true
        }
    ]
}
```

# OTP
otpBaseUrl is requried if OTP is enabled

# Cron setup
On linux and mac you can type following command to setup a cron
```bash
crontab -e
```
add the following expression this will run the cron at 10:00 on every day-of-week from Tuesday through Saturday.

```text
0 10 * * 2-6 node /path/darwin_attendance/index.js >> /darwin_attendance/cron.log
```

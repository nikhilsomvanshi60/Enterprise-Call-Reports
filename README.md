# Enterprise Call Reports

Enterprise Call Reports is a two-port call logging system for mobile issue entry and PC dashboard management. It stores reports locally, exports Excel files, supports department/holiday tracking, and protects the admin dashboard with Windows local/domain login.

## What This App Does

- Mobile users open the logger on port `3000` and submit call/issue reports.
- Admin users open the dashboard on port `3001` and manage reports, exports, holidays, access users, and analytics.
- Reports are saved to local data files in `data/`.
- The mobile app can be exposed through Ngrok or localtunnel for phone access.
- The dashboard is restricted to selected Windows/domain users.

## Main URLs

When running on the server PC:

```text
Mobile logger:  http://<PC-IP>:3000
Admin login:    http://<PC-IP>:3001/login.html
```

Example:

```text
http://192.168.0.72:3000
http://192.168.0.72:3001/login.html
```

The startup BAT automatically detects the PC IP and opens the admin login page.

## Features

- Mobile report form with departments, issue details, actions, status, remarks, and dates.
- PC dashboard with search, filters, editable reports, delete, and styled Excel export.
- Animated modern dashboard UI with dark/light theme support.
- Ranked "Issues by Department" chart and issue status chart.
- Recent activity feed.
- Public holiday and personal leave management.
- Security PIN for mobile/admin report APIs.
- Windows local/domain login for dashboard access.
- Selected-user access list from the dashboard.
- Automatic report storage in JSON, CSV, and Excel formats.
- Daily backup support in `data/backups/`.
- Optional Ngrok static domain tunnel.

## Project Structure

```text
call-logger/
  data/
    backups/                  Daily backup files
    departments.json          Department dropdown list
    holidays.json             Holiday/leave data
    network_config.json       Ports and dashboard access users
    reports.csv               CSV report database
    reports.xlsx              Excel report database
    security_config.json      Hashed mobile/admin PIN
  public/
    app.js                    Mobile logger logic
    dashboard.html            Admin dashboard page
    dashboard.js              Dashboard logic and charts
    index.html                Mobile logger page
    login.html                Windows/domain login page
    style.css                 Shared UI styling
    tunnel_info.txt           Generated tunnel information
  screenshots/
    dashboard_view.png
    mobile_view.png
  server.js                   Node/Express backend
  Start_Logger_Server.bat     Recommended Windows launcher
  start_server.bat            Wrapper launcher
  setup_ngrok.bat             Ngrok setup helper
  package.json
```

## Requirements

- Windows PC recommended.
- Node.js installed and available in PATH.
- Network access allowed through Windows Firewall for ports `3000` and `3001`.
- For domain login, the PC should be able to reach the domain controller.
- Optional: Ngrok account and static domain if global mobile access is needed.

## Install From GitHub

Clone the repository:

```bash
git clone https://github.com/nikhilsomvanshi60/Enterprise-Call-Reports.git
cd Enterprise-Call-Reports
```

Install dependencies:

```bash
npm install
```

## Run The App

### Recommended: Windows BAT

Double-click:

```text
Start_Logger_Server.bat
```

The BAT file will:

- Switch to the project folder automatically.
- Detect the PC LAN IP.
- Install dependencies if `node_modules` is missing.
- Start the Node server with `npm.cmd start`.
- Open the admin login page with the detected IP.

### Manual Terminal Run

```bash
npm start
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd start
```

## How Login Works

The app uses two different security layers.

### Mobile/API PIN

Mobile report APIs use a security PIN stored as a SHA-256 hash in:

```text
data/security_config.json
```

Default PIN is created as `8989` if no security config exists. You can change the PIN from the dashboard using "Change PIN".

### Dashboard Windows Login

The PC dashboard runs on port `3001` and uses Windows credential validation.

Local PC login:

```text
Domain / PC Name: .
Username: Administrator
Password: local Windows Administrator password
```

Domain login:

```text
Domain / PC Name: YOUR_DOMAIN
Username: selected domain username
Password: domain password
```

The dashboard only opens for users listed in `data/network_config.json`.

## Selected Dashboard Users

Current config example:

```json
{
  "bindIp": "0.0.0.0",
  "mobilePort": 3000,
  "dashboardPort": 3001,
  "allowedDomainUsers": [
    ".\\Administrator",
    "infodba"
  ],
  "allowedDomainGroups": [],
  "enableADAuth": true
}
```

Rules:

- `".\\Administrator"` allows the local PC Administrator account.
- `"infodba"` allows only that selected domain/local user name.
- `"DOMAIN\\username"` can be used for an exact domain user.
- `allowedDomainGroups` is empty by default, so domain groups do not automatically get access.
- If a user is not in `allowedDomainUsers`, login is denied even if the password is correct.

### Add Or Remove Users From Dashboard

1. Login as local `.\Administrator` or another already allowed admin.
2. Click `Access Users`.
3. Add a user like:

```text
DOMAIN\username
```

or:

```text
username
```

4. Remove users that should no longer have dashboard access.

The local Administrator entry is protected so the PC can still recover access.

## Departments

Department dropdown values are stored in:

```text
data/departments.json
```

Example:

```json
[
  "Design",
  "Elec.Design",
  "Accounts",
  "QC",
  "Store",
  "Mktg",
  "Service",
  "Logistics",
  "Maint Dept",
  "Spear P5",
  "P3 CNC",
  "HR & Admin"
]
```

After editing departments, refresh the browser. Restart the server if the old list still appears.

## Data Files

Reports are stored in:

```text
data/reports.csv
data/reports.xlsx
```

Other data files:

```text
data/holidays.json
data/departments.json
data/network_config.json
data/security_config.json
```

Backups are stored in:

```text
data/backups/
```

## Excel Export

The dashboard can export filtered report data to a styled Excel workbook. The export includes report rows and can include holiday/leave styling when configured in the dashboard.

## Tunnel / Mobile Internet Access

On startup, the server tries to expose the mobile app on port `3000`.

Order:

1. Ngrok static domain if `data/ngrok_config.json` exists.
2. localtunnel fallback.
3. localhost.run fallback.

To configure Ngrok:

```text
setup_ngrok.bat
```

You will need your own Ngrok authtoken and static domain. Do not commit secrets or tokens to GitHub.

Generated tunnel info is written to:

```text
public/tunnel_info.txt
```

## API Overview

Mobile app APIs on port `3000` use PIN token auth:

```text
GET    /api/departments
POST   /api/departments
GET    /api/reports
POST   /api/reports
PUT    /api/reports/:id
GET    /api/holidays
POST   /api/holidays
DELETE /api/holidays/:id
POST   /api/security/update-pin
GET    /api/tunnel-info
```

Dashboard APIs on port `3001` use Windows login session auth:

```text
POST   /api/auth/domain-login
GET    /api/access/users
POST   /api/access/users
DELETE /api/access/users
GET    /api/reports
PUT    /api/reports/:id
DELETE /api/reports/:id
POST   /api/reports/export
GET    /api/holidays
POST   /api/holidays
DELETE /api/holidays/:id
GET    /api/tunnel-info
```

## Troubleshooting

### `npm.ps1 cannot be loaded`

Use:

```powershell
npm.cmd start
```

The BAT launcher already uses `npm.cmd`.

### Port already in use

If port `3000` or `3001` is busy, stop the old Node process or close the old server window.

PowerShell check:

```powershell
Get-NetTCPConnection -LocalPort 3000,3001
```

### Dashboard keeps returning to login

Clear browser session storage or login again:

```text
http://<PC-IP>:3001/login.html
```

The login page passes a temporary session token to `dashboard.html`.

### Local Administrator cannot login

Check:

- The Windows `Administrator` account is enabled.
- Password is not blank.
- Use domain field `.`.
- Use username `Administrator`.
- The account is present in `allowedDomainUsers` as `".\\Administrator"`.

### Domain user password works but access denied

The credential is valid, but the user is not in the selected access list. Add the user from `Access Users` or edit:

```text
data/network_config.json
```

### Mobile cannot open by IP

Check:

- Phone and PC are on the same network.
- Windows Firewall allows Node.js.
- Server is bound to `0.0.0.0`.
- Use `http://<PC-IP>:3000`, not localhost from the phone.

## Useful Commands

Run server:

```bash
npm start
```

Syntax check:

```bash
node --check server.js
node --check public/dashboard.js
```

Check Git status:

```bash
git status -sb
```

Push to GitHub:

```bash
git add .
git commit -m "Update app"
git push origin main
```

## Notes For Maintainers

- Do not commit real passwords, Ngrok authtokens, or private domain credentials.
- `data/reports.xlsx` and screenshots can change when the app runs or screenshots are regenerated.
- Dashboard auth is controlled by `data/network_config.json`.
- Mobile PIN auth is controlled by `data/security_config.json`.
- If changing ports, update `data/network_config.json` and restart the server.

## Screenshots

Dashboard:

![Dashboard](screenshots/dashboard_view.png)

Mobile:

![Mobile](screenshots/mobile_view.png)

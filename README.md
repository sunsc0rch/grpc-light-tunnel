1.Deploy this to your hosting:
npm install
npm run generate-cert
npm start
2.Start client on your local computer:
cd client
npm install

# Linux/Mac
export SERVER_URL=your-server.com:3000
export LOCAL_APP_URL=http://localhost:8100
export USE_HTTP2=true
node client.js

# Windows PowerShell
$env:SERVER_URL="your-server.com:3000"
$env:LOCAL_APP_URL="http://localhost:8100"
$env: USE_HTTP2="true"
node client.js
3.Open in browser:
https://your-server.com

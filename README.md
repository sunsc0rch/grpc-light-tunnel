1.Deploy this to your hosting:

npm install
npm start

2.Start client on your local computer:

cd client
npm install

# Linux/Mac
export SERVER_URL=https://random.stormkit.dev; export LOCAL_APP_URL=http://localhost:8100; export USE_HTTP2=true; node ./laptop/client.js

# Windows PowerShell
$env:SERVER_URL="https://random.stormkit.dev"
$env:LOCAL_APP_URL="http://localhost:8100"
$env: USE_HTTP2="true"
node client.js
3.Open in browser:
https://random.stormkit.dev

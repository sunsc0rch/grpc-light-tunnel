0.a.Change serverUrl in laptop/client.cjs to your hosting generated url:

example:

serverUrl: config.serverUrl || 'https://random.stormkit.dev',
b.Change locaAppUrl in laptop/client.cjs to your local app url:

example:

localAppUrl: config.localAppUrl || 'http://localhost:3000',

1.Deploy this to your hosting:

npm install

npm start

2.Start client on your local computer:

cd laptop/

npm install

# Linux/Mac
node ./laptop/run.js
# Windows PowerShell

node run.js

3.Open in browser:
https://random.stormkit.dev

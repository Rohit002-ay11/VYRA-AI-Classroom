# VYRA AI Classroom v25 — Standalone PWA

## Local Android / Termux
1. `npm install`
2. Copy your existing `corpus/*` into this project's `corpus/` folder.
3. `export HF_TOKEN='YOUR_HF_TOKEN'`
4. `npm start`
5. Open `http://localhost:8093` in Chrome.
6. Chrome menu → Add to Home screen / Install app.

The PWA has standalone display mode, manifest, icons and a service worker.

## Public deployment
This project is prepared for a Node web service such as Render. Set `HF_TOKEN` as a server environment variable; never put the token in `index.html`.

The public deployment must include the local NCERT corpus files in `corpus/` if you want the deployed instance to remain NCERT-grounded. Do not commit secrets.

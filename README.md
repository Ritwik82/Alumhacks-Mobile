# Alumhacks Mobile

A mobile-first Ginjer device monitoring frontend. Expo Go opens the web UI inside a React Native WebView; the local Node server serves the UI and securely proxies Ginjer API requests during development.

## Run on a phone with Expo Go

Requirements: Node.js 18 or newer, npm, Expo Go on the phone, and the phone and computer on the same trusted Wi-Fi network.

### Windows quick start

1. Install dependencies once: `npm install`.
2. Run `Start Alumhacks Mobile.bat`. It opens one terminal for the backend and one for Expo.
3. Wait for Expo to show its QR code and scan it with Expo Go.
4. In Alumhacks Mobile, enter the `Phone on the same Wi-Fi` URL printed by the backend terminal (for example, `http://192.168.1.20:8787`).
5. Keep both terminals open while using the app. If Windows Firewall asks, allow Node.js on private networks only.

### macOS or Linux

From this folder, use two terminals:

```sh
npm install
npm run backend
```

In the second terminal:

```sh
npm start -- --lan
```

Scan the Expo QR code using Expo Go, then enter the private Wi-Fi URL printed by the backend in the app.

## Edit the app

- `index.html` contains the UI, styles, and screen navigation.
- `ginjer-api.js` handles Ginjer sign-in, project/device data, map markers, and downlinks.
- `server.js` is the local Node backend and same-origin Ginjer proxy.
- `App.js` and `app.json` are the Expo Go WebView shell and Expo configuration.

After editing the UI or API adapter, reload the app in Expo Go. For backend changes, restart the backend terminal too.

## Data and map notes

Use **Preview demo data** to explore without signing in. To load live data, sign in with your own Ginjer account or use your own API token in the app. Credentials and tokens are held in backend memory and are not stored in this repository. Never commit a real token or password.

The interactive map uses Leaflet and OpenStreetMap tiles, so map tiles need internet access. Device pins appear only when Ginjer returns valid device coordinates. Keep OpenStreetMap attribution visible. The local backend is intended for a trusted private Wi-Fi network during development; do not expose it to the public internet or configure router port forwarding.

The Expo Go version is a development preview, not a standalone installable app. The local backend must be running on the computer while the phone uses the app.


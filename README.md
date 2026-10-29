# Alumhacks Mobile

A mobile-first Ginjer device-monitoring app built with **React Native and Expo**. The screens are native React Native components; the app does not use a WebView. Ginjer requests go through the small Node backend in `server.js` so phone clients can use the API without browser CORS issues.

## Run on a phone with Expo Go

Requirements: Node.js 18 or newer, npm, Expo Go on the phone, and the phone and computer on the same trusted Wi-Fi network.

### Windows quick start

1. Install dependencies once: `npm install`.
2. Run `Start Alumhacks Mobile.bat`. It opens one terminal for the backend and one for Expo.
3. Wait for Expo to show its QR code and scan it with Expo Go.
4. In Alumhacks Mobile, enter the `Phone on the same Wi-Fi` URL printed by the backend terminal, such as `http://192.168.1.20:8787`.
5. Keep both terminals open while using the app. If Windows Firewall asks, allow Node.js on private networks only.

### macOS or Linux

In the first terminal, run:

```sh
npm install
npm run backend
```

In a second terminal, run:

```sh
npm start -- --lan
```

Scan the Expo QR code using Expo Go, then enter the private Wi-Fi URL printed by the backend in the app.

## Edit the app

- `App.js` contains the native screens, navigation, device map, and interactions.
- `src/api.js` contains Ginjer GraphQL requests and response normalization.
- `server.js` stores a Ginjer token in memory and proxies GraphQL requests.
- `assets/reference/` contains the small images used by the React Native screens.

After editing, reload the app in Expo Go. Restart the backend terminal after changing `server.js`.

## Data and map notes

Use **Preview demo data** to explore without signing in. For live data, use your own Ginjer account or token. Credentials and tokens are held in backend memory; do not commit a real token or password.

The device map uses `react-native-maps` and platform maps. In Expo Go it works without adding a Google Maps API key. A standalone Android build requires a restricted Google Maps API key in the native app configuration. The map shows pins only when Ginjer returns valid device coordinates. Keep the app and backend on a trusted private Wi-Fi network; do not expose the backend to the public internet or configure router port forwarding.

The Expo Go app is a development preview. The backend must be running on the computer while the phone uses the app.

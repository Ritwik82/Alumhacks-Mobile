# Run Alumhacks Mobile on your phone

This is a React Native app built with Expo. Its screens are native React Native components, including the device map. It does not load the interface from a WebView. A small local backend is still required to securely proxy Ginjer API calls.

## Development with Expo Go

1. Install **Expo Go** on your Android or iPhone.
2. Connect the phone and computer to the same trusted Wi-Fi network.
3. On Windows, double-click **Start Alumhacks Mobile.bat**. On macOS or Linux, run `npm run backend` in one terminal and `npm start -- --lan` in another.
4. Wait for Expo to show the QR code and scan it with Expo Go.
5. In Alumhacks Mobile, enter the backend address beginning `Phone on the same Wi-Fi:` from the backend terminal, such as `http://192.168.1.20:8787`.

Keep both command windows open while using the app. If Windows Firewall asks, allow Node.js on **Private networks** only. Do not allow public networks or configure router port forwarding.

## Installable app package

Expo Go is for development previews. An installable APK or iOS app requires a native build (commonly EAS Build) and a configured signing account. A standalone Android build also needs a restricted Google Maps API key; Expo Go's bundled app configuration is sufficient for map testing.

## API and credentials

The phone sends Ginjer requests to the local Node backend on the computer. The backend keeps the token in memory and proxies requests to Ginjer. Use your own account or token, never commit credentials, and keep the backend on a trusted private network.

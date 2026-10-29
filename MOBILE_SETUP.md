# Run Alumhacks on your phone

This project keeps its existing HTML/CSS/JavaScript frontend and opens it inside an Expo WebView. It does not rewrite the interface as native React Native screens.

## Development with Expo Go

1. Install **Expo Go** on your Android or iPhone.
2. Connect the phone and computer to the same trusted Wi-Fi network.
3. On the computer, double-click **Start Alumhacks Mobile.bat**.
4. In the server window, find the line beginning `Phone on the same Wi-Fi:`. It prints the address to use, such as `http://192.168.1.20:8787`.
5. In the Expo window, wait for the QR code. Open Expo Go on the phone and scan it.
6. In Alumhacks Mobile, enter the server URL from step 4 and tap **Open Alumhacks**.

Keep both command windows open while using the app. If Windows Firewall asks whether Node.js can accept private network connections, allow it on **Private networks** so the phone can connect. Do not allow public networks or configure router port forwarding.

If Expo Go is already open, you can use `npx expo start --lan` from this folder. Start the backend separately with **Start Alumhacks.bat**. The server prints the same phone URL in its command window.

## Installable app package

Expo Go is for development previews. Creating an installable Android APK or iOS app requires a native build (commonly EAS Build) and a configured signing account. This wrapper still needs the computer backend running on the same Wi-Fi because Ginjer tokens are held in that backend's memory.

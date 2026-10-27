# INCLUVIA AI — One Intelligence. Every Ability.

INCLUVIA AI is a lightweight accessibility prototype with four connected tools: **Drishti** for image text reading, **Shruti** for recorded speech transcription, **Gati** for basic road routes, and **Communication** for phrase and speech support. The interface follows the supplied editorial landing-page reference and adapts to mobile screens.

This is a first prototype, not a certified assistive device. It does not verify route accessibility, provide live captions, or describe scenes in images.

## Features and current status

- **Drishti:** image upload and camera capture, client-side English OCR with Tesseract.js, copy and browser read-aloud controls. OCR requires an internet connection the first time so the OCR library can load. No image is uploaded by this feature. Scene understanding is not available.
- **Shruti:** permission-based microphone recording, local WAV conversion, audio-file selection, language choice, and secure server-side transcription connector for Gnani Prisma v2.5. The connector needs a valid API key and account access. Without it, the app reports that configuration is missing.
- **Gati:** manually entered places or optional current location, user-triggered OpenStreetMap Nominatim place lookup, and OSRM driving-route distance/time. Public services can be unavailable or rate-limited. Route results do **not** establish wheelchair access, step-free access, surface quality, ramps, or stairs. Location and place queries are sent to OpenStreetMap services when requested.
- **Communication:** ten preset phrases, custom text, copy, device speech synthesis, rate and voice selection where supported. Custom phrases are not saved.
- **Settings:** larger text, high contrast, reduced motion, and clearing local preferences. Only these preferences are stored in local browser storage.

## Requirements

- Node.js 18 or newer (no package installation is needed).
- A modern browser. Camera and microphone generally require `localhost` or HTTPS and explicit browser permission.
- Internet access for the optional OCR engine, route services, and Gnani transcription.

## Run locally

1. Open a terminal in the project folder.
2. Start the app:

   ```powershell
   npm start
   ```

3. Open <http://localhost:4173> in a browser.

There are no npm dependencies to install. To use another port, set `$env:PORT=5000` before `npm start`.

## Configure Gnani Prisma transcription

The Shruti connector uses the currently documented short-clip REST API for **Gnani Prisma v2.5**. It sends the chosen audio file and `language_code` as multipart form fields to `https://api.vachana.ai/stt/v3`, authenticates with `X-API-Key-ID`, and reads the returned `transcript`. The browser sends the file to this app’s `/api/transcribe`; the private API key is used only by `server.js` and is never included in frontend JavaScript.

1. Obtain an API key and confirm your account has API access/credits with Gnani. This repository cannot verify the user’s account or program credits.
2. Copy `.env.example` to `.env` in the project folder.
3. Put your key after `GNANI_API_KEY=` in `.env`. Do not share or commit `.env`.
4. Restart `npm start`, record a short clip or choose an audio file, and press **Transcribe with Gnani** only when you intend to send that audio.

The connector limits the request to 15 MB, applies a 45-second upstream timeout, validates the selected file type, and returns readable errors. Gnani’s REST documentation describes clips up to 60 seconds; keep audio short. The app does not automatically retry or log uploaded audio. API access and credits are required; this integration has **not** been tested against an account/API key in this workspace.

## Checks

Run the automated server and connector tests, then check JavaScript syntax:

```powershell
npm test
npm run check
```

The automated suite covers app assets, missing credentials, malformed paths, audio format and size validation, the documented Gnani request shape, provider error handling, Gati's coordinate format, and the key media/speech controls. The app is served directly by Node with no install step or production bundler.

Manual browser checks in headless Edge verified camera capture and track shutdown, fake-microphone recording and WAV conversion, the permission-denial message, settings persistence, phrase display and speech controls, and a live route result. Three generated English text samples were recognized exactly by the real OCR engine. These checks do not test every physical microphone or camera. The Gnani connector was tested with mocked provider responses, not with an API key or account; real transcription still requires credentials and a microphone permission granted by the browser and operating system.

## Privacy notes

- Images stay in the browser; OCR code is fetched from jsDelivr when the user starts OCR.
- Recorded audio is held in the page, converted locally, and sent only after the user presses Transcribe. When configured, the audio is forwarded to Gnani for processing.
- Gati sends entered place names or selected location coordinates to OpenStreetMap Nominatim and route coordinates to the public OSRM demo service. Use generic places for testing, not private addresses. These community services have fair-use limits and can change availability.
- No account, analytics, advertising, or background recording is included.
- Preference storage is local to the browser. Clearing preferences removes those settings.

## Limitations and next steps

- No verified account credentials were provided, so the real Gnani API call and available credits could not be confirmed. The connector follows the official REST schema, but account access remains to be tested.
- Gati is a basic driving route demo and is not an accessible-routing product.
- OCR currently recognizes English (`eng`) only. Scene understanding and offline OCR are not included.
- Browser speech voices, speech controls, and media formats differ by device.
- Accessibility review with disabled users and assistive technology remains necessary before practical deployment.

## Demo outline

1. Explain the goal: four small accessibility supports in one place.
2. Show the dashboard and responsive tool cards.
3. Upload a printed-text image in Drishti, run OCR, and read the result aloud.
4. In Shruti, record a short sample, review it, then explicitly submit it. Show the real Prisma transcript only after configuring and verifying an authorized key.
5. Show a Gati route and point out the accessibility limitation.
6. Select a Communication phrase and use browser speech; finish with accessibility settings and the privacy controls.

## Official integration references

- [Gnani Speech-to-Text REST](https://docs.gnani.ai/api/STT/speech-to-text)
- [Gnani API quick start](https://docs.gnani.ai/api/introduction/quick-start)
- [OpenStreetMap Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [OSRM route API](https://project-osrm.org/docs/v5.24.0/api/)

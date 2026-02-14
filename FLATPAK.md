
# VectorAI Flatpak Deployment

To build and install VectorAI as a Flatpak locally on your Linux machine, follow these steps:

## 1. Install Prerequisites
Ensure you have `flatpak` and `flatpak-builder` installed:
```bash
sudo apt update
sudo apt install flatpak flatpak-builder
```

## 2. Add the Flathub Repository
```bash
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

## 3. Build the Application
Navigate to the root of the project and build the web assets first, then the Flatpak:
```bash
# Build the React app
npm install
npm run build

# Build the Flatpak
flatpak-builder --user --install --force-clean build-dir flatpak/org.vectorai.VectorAI.yml
```

## 4. Run the Application
```bash
flatpak run org.vectorai.VectorAI
```

## Note on API Keys
For the Gemini AI features to work in the Flatpak, you should either:
1. Provide the `API_KEY` during build in the manifest.
2. Or use the "Offline Mode" which is the default for VectorAI to avoid network dependencies.


#!/bin/sh
# Simple wrapper to launch the bundled web app in a standalone electron or browser shell
exec electron /app/share/vectorai/index.html "$@"

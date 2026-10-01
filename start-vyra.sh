#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/storage/downloads/VYRA25/VYRA_v25" || exit 1
export PORT=8093
# Keep the server alive if launched from a Termux session.
exec npm start

VYRA AI Classroom v22 — NCERT Grounded Engine

WHAT CHANGED
- Preserved the v21 classroom UI and AI Chat UI.
- Added a local NCERT retrieval layer between the student request and the Hugging Face model.
- Schedule Class now retrieves relevant NCERT evidence before lesson generation.
- AI Chat also retrieves relevant NCERT evidence for Class 9-12 questions when indexed.
- Added duplicate-concept filtering so repeated points/slides are removed after generation.
- Added /api/corpus-status and corpus count to /health.
- The seed curriculum currently includes the current Class 10 Science chapter map (jesc101-jesc113) from the official NCERT textbook system. The architecture is designed to expand to Classes 9-12 and more subjects.

IMPORTANT
The ZIP does NOT bundle copyrighted NCERT textbook PDFs. Instead, the setup script downloads the official NCERT chapter PDFs into the local corpus on your device and extracts searchable chunks. This keeps the app's distributed package small and avoids redistributing textbook content.

TERMUX SETUP
1. Extract the ZIP.
2. Enter the folder containing package.json and server.mjs.
3. Install the dependency:
   npm install
4. Set your Hugging Face token in the current Termux session:
   export HF_TOKEN='YOUR_HF_TOKEN_HERE'
5. Build the NCERT corpus once:
   npm run setup-corpus
6. Start VYRA:
   npm start
7. Open:
   http://localhost:8093

If you open a new Termux session later, export HF_TOKEN again before npm start unless you have saved it in your shell environment.

VERIFY
Open:
   http://localhost:8093/health
It should show aiConnected:true and corpusChunks greater than 0.

CURRENT CORPUS SEED
Class 10 Science — 13 chapter PDFs, using official NCERT PDF URLs based on the chapter codes in the current textbook structure.
Official textbook index: https://ncert.nic.in/textbook.php?jesc1=0-16

FUTURE EXPANSION
Add more books to ncert/curriculum.json, then run npm run setup-corpus again. The retrieval and lesson planner do not need to be rewritten for every subject.

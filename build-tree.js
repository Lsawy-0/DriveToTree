// build-tree.js (works on Windows locally + inside n8n container)

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ضع هنا الـ ROOT_FOLDER_ID بتاع جوجل درايف (المجلد الجذر)
const ROOT_FOLDER_ID = "1uflYiriMVeBCDLk9ndkXSJXmYp367T-T";

// --- Helpers: resolve paths smartly ---
function resolveExistingPath(candidates) {
  for (const p of candidates) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

async function main() {
  if (!ROOT_FOLDER_ID) {
    throw new Error('ROOT_FOLDER_ID is not set.');
  }

  // 1) Resolve credentials.json path
  const keyFilePath = resolveExistingPath([
    process.env.GOOGLE_APPLICATION_CREDENTIALS,                          // e.g. set by n8n Deploy node
    path.join(__dirname, 'credentials.json'),                            // local run (same folder as project)
    '/project/credentials.json',                                         // n8n container mount
  ]);

  if (!keyFilePath) {
    throw new Error(
      'credentials.json not found. Set GOOGLE_APPLICATION_CREDENTIALS or put credentials.json next to build-tree.js or at /project/credentials.json'
    );
  }

  // 2) Resolve "public" folder
  const publicDirPath = fs.existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : '/project/public';

  const treeDataPath = path.join(publicDirPath, 'tree_data.json');

  console.log('=== DriveToTree Build ===');
  console.log('ROOT_FOLDER_ID:', ROOT_FOLDER_ID);
  console.log('Using credentials:', keyFilePath);
  console.log('Public dir:', publicDirPath);
  console.log('Output file:', treeDataPath);

  // 3) Auth with Google
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  // 4) Recursive listing
  async function getAllFiles(folderId) {
    let allFiles = [];
    let pageToken = null;

    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, parents, webViewLink)',
        pageToken,
        pageSize: 1000,
      });

      const files = res.data.files || [];
      for (const file of files) {
        allFiles.push(file);
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const subFiles = await getAllFiles(file.id);
          allFiles = allFiles.concat(subFiles);
        }
      }
      pageToken = res.data.nextPageToken || null;
    } while (pageToken);

    return allFiles;
  }

  console.time('FetchDrive');
  console.log('Fetching files from Google Drive…');
  const fileList = await getAllFiles(ROOT_FOLDER_ID);
  console.timeEnd('FetchDrive');
  console.log(`Total items fetched: ${fileList.length}`);

  // 5) Build tree structure
  const tree = {};
  const map = {};

  for (const file of fileList) {
    if (!file) continue;
    map[file.id] = {
      name: file.name,
      link: file.webViewLink,
      children: {},
    };
  }

  for (const file of fileList) {
    if (!file) continue;
    const isDirectChildOfRoot =
      !file.parents || file.parents.length === 0 || file.parents[0] === ROOT_FOLDER_ID;

    if (isDirectChildOfRoot) {
      if (map[file.id]) tree[file.name] = map[file.id];
      continue;
    }

    const parentId = file.parents[0];
    if (map[parentId] && map[file.id]) {
      map[parentId].children[file.name] = map[file.id];
    } else if (map[file.id]) {
      // Orphan fallback
      tree[file.name] = map[file.id];
    }
  }

  // 6) Ensure public dir + write JSON
  fs.mkdirSync(publicDirPath, { recursive: true });
  fs.writeFileSync(treeDataPath, JSON.stringify(tree, null, 2));
  console.log(`✅ Successfully generated: ${treeDataPath}`);
}

main().catch((err) => {
  console.error('❌ An error occurred:', err);
  process.exit(1);
});

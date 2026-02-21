const fs = require('fs');
const cp = require('child_process');

try {
    const filePath = 'C:/Users/chira/Downloads/cozy-campus-firebase-adminsdk-fbsvc-2f23f603fc.json';
    const jsonRaw = fs.readFileSync(filePath, 'utf8');
    const jsonMinified = JSON.stringify(JSON.parse(jsonRaw));

    console.log('Minified JSON length:', jsonMinified.length);

    // Use an array for cross-platform safety with execFile or spawn, 
    // but for secrets set we need the NAME=VALUE pair.
    const secretPair = `FIREBASE_SERVICE_ACCOUNT_JSON=${jsonMinified}`;

    console.log('Uploading secret to Supabase...');
    const result = cp.spawnSync('npx', ['supabase', 'secrets', 'set', secretPair, '--project-ref', 'bvoliuqqsgekkuhuupva'], {
        shell: true,
        encoding: 'utf8'
    });

    if (result.error) {
        console.error('Spawn Error:', result.error);
    }

    console.log('STDOUT:', result.stdout);
    console.log('STDERR:', result.stderr);

} catch (err) {
    console.error('Script Error:', err.message);
}

const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'web', 'app.js');

try {
  let appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // Load backend URL from Vercel build environment
  const backendUrl = process.env.BACKEND_URL || 'https://fras-backend-api.onrender.com';
  console.log(`[Vercel Build] Injecting default BACKEND_URL: ${backendUrl}`);

  // Replace the default fallback URL in app.js constructor
  const targetRegex = /this\.backendUrl = localStorage\.getItem\('fras_backend_url'\) \|\| '[^']*';/;
  const replacement = `this.backendUrl = localStorage.getItem('fras_backend_url') || '${backendUrl}';`;

  if (targetRegex.test(appJsContent)) {
    appJsContent = appJsContent.replace(targetRegex, replacement);
    fs.writeFileSync(appJsPath, appJsContent, 'utf8');
    console.log(`[Vercel Build] Successfully injected backend URL into app.js!`);
  } else {
    console.log(`[Vercel Build] Warning: Target backendUrl line not found in app.js. Default value was not replaced.`);
  }
} catch (error) {
  console.error(`[Vercel Build] Error during injection: ${error.message}`);
}

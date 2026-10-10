// Syntax-checks the script injected into proxied pages. It is built inside a template string,
// where a wrongly escaped backslash silently breaks the whole script in the browser.
import { clientScript } from '../src/client.js';

const js = clientScript('https://example.com/').replace(/^<script>/, '').replace(/<\/script>$/, '');
try {
  new Function(js);
  console.log('client script: ok');
} catch (e) {
  console.error('client script is invalid:', e.message);
  process.exit(1);
}

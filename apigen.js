/*
   apiGen: generates a complete Node.js REST API project (Express 5 + MongoDB/Mongoose 9) from a model you describe.
   ApiGen.build(spec) is a pure function (no DOM): it returns { files, errors }, so it can be tested in Node too.
   The UI code at the bottom only runs in a browser.
*/
const ApiGen = (() => {
  const JS_RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for ' +
    'function if import in instanceof let new null return super switch this throw true try typeof var void while with yield ' +
    'await static implements interface package private protected public arguments eval undefined NaN Infinity').split(' '));
  /* names the generated server.js already uses */
  const TAKEN = new Set('express mongoose cors app port router start require module exports process console req res next err dotenv'.split(' '));
  const GLOBALS = new Set('Error Object Array String Number Boolean Date Promise JSON Math Map Set WeakMap WeakSet Symbol RegExp Function Reflect Proxy Intl BigInt Buffer URL Schema'.split(' '));
  const SYSTEM_FIELDS = new Set(['_id', 'id', '__v']);
  const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  /* English plurals, used for the URL path AND the collection name (passed to mongoose.model so they always match) */
  const IRREGULAR = { person: 'people', child: 'children', man: 'men', woman: 'women', mouse: 'mice', goose: 'geese', tooth: 'teeth',
    foot: 'feet', datum: 'data', ox: 'oxen', criterion: 'criteria', analysis: 'analyses', thesis: 'theses', crisis: 'crises', index: 'indexes' };
  const SAME = new Set(['series', 'species', 'news', 'fish', 'sheep', 'deer', 'equipment', 'information', 'rice', 'money', 'feedback', 'data']);
  const F_TO_VES = new Set(['leaf', 'knife', 'wolf', 'life', 'wife', 'half', 'shelf', 'loaf', 'thief', 'calf', 'elf', 'self']);
  const O_TO_OES = new Set(['hero', 'potato', 'tomato', 'echo', 'veto', 'torpedo']);
  function pluralize(word) {
    const w = String(word);
    const lower = w.toLowerCase();
    const keep = s => w === lower ? s : w[0] + s.slice(1);   // keep a leading capital
    if (SAME.has(lower)) return w;
    if (IRREGULAR[lower]) return keep(IRREGULAR[lower]);
    if (F_TO_VES.has(lower)) return keep(lower.replace(/fe?$/, 'ves'));
    if (O_TO_OES.has(lower)) return w + 'es';
    if (/quiz$/i.test(w)) return w + 'zes';
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es';
    return w + 's';
  }

  const pascal = s => String(s).trim().replace(/[^A-Za-z0-9]+(.)?/g, (m, c) => (c ? c.toUpperCase() : '')).replace(/^./, c => c.toUpperCase());
  const camel = s => { const p = pascal(s); return p.charAt(0).toLowerCase() + p.slice(1); };
  const kebab = s => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";   // a safe single-quoted JS string

  /* the connection string that goes in .env (never in server.js) */
  function connectionString(c) {
    const db = (c.database || '').trim();
    if (c.mode === 'uri') return (c.uri || '').trim();
    if (c.mode === 'local') return 'mongodb://127.0.0.1:27017/' + db;
    let host = (c.host || '').trim().replace(/^mongodb(\+srv)?:\/\//i, '').replace(/^[^@/]*@/, '').replace(/[/?].*$/, '');
    return 'mongodb+srv://' + encodeURIComponent((c.user || '').trim()) + ':' + encodeURIComponent(c.password || '') + '@' + host + '/' + db +
      '?retryWrites=true&w=majority';
  }

  function validate(spec) {
    const errors = [];
    const model = pascal(spec.model || '');
    if (!model) errors.push('Enter a model name: the singular name of one record.');
    else if (!IDENT.test(model) || /^[0-9]/.test(model)) errors.push('The model name must start with a letter and use only letters and numbers.');
    else if (GLOBALS.has(model) || JS_RESERVED.has(model)) errors.push('"' + model + '" is a built-in JavaScript name: choose another model name.');
    const plural = (spec.plural || '').trim();
    if (plural && !/^[a-z0-9][a-z0-9-]*$/i.test(plural)) errors.push('The plural (used in the URL and as the collection name) may only use letters, numbers and dashes.');
    const c = spec.connection || {};
    if (c.mode === 'uri') {
      if (!/^mongodb(\+srv)?:\/\/\S+$/.test((c.uri || '').trim())) errors.push('Paste a connection string that starts with mongodb:// or mongodb+srv://');
    } else {
      if (!/^[A-Za-z0-9_-]{1,63}$/.test((c.database || '').trim())) errors.push('Enter a database name (letters, numbers, - or _).');
      if (c.mode === 'atlas') {
        if (!(c.user || '').trim() || !c.password) errors.push('Enter the database user and password (Atlas › Database Access).');
        if (!/\.mongodb\.net/i.test(c.host || '') && !/\./.test(c.host || '')) errors.push('Enter your cluster address from Atlas › Connect (it ends in .mongodb.net).');
      }
    }
    const attrs = spec.attributes || [];
    if (!attrs.length) errors.push('Add at least one attribute.');
    const seen = new Set();
    attrs.forEach((a, i) => {
      const n = (a.name || '').trim();
      const where = 'Attribute ' + (i + 1);
      if (!n) errors.push(where + ': enter a name.');
      else if (!IDENT.test(n)) errors.push(where + ' "' + n + '": use letters, numbers and _ only, starting with a letter (e.g. firstName).');
      else if (JS_RESERVED.has(n)) errors.push(where + ' "' + n + '" is a JavaScript keyword: choose another name.');
      else if (SYSTEM_FIELDS.has(n) || (spec.timestamps && (n === 'createdAt' || n === 'updatedAt'))) errors.push(where + ' "' + n + '" is added automatically: remove it.');
      else if (seen.has(n)) errors.push(where + ' "' + n + '" is used twice.');
      seen.add(n);
    });
    return errors;
  }

  const SAMPLE = { String: '"example"', Number: '1', Boolean: 'true', Date: '"2026-01-31"' };

  /* ---------------------------------------------------------------- testing: the requests shown on the page */
  /* three different records to POST, so the collection has some data to read, update and delete */
  function sampleRecords(attrs, Model) {
    const label = n => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
    const modelWords = Model.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return [1, 2, 3].map(i => {
      const o = {};
      attrs.forEach(a => {
        o[a.name] = a.type === 'Number' ? i * 10 : a.type === 'Boolean' ? i % 2 === 1
          : a.type === 'Date' ? '2026-0' + i + '-15'
          : /^(name|title|label)$/i.test(a.name) ? modelWords + ' ' + i : label(a.name) + ' ' + i;
      });
      return o;
    });
  }
  const sampleValue = (a, updated) => a.type === 'Number' ? (updated ? 43 : 42) : a.type === 'Boolean' ? !updated
    : a.type === 'Date' ? (updated ? '2026-02-28' : '2026-01-31') : (updated ? 'Updated ' : 'Example ') + a.name;
  function testPlan({ Model, one, base, P, attrs, host }) {
    /* words for people, not variables: "order item", "an order item", "order items" */
    const words = Model.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    const many = words.replace(/\S+$/, w => pluralize(w));
    const a = (/^[aeiou]/.test(words) ? 'an ' : 'a ') + words;
    one = words;
    const full = {}; attrs.forEach(a => { full[a.name] = sampleValue(a, false); });
    const first = attrs[0], change = { [first.name]: sampleValue(first, true) };
    const req = attrs.filter(a => a.required);
    const num = attrs.find(a => a.type === 'Number');
    const bad = req.length ? {} : num ? { [num.name]: 'not a number' } : null;
    const at = p => base + (p === '/' ? '' : p.replace(':id', '{{id}}'));
    const list = [
      { name: 'Create ' + a, method: 'POST', url: at(P.create), body: full, expect: 201,
        why: 'Saves a new ' + words + ' and sends it back with its new _id. Copy that _id: the next requests use it.' },
      { name: 'List all ' + many, method: 'GET', url: base, expect: 200, why: 'An array with every ' + words + ', including the one you just created.' },
      { name: 'Get one ' + one, method: 'GET', url: base + '/{{id}}', expect: 200, why: 'Only the ' + one + ' whose _id is in the URL.' },
      { name: 'Update the ' + one, method: 'PUT', url: at(P.update), body: change, expect: 200,
        why: 'Send only the fields to change: ' + first.name + ' changes, the other fields stay. The reply is the updated ' + one + '.' },
      bad && { name: 'Create with bad data', method: 'POST', url: at(P.create), body: bad, expect: 400,
        why: req.length ? 'Required fields are missing, so Mongoose refuses it (ValidationError) and nothing is saved.' : 'A value of the wrong type is refused (ValidationError).' },
      { name: 'Get with an invalid id', method: 'GET', url: base + '/abc', expect: 400, why: '"abc" is not a 24-character ObjectId (CastError).' },
      { name: 'Delete the ' + one, method: 'DELETE', url: at(P.remove), expect: 204, why: 'Removes it. 204 means: done, no body.' },
      { name: 'Get the deleted ' + one, method: 'GET', url: base + '/{{id}}', expect: 404, why: 'It is gone, so the API answers ' + Model + ' not found.' }
    ].filter(Boolean);
    return list;
  }


  function build(spec) {
    const errors = validate(spec);
    if (errors.length) return { errors, files: null };
    const Model = pascal(spec.model);
    const plural = ((spec.plural || '').trim() || pluralize(camel(spec.model))).toLowerCase();
    let one = camel(spec.model), many = camel(plural.replace(/-/g, ' '));
    if (TAKEN.has(one) || JS_RESERVED.has(one) || one === many) one = 'item';
    if (TAKEN.has(many) || JS_RESERVED.has(many) || many === one) many = 'items';
    const schemaVar = camel(spec.model) + 'Schema';
    const attrs = spec.attributes.map(a => ({ name: a.name.trim(), type: a.type || 'String', required: !!a.required }));
    const fields = attrs.map(a => a.name).join(', ');
    const classic = spec.routeStyle === 'classic';
    const base = '/api/' + plural;
    const P = { create: classic ? '/add' : '/', update: classic ? '/update/:id' : '/:id', remove: classic ? '/delete/:id' : '/:id' };
    const port = String(spec.port || 3000).replace(/\D/g, '') || '3000';
    const uri = connectionString(spec.connection || {});

    const schemaLines = attrs.map(a => {
      const opts = ['type: ' + a.type];
      if (a.required) opts.push('required: true');
      if (a.type === 'String') opts.push('trim: true');
      return '    ' + a.name + ': { ' + opts.join(', ') + ' }';
    }).join(',\n');

    const route = (method, path, comment, body) => `// ${comment}\nrouter.${method}(${q(path)}, async (req, res) => {\n${body}\n});`;
    const notFound = `    return res.status(404).json({ error: { message: ${q(Model + ' not found.')} } });`;

    const routes = [
      route('get', '/', `GET ${base} -> every ${one} (200)`,
        `  const ${many} = await ${Model}.find();\n  res.json(${many});`),
      classic ? route('post', P.create, `POST ${base}${P.create} -> create a ${one} (201)`,
        `  const { ${fields} } = req.body;\n  const ${one} = await ${Model}.create({ ${fields} });\n  res.status(201).json(${one});`) : null,
      classic ? route('put', P.update, `PUT ${base}${P.update} -> update a ${one}, send back the new version (200)`,
        `  const { ${fields} } = req.body;\n  const ${one} = await ${Model}.findByIdAndUpdate(\n    req.params.id,\n    { ${fields} },\n    { returnDocument: 'after', runValidators: true }   // the updated ${one}; check the schema rules\n  );\n  if (!${one}) {\n${notFound}\n  }\n  res.json(${one});`) : null,
      classic ? route('delete', P.remove, `DELETE ${base}${P.remove} -> remove a ${one} (204)`,
        `  const ${one} = await ${Model}.findByIdAndDelete(req.params.id);\n  if (!${one}) {\n${notFound}\n  }\n  res.status(204).end();`) : null,
      route('get', '/:id', `GET ${base}/:id -> one ${one} (200), or 404`,
        `  const ${one} = await ${Model}.findById(req.params.id);\n  if (!${one}) {\n${notFound}\n  }\n  res.json(${one});`),
      classic ? null : route('post', '/', `POST ${base} -> create a ${one} (201)`,
        `  const { ${fields} } = req.body;   // only the fields we accept\n  const ${one} = await ${Model}.create({ ${fields} });\n  res.status(201).json(${one});`),
      classic ? null : route('put', '/:id', `PUT ${base}/:id -> update a ${one}, send back the new version (200)`,
        `  const { ${fields} } = req.body;   // fields left out stay as they are\n  const ${one} = await ${Model}.findByIdAndUpdate(\n    req.params.id,\n    { ${fields} },\n    { returnDocument: 'after', runValidators: true }   // the updated ${one}; check the schema rules\n  );\n  if (!${one}) {\n${notFound}\n  }\n  res.json(${one});`),
      classic ? null : route('delete', '/:id', `DELETE ${base}/:id -> remove a ${one} (204)`,
        `  const ${one} = await ${Model}.findByIdAndDelete(req.params.id);\n  if (!${one}) {\n${notFound}\n  }\n  res.status(204).end();`)
    ].filter(Boolean).join('\n\n');

    const server = `// ${Model} API: a REST API with Express 5, MongoDB and Mongoose 9
// Generated by apiGen (https://rezaghaeli.github.io/apiGen/)
// Run it:  npm install   then   npm run dev      (the connection string is in .env)
require('dotenv').config({ quiet: true });   // first: reads .env into process.env
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// ---------------------------------------------------------------- the model
// The schema says what every ${one} document must look like
const ${schemaVar} = new mongoose.Schema(
  {
${schemaLines}
  }${spec.timestamps ? ',\n  { timestamps: true }   // adds createdAt and updatedAt' : ''}
);

// The model reads and writes the ${q(plural)} collection
const ${Model} = mongoose.model(${q(Model)}, ${schemaVar}, ${q(plural)});

// ---------------------------------------------------------------- the app
const app = express();
const port = process.env.PORT || ${port};

app.use(cors());           // let a front end on another origin (e.g. a React app) call this API
app.use(express.json());   // reads JSON request bodies into req.body

app.get('/', (req, res) => {
  res.json({ message: ${q('Welcome to the ' + Model + ' API')}, endpoints: ${q(base)} });
});

// ---------------------------------------------------------------- routes: ${base}
const router = express.Router();
${classic ? '// (fixed paths such as /add come before /:id, so ":id" does not catch them)\n' : ''}
${routes}

app.use(${q(base)}, router);   // every route above starts with ${base}

// ---------------------------------------------------------------- errors
// No route matched: 404
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// The error handler (4 parameters): every error ends up here, as JSON.
// Express 5 sends errors thrown in async routes here by itself.
app.use((err, req, res, next) => {
  if (err.name === 'CastError') {
    return res.status(400).json({ error: { message: 'Invalid ' + err.path + ': ' + err.value } });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: { message: err.message } });
  }
  if ((err.status || 500) >= 500) console.error(err);
  res.status(err.status || 500).json({ error: { message: err.message } });
});

// ---------------------------------------------------------------- start
// Connect to MongoDB first; only then start listening for requests
async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    app.listen(port, () => {
      console.log(${q(Model + ' API listening on http://localhost:')} + port);
    });
  } catch (err) {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  }
}

start();
`;

    const pkgName = kebab(Model) + '-api';
    const pkg = JSON.stringify({
      name: pkgName, version: '1.0.0', description: Model + ' REST API (Express, MongoDB, Mongoose), generated by apiGen',
      main: 'server.js', scripts: { start: 'node server.js', dev: 'node --watch server.js' },
      engines: { node: '>=20' },
      dependencies: { cors: '^2.8.5', dotenv: '^17.2.0', express: '^5.1.0', mongoose: '^9.0.0' }
    }, null, 2) + '\n';

    const env = `# Settings for server.js, read by dotenv. This file holds your password:
# keep it private and never commit it (.gitignore already excludes it).
MONGODB_URI=${uri}
PORT=${port}
`;
    const envExample = `# Copy this file to .env and fill in your own values.
MONGODB_URI=${(spec.connection || {}).mode === 'local' ? uri : 'mongodb+srv://<user>:<password>@<cluster-address>/' + ((spec.connection || {}).database || '<database>') + '?retryWrites=true&w=majority'}
PORT=${port}
`;
    const gitignore = 'node_modules/\n.env\n.DS_Store\n';

    const sample = '{ ' + attrs.map(a => '"' + a.name + '": ' + SAMPLE[a.type]).join(', ') + ' }';
    const host = 'http://localhost:' + port;
    const readme = `# ${Model} API

A REST API for **${plural}**, built with Express 5, MongoDB and Mongoose 9. Generated by [apiGen](https://rezaghaeli.github.io/apiGen/).

## Run it

1. Install Node.js 20 or newer.
2. Check \`.env\`: \`MONGODB_URI\` is your connection string${(spec.connection || {}).mode === 'local' ? ' (a local MongoDB must be running)' : ' (in Atlas, also allow your IP address under Network Access)'}.
3. In this folder:

\`\`\`
npm install
npm run dev
\`\`\`

You should see \`Connected to MongoDB\` and \`${Model} API listening on ${host}\`.

## Endpoints

| Method | Path | Does | Success | Errors |
|---|---|---|---|---|
| GET | \`${base}\` | every ${one} | 200 | |
| GET | \`${base}/:id\` | one ${one} | 200 | 404 not found, 400 bad id |
| POST | \`${base}${P.create === '/' ? '' : P.create}\` | create a ${one} | 201 + the ${one} | 400 invalid data |
| PUT | \`${base}${P.update.replace(/^\//, '/')}\` | update a ${one} (send only the fields to change) | 200 + the updated ${one} | 404, 400 |
| DELETE | \`${base}${P.remove}\` | delete a ${one} | 204 | 404, 400 |

Errors come back as JSON: \`{ "error": { "message": "..." } }\`.

## Sample data

To add some ${plural}, send **POST** \`${host}${base}${P.create === '/' ? '' : P.create}\` once with each body below
(in an API tester: Body › raw › JSON). Each one answers 201 with the saved ${one} and its \`_id\`.

${sampleRecords(attrs, Model).map((r, i) => 'Sample ' + (i + 1) + ':\n\n\`\`\`json\n' + JSON.stringify(r, null, 2) + '\n\`\`\`').join('\n\n')}

## Try it (curl, or any API tester such as Thunder Client)

\`\`\`
curl ${host}${base}
curl -X POST ${host}${base}${P.create === '/' ? '' : P.create} -H "Content-Type: application/json" -d '${sample}'
curl ${host}${base}/<an _id from the list>
curl -X PUT ${host}${base}${P.update.replace(':id', '<_id>')} -H "Content-Type: application/json" -d '{ "${attrs[0].name}": ${SAMPLE[attrs[0].type]} }'
curl -X DELETE ${host}${base}${P.remove.replace(':id', '<_id>')}
\`\`\`

## Deploy (for example on Render)

Push the folder to GitHub (\`.env\` is not included), create a Web Service with build command \`npm install\` and start command \`npm start\`, and add \`MONGODB_URI\` as an environment variable. In Atlas › Network Access, allow \`0.0.0.0/0\`.
`;
    const tests = testPlan({ Model, one, base, P, attrs, host });
    const samples = sampleRecords(attrs, Model);
    const files = { 'server.js': server, '.env': env, '.env.example': envExample, 'package.json': pkg, '.gitignore': gitignore, 'README.md': readme };
    return { errors: [], files, folder: pkgName, plural, tests, host, samples, createUrl: host + base + (P.create === '/' ? '' : P.create) };
  }

  return { build, pluralize, connectionString, validate, pascal, testPlan };
})();

if (typeof module !== 'undefined') module.exports = ApiGen;

/* ==================================================================== the page */
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const attributesContainer = $('attributesContainer');
  const messageDiv = $('message');
  const output = $('generatedCode');
  let project = null, current = 'server.js', pluralTouched = false;

  function showMessage(msg, type = 'success', keep) {
    messageDiv.textContent = msg;
    messageDiv.className = 'text-center text-sm font-medium mb-4 min-h-5 whitespace-pre-line ' + (type === 'success' ? 'text-green-700' : 'text-red-700');
    clearTimeout(showMessage.t);
    if (!keep) showMessage.t = setTimeout(() => { messageDiv.textContent = ''; }, 4000);
  }

  function addAttributeRow(name = '', type = 'String', required = true) {
    const row = document.createElement('div');
    row.className = 'attribute-row flex flex-col sm:flex-row gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200';
    row.innerHTML = `
      <input type="text" placeholder="Attribute name (e.g., price)" aria-label="Attribute name"
             class="attribute-name flex-1 shadow-sm appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-1 focus:ring-indigo-400">
      <select class="attribute-type flex-none w-full sm:w-auto py-2 px-3 border border-gray-300 bg-white rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="Attribute type">
        <option value="String">String</option><option value="Number">Number</option>
        <option value="Boolean">Boolean</option><option value="Date">Date</option>
      </select>
      <label class="flex items-center text-gray-700 text-sm">
        <input type="checkbox" class="attribute-required form-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 mr-2">Required
      </label>
      <button type="button" class="remove-attribute-btn flex-none bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg shadow-sm transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">Remove</button>`;
    row.querySelector('.attribute-name').value = name;
    row.querySelector('.attribute-type').value = type;
    row.querySelector('.attribute-required').checked = required;
    row.querySelector('.remove-attribute-btn').addEventListener('click', () => row.remove());
    attributesContainer.appendChild(row);
  }

  function mode() { return document.querySelector('input[name="dbMode"]:checked').value; }
  function showMode() {
    const m = mode();
    $('atlasFields').hidden = m !== 'atlas';
    $('uriFields').hidden = m !== 'uri';
    $('databaseField').hidden = m === 'uri';
  }

  function spec() {
    return {
      model: $('modelName').value,
      plural: $('pluralName').value,
      port: $('port').value,
      routeStyle: $('routeStyle').value,
      timestamps: $('timestamps').checked,
      connection: { mode: mode(), user: $('mongoUserId').value, password: $('mongoPassword').value, host: $('mongoUri').value,
        database: $('mongoDatabaseName').value, uri: $('mongoFullUri').value },
      attributes: [...attributesContainer.querySelectorAll('.attribute-row')].map(r => ({
        name: r.querySelector('.attribute-name').value, type: r.querySelector('.attribute-type').value,
        required: r.querySelector('.attribute-required').checked }))
    };
  }

  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const METHOD_COLOUR = { GET: 'bg-green-600', POST: 'bg-amber-600', PUT: 'bg-blue-700', DELETE: 'bg-red-600' };
  function renderTabs() {
    $('fileTabs').innerHTML = Object.keys(project.files).map(f =>
      `<button type="button" class="file-tab" role="tab" data-file="${esc(f)}">${esc(f)}</button>`).join('');
    document.querySelectorAll('.file-tab').forEach(t => t.addEventListener('click', () => showFile(t.dataset.file)));
    if (!project.files[current]) current = 'server.js';
  }
  function renderTests() {
    $('testList').innerHTML = project.tests.map((t, i) => {
      const url = project.host + t.url.replace(/\{\{id\}\}/g, '<id>');
      const ok = t.expect < 300;
      return `<div class="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <span class="text-gray-500 font-semibold">${i + 1}.</span>
          <span class="${METHOD_COLOUR[t.method]} text-white text-xs font-bold px-2 py-1 rounded">${t.method}</span>
          <code class="text-sm break-all">${esc(url)}</code>
          <span class="ml-auto text-xs font-bold px-2 py-1 rounded ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">expect ${t.expect}</span>
        </div>
        <p class="text-sm text-gray-700"><strong>${esc(t.name)}.</strong> ${esc(t.why)}</p>
        ${t.body ? `<pre class="mt-2 text-sm bg-white border border-gray-200 rounded p-2 overflow-x-auto">${esc(JSON.stringify(t.body, null, 2))}</pre>` : ''}
      </div>`;
    }).join('');
    $('sampleUrl').textContent = project.createUrl;
    $('sampleList').innerHTML = project.samples.map((r, i) => `<div class="bg-white border border-gray-200 rounded-lg">
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 text-sm text-gray-600">
          <span>Sample ${i + 1}</span>
          <button type="button" class="copy-sample text-indigo-600 hover:text-indigo-800 font-semibold" data-i="${i}">Copy</button>
        </div>
        <pre class="text-sm p-3 overflow-x-auto">${esc(JSON.stringify(r, null, 2))}</pre>
      </div>`).join('');
    document.querySelectorAll('.copy-sample').forEach(b => b.addEventListener('click', async () => {
      const text = JSON.stringify(project.samples[+b.dataset.i], null, 2);
      try { await navigator.clipboard.writeText(text); } catch (e) {
        const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      }
      b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    }));
    $('testSection').hidden = false;
  }

  function showFile(name) {
    current = name;
    output.value = project ? project.files[name] : '';
    document.querySelectorAll('.file-tab').forEach(t => {
      const on = t.dataset.file === name;
      t.setAttribute('aria-selected', on);
      t.className = 'file-tab px-3 py-1.5 rounded-t-lg text-sm font-mono border border-b-0 ' + (on ? 'bg-gray-50 text-indigo-700 font-semibold border-gray-300' : 'bg-white text-gray-600 border-transparent hover:text-indigo-600');
    });
  }

  $('modelName').addEventListener('input', () => {
    if (!pluralTouched) { const p = ApiGen.pascal($('modelName').value); $('pluralName').value = p ? ApiGen.pluralize(p.charAt(0).toLowerCase() + p.slice(1)).toLowerCase() : ''; }
    pluralHint();
  });
  $('pluralName').addEventListener('input', () => { pluralTouched = $('pluralName').value.trim() !== ''; pluralHint(); });
  function pluralHint() {
    const p = $('pluralName').value.trim().toLowerCase();
    const show = p ? '<code>/api/' + esc(p) + '</code> and the collection <code>' + esc(p) + '</code>' : 'the URL <code>/api/&lt;plural&gt;</code> and as the collection name';
    $('pluralHint').innerHTML = 'Filled in for you; change it if needed. Used in ' + show + '.';
  }
  document.querySelectorAll('input[name="dbMode"]').forEach(r => r.addEventListener('change', showMode));
  $('addAttributeBtn').addEventListener('click', () => addAttributeRow());

  $('generateCodeBtn').addEventListener('click', () => {
    const r = ApiGen.build(spec());
    if (r.errors.length) { showMessage(r.errors.join('\n'), 'error', true); return; }
    project = r;
    $('outputSection').hidden = false;
    renderTabs();
    showFile(current);
    renderTests();
    showMessage('Project generated: ' + Object.keys(r.files).length + ' files. Download it as a .zip, or copy the files one by one. How to test it is below.');
  });

  $('copyCodeBtn').addEventListener('click', async () => {
    if (!project) return;
    try { await navigator.clipboard.writeText(output.value); }
    catch (e) { output.select(); document.execCommand('copy'); }
    showMessage(current + ' copied to the clipboard.');
  });

  $('downloadZipBtn').addEventListener('click', async () => {
    if (!project) return;
    if (typeof JSZip === 'undefined') { showMessage('The .zip library did not load: copy the files one by one instead.', 'error'); return; }
    const zip = new JSZip();
    const dir = zip.folder(project.folder);
    for (const [name, text] of Object.entries(project.files)) dir.file(name, text);
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = project.folder + '.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showMessage('Downloaded ' + project.folder + '.zip. Unzip it, then run npm install and npm run dev.');
  });

  document.addEventListener('DOMContentLoaded', () => {
    addAttributeRow();
    showMode();
  });
}

// Checks a CycloneDX BOM in the browser: the official 1.7 schema, a JSF signature on the document, and the
// dependency graph. Nothing leaves the page. A valid signature proves the file matches the key embedded in it;
// it does not prove who holds that key, so the result always shows the key thumbprint to compare with the
// supplier's published one.
import {createValidator} from './json-schema.js';

const MAX_GRAPH_NODES = 500;
const MAX_LINKS = 100;
const text = (value, limit = 300) => typeof value === 'string' ? value.slice(0, limit) : '';

// RFC 8785 JSON Canonicalization Scheme. Keys sort by UTF-16 code units, which is JavaScript's default string
// order, and JSON.stringify already serializes numbers and strings the way RFC 8785 requires.
export function jcs(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON cannot carry this number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
}

const fromBase64Url = value => {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};
const toBase64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const ALGORITHMS = {
  ES256:{name:'ECDSA', namedCurve:'P-256', hash:'SHA-256'}, ES384:{name:'ECDSA', namedCurve:'P-384', hash:'SHA-384'}, ES512:{name:'ECDSA', namedCurve:'P-521', hash:'SHA-512'},
  RS256:{name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, RS384:{name:'RSASSA-PKCS1-v1_5', hash:'SHA-384'}, RS512:{name:'RSASSA-PKCS1-v1_5', hash:'SHA-512'},
  PS256:{name:'RSA-PSS', hash:'SHA-256', saltLength:32}, PS384:{name:'RSA-PSS', hash:'SHA-384', saltLength:48}, PS512:{name:'RSA-PSS', hash:'SHA-512', saltLength:64},
  Ed25519:{name:'Ed25519'}
};
const PUBLIC_MEMBERS = {EC:['crv', 'kty', 'x', 'y'], RSA:['e', 'kty', 'n'], OKP:['crv', 'kty', 'x']};

// RFC 7638 thumbprint: SHA-256 over the required public members in lexicographic order.
export async function jwkThumbprint(jwk) {
  const members = PUBLIC_MEMBERS[jwk?.kty];
  if (!members || members.some(member => typeof jwk[member] !== 'string')) throw new Error('The embedded key is incomplete.');
  const canonical = jcs(Object.fromEntries(members.map(member => [member, jwk[member]])));
  return toBase64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
}

export async function verifyJsfSignature(doc) {
  const signature = doc?.signature;
  const nested = countNestedSignatures(doc);
  const nestedNote = nested ? ` ${nested} signature(s) inside components, services, or other records were not checked.` : '';
  if (!signature) return {status:'unsigned', summary:`No signature on the BOM document.${nestedNote}`};
  if (signature.signers || signature.chain) return {status:'unsupported', summary:`Multiple signers or a signature chain is present; this check covers single signatures only.${nestedNote}`};
  const algorithm = ALGORITHMS[signature.algorithm];
  if (!algorithm) return {status:'unsupported', algorithm:text(signature.algorithm, 60), summary:`Algorithm ${text(signature.algorithm, 60) || 'not stated'} is not supported by this check.${nestedNote}`};
  if (!signature.publicKey) return {status:'unsupported', algorithm:signature.algorithm, summary:`The signature names no embedded public key${signature.certificatePath ? ' (it carries a certificate path, which this check does not parse)' : ''}, so it cannot be verified here.${nestedNote}`};
  let thumbprint, key;
  try {
    thumbprint = await jwkThumbprint(signature.publicKey);
    const jwk = Object.fromEntries(PUBLIC_MEMBERS[signature.publicKey.kty].map(member => [member, signature.publicKey[member]]));
    key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
  } catch {
    return {status:'invalid', algorithm:signature.algorithm, summary:`The embedded public key cannot be used with ${signature.algorithm}.${nestedNote}`};
  }
  // JSF signs the whole object with the signature in place, minus its value, the excludes list itself, and the
  // properties that list names (JSF 0.82, as quoted in the bundled jsf-0.82 schema).
  const signed = structuredClone(doc);
  const {value, excludes: excludeList, ...covered} = signature;
  signed.signature = covered;
  for (const name of Array.isArray(signature.excludes) ? signature.excludes : []) if (name !== 'signature') delete signed[name];
  let ok = false;
  try { ok = await crypto.subtle.verify(algorithm, key, fromBase64Url(value), new TextEncoder().encode(jcs(signed))); }
  catch { ok = false; }
  const excludes = Array.isArray(signature.excludes) && signature.excludes.length ? ` Properties left out of the signature: ${signature.excludes.map(name => text(name, 60)).join(', ')}.` : '';
  return ok
    ? {status:'valid', algorithm:signature.algorithm, thumbprint, summary:`Signature valid with the key embedded in the BOM (${signature.algorithm}, key thumbprint ${thumbprint}). Compare the thumbprint with the supplier's published key before relying on it.${excludes}${nestedNote}`}
    : {status:'invalid', algorithm:signature.algorithm, thumbprint, summary:`Signature does not match the BOM contents (${signature.algorithm}, key thumbprint ${thumbprint}). The file changed after signing, or the signature is wrong.${nestedNote}`};
}

function countNestedSignatures(doc) {
  let count = 0;
  const walk = (value, top) => {
    if (Array.isArray(value)) return value.forEach(item => walk(item, false));
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'signature' && !top) count++;
      else walk(item, false);
    }
  };
  walk(doc, true);
  return count;
}

// Keeps which component depends on or provides which, with names and types, so the review can follow a
// cryptographic asset back to the components that bring it in.
export function dependencyGraph(doc) {
  const components = new Map();
  const visit = item => {
    if (!item || typeof item !== 'object') return;
    if (typeof item['bom-ref'] === 'string') components.set(item['bom-ref'], {name:text(item.name, 200), type:text(item.type, 40), version:text(item.version, 80)});
    if (Array.isArray(item.components)) item.components.forEach(visit);
  };
  visit(doc?.metadata?.component);
  (Array.isArray(doc?.components) ? doc.components : []).forEach(visit);
  const refs = list => (Array.isArray(list) ? list : []).filter(ref => typeof ref === 'string').slice(0, MAX_LINKS).map(ref => text(ref));
  const entries = (Array.isArray(doc?.dependencies) ? doc.dependencies : []).filter(entry => typeof entry?.ref === 'string');
  const describe = ref => components.get(ref) || {name:'', type:'', version:''};
  const nodes = entries.slice(0, MAX_GRAPH_NODES).map(entry => ({ref:text(entry.ref), ...describe(entry.ref), dependsOn:refs(entry.dependsOn), provides:refs(entry.provides)}));
  // Assets that only appear as targets still get a node, so the review can name them.
  const listed = new Set(nodes.map(node => node.ref));
  for (const ref of nodes.flatMap(node => [...node.dependsOn, ...node.provides])) {
    if (listed.has(ref) || nodes.length >= MAX_GRAPH_NODES) continue;
    listed.add(ref);
    nodes.push({ref, ...describe(ref), dependsOn:[], provides:[]});
  }
  return {nodes, truncated:entries.length > MAX_GRAPH_NODES, unknownRefs:[...listed].filter(ref => !components.has(ref)).slice(0, 20)};
}

// One sentence for the BOM record; the full graph stays in the record's graph list.
export function graphSummary(graph) {
  if (!graph.nodes.length) return 'The BOM has no dependency entries.';
  const assets = graph.nodes.filter(node => node.type === 'cryptographic-asset').length;
  const unknown = graph.unknownRefs.length ? ` ${graph.unknownRefs.length} reference(s) point at nothing listed in the BOM: ${graph.unknownRefs.slice(0, 5).join(', ')}.` : '';
  return `Dependency graph kept: ${graph.nodes.length} entries, ${assets} cryptographic asset(s).${graph.truncated ? ' Only the first 500 entries were kept.' : ''}${unknown}`;
}

let validatorPromise;
async function bomValidator() {
  validatorPromise ||= import('./schema/cyclonedx-1.7.js').then(({default:schemas}) => createValidator(schemas.bom, schemas.related));
  return validatorPromise;
}

export async function checkCycloneDx(doc, {validator} = {}) {
  const validate = validator || await bomValidator();
  const errors = validate(doc, {maxErrors:20});
  const declared = text(doc?.specVersion, 10) || 'not stated';
  const versionNote = declared === '1.7' ? '' : ` The BOM declares version ${declared}, so some differences may come from the version rather than the file.`;
  const schema = {valid:!errors.length, errors:errors.slice(0, 5), summary:errors.length
    ? `Fails the CycloneDX 1.7 schema: ${errors.length >= 20 ? '20 or more' : errors.length} problem(s). First: ${errors[0].path} ${errors[0].message}.${versionNote}`
    : `Passes the CycloneDX 1.7 schema.${versionNote}`};
  const signature = await verifyJsfSignature(doc);
  const graph = dependencyGraph(doc);
  return {schema, signature, graph};
}

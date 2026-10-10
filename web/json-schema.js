// A JSON Schema draft-07 validator that interprets the schema directly. Common validators compile schemas
// into generated code at run time, which the page's Content-Security-Policy forbids. This one covers the
// keywords the CycloneDX 1.7 schema uses plus the rest of draft-07's validation vocabulary. Formats match
// the bundled Python check in test/cyclonedx_schema.py: date, idn-email, date-time (RFC 3339), and uri
// (scheme required). iri-reference is not checked by either.

const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const hasType = (value, type) => type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
  : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeOf(value) === type;
const codePoints = value => [...value].length;
const pointerPart = part => part.replace(/~1/g, '/').replace(/~0/g, '~');
const escapePath = part => String(part).replace(/~/g, '~0').replace(/\//g, '~1');

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  if (a && typeof a === 'object') {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

const regexCache = new Map();
function regex(pattern) {
  if (!regexCache.has(pattern)) {
    let compiled;
    try { compiled = new RegExp(pattern, 'u'); } catch { compiled = new RegExp(pattern); }
    regexCache.set(pattern, compiled);
  }
  return regexCache.get(pattern);
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  // setUTCFullYear avoids Date.UTC mapping years 0-99 to 1900-1999. Year 0 is refused, as Python's date() does.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return year >= 1 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function validDateTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !validDate(match[1])) return false;
  const [hour, minute, second] = match.slice(2, 5).map(Number);
  const offsetOk = match[5] === undefined || (Number(match[5]) < 24 && Number(match[6]) < 60);
  return hour < 24 && minute < 60 && second <= 60 && offsetOk;
}
// An absolute URI needs a scheme. JSF's algorithm field depends on this: "ES256" must fail the URI branch of
// its oneOf, or every standard algorithm name would match both branches and fail the schema.
const validUri = value => /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/.test(value);
const FORMATS = {date:validDate, 'date-time':validDateTime, 'idn-email':value => value.includes('@'), uri:validUri};

// Documents are matched by the file name at the end of their $id, so "spdx.schema.json" and
// "http://cyclonedx.org/schema/spdx.schema.json" find the same bundled file. Nothing is fetched.
const fileName = uri => String(uri).split('#')[0].split('/').pop();

export function createValidator(root, related = []) {
  const documents = new Map([root, ...related].map(document => [fileName(document.$id || ''), document]));
  const resolve = (ref, base) => {
    const [target, pointer = ''] = ref.split('#');
    const document = target ? documents.get(fileName(target)) : base;
    if (!document) throw new Error(`External schema reference ${ref} is not supported.`);
    const schema = pointer.split('/').filter(Boolean).map(pointerPart).reduce((node, part) => {
      if (!node || !Object.hasOwn(node, part)) throw new Error(`Schema reference ${ref} does not resolve.`);
      return node[part];
    }, document);
    return {schema, document};
  };

  // base is the document the current schema came from, so its own "#/..." references resolve inside it.
  function check(schema, value, path, errors, limit, base = root) {
    if (errors.length >= limit) return;
    if (schema === true || schema === undefined) return;
    if (schema === false) { errors.push({path, message:'is not allowed here'}); return; }
    const fail = message => { if (errors.length < limit) errors.push({path, message}); };
    // In draft-07 a $ref replaces every sibling keyword.
    if (schema.$ref !== undefined) {
      const target = resolve(schema.$ref, base);
      return check(target.schema, value, path, errors, limit, target.document);
    }
    const sub = (child, childValue, childPath = path) => check(child, childValue, childPath, errors, limit, base);
    const passes = (child, childValue) => passesIn(child, childValue, base);

    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(type => hasType(value, type))) return fail(`should be ${types.join(' or ')}`);
    }
    if (schema.enum !== undefined && !schema.enum.some(option => deepEqual(option, value))) fail('is not one of the allowed values');
    if (schema.const !== undefined && !deepEqual(schema.const, value)) fail('does not equal the required value');

    if (typeof value === 'string') {
      if (schema.minLength !== undefined && codePoints(value) < schema.minLength) fail(`should have at least ${schema.minLength} characters`);
      if (schema.maxLength !== undefined && codePoints(value) > schema.maxLength) fail(`should have at most ${schema.maxLength} characters`);
      if (schema.pattern !== undefined && !regex(schema.pattern).test(value)) fail('does not match the required pattern');
      if (schema.format !== undefined && FORMATS[schema.format] && !FORMATS[schema.format](value)) fail(`is not a valid ${schema.format}`);
    }
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) fail(`should be at least ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) fail(`should be at most ${schema.maximum}`);
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail(`should be more than ${schema.exclusiveMinimum}`);
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail(`should be less than ${schema.exclusiveMaximum}`);
      if (schema.multipleOf !== undefined && !Number.isInteger(value / schema.multipleOf)) fail(`should be a multiple of ${schema.multipleOf}`);
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) fail(`should have at least ${schema.minItems} items`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`should have at most ${schema.maxItems} items`);
      if (schema.uniqueItems && value.some((item, index) => value.findIndex(other => deepEqual(item, other)) !== index)) fail('should not contain duplicate items');
      if (Array.isArray(schema.items)) {
        schema.items.forEach((itemSchema, index) => { if (index < value.length) sub(itemSchema, value[index], `${path}/${index}`); });
        if (schema.additionalItems !== undefined) value.slice(schema.items.length).forEach((item, offset) => sub(schema.additionalItems, item, `${path}/${schema.items.length + offset}`));
      } else if (schema.items !== undefined) value.forEach((item, index) => sub(schema.items, item, `${path}/${index}`));
      if (schema.contains !== undefined && !value.some(item => passes(schema.contains, item))) fail('does not contain a required item');
    }
    if (typeOf(value) === 'object') {
      const keys = Object.keys(value);
      if (schema.required) for (const key of schema.required) if (!Object.hasOwn(value, key)) fail(`is missing required property ${key}`);
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) fail(`should have at least ${schema.minProperties} properties`);
      if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) fail(`should have at most ${schema.maxProperties} properties`);
      const properties = schema.properties || {}, patterns = Object.entries(schema.patternProperties || {});
      for (const key of keys) {
        const childPath = `${path}/${escapePath(key)}`;
        let matched = false;
        if (Object.hasOwn(properties, key)) { matched = true; sub(properties[key], value[key], childPath); }
        for (const [pattern, patternSchema] of patterns) if (regex(pattern).test(key)) { matched = true; sub(patternSchema, value[key], childPath); }
        if (!matched && schema.additionalProperties !== undefined) {
          if (schema.additionalProperties === false) fail(`has unexpected property ${key}`);
          else sub(schema.additionalProperties, value[key], childPath);
        }
        if (schema.propertyNames !== undefined && !passes(schema.propertyNames, key)) fail(`has a property name that is not allowed: ${key}`);
      }
      for (const [key, dependency] of Object.entries(schema.dependencies || {})) {
        if (!Object.hasOwn(value, key)) continue;
        if (Array.isArray(dependency)) { for (const needed of dependency) if (!Object.hasOwn(value, needed)) fail(`needs property ${needed} when ${key} is present`); }
        else sub(dependency, value, path);
      }
    }

    if (schema.allOf) schema.allOf.forEach(part => sub(part, value, path));
    if (schema.anyOf && !schema.anyOf.some(part => passes(part, value))) fail('does not match any allowed form');
    if (schema.oneOf) {
      const count = schema.oneOf.filter(part => passes(part, value)).length;
      if (count !== 1) fail(count ? 'matches more than one allowed form' : 'does not match any allowed form');
    }
    if (schema.not !== undefined && passes(schema.not, value)) fail('matches a form that is not allowed');
    if (schema.if !== undefined) {
      if (passes(schema.if, value)) { if (schema.then !== undefined) sub(schema.then, value, path); }
      else if (schema.else !== undefined) sub(schema.else, value, path);
    }
  }

  function passesIn(schema, value, base) {
    const errors = [];
    check(schema, value, '', errors, 1, base);
    return errors.length === 0;
  }

  return (value, {maxErrors = 50} = {}) => {
    const errors = [];
    check(root, value, '', errors, maxErrors);
    return errors.map(error => ({path:error.path || '/', message:error.message}));
  };
}

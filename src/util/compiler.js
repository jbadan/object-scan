/* compile needles to hierarchical map object */
const parser = require('./parser');

const defineProperty = (target, k, v) => Object.defineProperty(target, k, { value: v, writable: false });

const MATCH_TYPE = Symbol('match-type');
const setMatchType = (input, included) => defineProperty(input, MATCH_TYPE, included);
const isMatch = input => input[MATCH_TYPE] !== undefined;
const isIncludedMatch = input => input !== undefined && input[MATCH_TYPE] === true;
module.exports.isMatch = isMatch;
module.exports.isIncludedMatch = isIncludedMatch;

const HAS_INCLUDES = Symbol('has-includes');
const setHasIncludes = input => defineProperty(input, HAS_INCLUDES, true);
const hasIncludes = input => input[HAS_INCLUDES] === true;
module.exports.hasIncludes = hasIncludes;

const NEEDLE = Symbol('needle');
const setNeedle = (input, needle) => defineProperty(input, NEEDLE, needle);
const getNeedle = input => (input[NEEDLE] === undefined ? null : input[NEEDLE]);
module.exports.getNeedle = getNeedle;

const NEEDLES = Symbol('needles');
const addNeedle = (input, needle) => {
  if (input[NEEDLES] === undefined) {
    defineProperty(input, NEEDLES, new Set());
  }
  input[NEEDLES].add(needle);
};
const getNeedles = input => [...input[NEEDLES]];
module.exports.getNeedles = getNeedles;

const WILDCARD_REGEX = Symbol('wildcard-regex');
const setWildcardRegex = (input, wildcard) => {
  defineProperty(input, WILDCARD_REGEX, new RegExp(`^${wildcard
    .split(/(?<!\\)(?:\\\\)*\*/)
    .map(p => p.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'))
    .join('.*')}$`));
};
const getWildcardRegex = input => input[WILDCARD_REGEX];
module.exports.getWildcardRegex = getWildcardRegex;

const RECURSION_TRIGGERS = Symbol('recursion-triggers');
const addRecursionTrigger = (input, trigger) => {
  if (input[RECURSION_TRIGGERS] === undefined) {
    defineProperty(input, RECURSION_TRIGGERS, new Set());
  }
  input[RECURSION_TRIGGERS].add(trigger);
};
const isRecursionTrigger = (input, trigger) => (
  input[RECURSION_TRIGGERS] !== undefined
  && input[RECURSION_TRIGGERS].has(trigger)
);
module.exports.isRecursionTrigger = isRecursionTrigger;

const RECURSIVE = Symbol('recursive');
const markRecursive = input => defineProperty(input, RECURSIVE, true);
const isRecursive = input => input[RECURSIVE] === true;
module.exports.isRecursive = isRecursive;

module.exports.getMeta = (inputs, parents = null) => ({
  isMatch: inputs.some(e => isMatch(e)),
  matchedBy: Array.from(inputs.reduce((p, e) => {
    const needle = getNeedle(e);
    if (needle !== null) {
      p.add(needle);
    }
    return p;
  }, new Set())),
  traversedBy: Array.from(inputs.reduce((p, e) => {
    getNeedles(e).forEach(n => p.add(n));
    return p;
  }, new Set())),
  parents
});

const addRecursionTriggersRec = (root, tower) => {
  const towerValues = Object.values(tower);
  if (towerValues.length !== 0) {
    addRecursionTrigger(root, towerValues[towerValues.length - 1]);
    towerValues.forEach(v => addRecursionTriggersRec(root, v));
  }
};

const buildRecursive = (tower, path, needle, excluded = false) => {
  addNeedle(tower, needle);
  if (!excluded) {
    setHasIncludes(tower);
  }
  if (path.length === 0) {
    if (tower[NEEDLE] !== undefined) {
      throw new Error(`Redundant Needle Target: "${tower[NEEDLE]}" vs "${needle}"`);
    }
    setNeedle(tower, needle);
    setMatchType(tower, !excluded);
    return;
  }
  if (Array.isArray(path[0])) {
    buildRecursive(tower, [...path[0], ...path.slice(1)], needle, excluded);
    return;
  }
  if (path[0] instanceof Set) {
    path[0].forEach(c => buildRecursive(tower, [c, ...path.slice(1)], needle, excluded));
    return;
  }
  if (tower[path[0]] === undefined) {
    Object.assign(tower, { [path[0]]: {} });
    setWildcardRegex(tower[path[0]], path[0]);
  }
  if (String(path[0]) === '**') {
    markRecursive(tower[path[0]]);
    addRecursionTriggersRec(tower[path[0]], tower[path[0]]);
  }
  if (excluded && path[0].isExcluded()) {
    throw new Error(`Redundant Exclusion: "${needle}"`);
  }
  buildRecursive(tower[path[0]], path.slice(1), needle, excluded || path[0].isExcluded());
};

module.exports.compile = (needles) => {
  const tower = {};
  needles.forEach(needle => buildRecursive(tower, [parser(needle)], needle));
  return tower;
};
